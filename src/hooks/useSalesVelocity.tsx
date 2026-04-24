import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SalesVelocity {
  productId: string;
  totalSold: number;        // unidades vendidas no período analisado
  daysAnalyzed: number;     // dias considerados (padrão 60)
  unitsPerDay: number;      // velocidade média (un/dia)
  daysRemaining: number | null; // estoque atual / unitsPerDay (null = sem vendas)
  estimatedEndDate: Date | null;
  status: 'critical' | 'warning' | 'ok' | 'no_sales' | 'out_of_stock';
}

interface Options {
  daysWindow?: number;   // janela de análise (padrão 60 dias)
  warningDays?: number;  // alerta amarelo (padrão 14)
  criticalDays?: number; // alerta vermelho (padrão 7)
}

/**
 * Calcula a velocidade média de saída de cada produto a partir do histórico
 * de pedidos pagos/enviados/entregues e estima quantos dias o estoque vai durar.
 */
export function useSalesVelocity(opts: Options = {}) {
  const { daysWindow = 60, warningDays = 14, criticalDays = 7 } = opts;
  const [velocities, setVelocities] = useState<Record<string, SalesVelocity>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - daysWindow);

    // 1. Buscar pedidos não cancelados no período
    const { data: orders } = await supabase
      .from('orders')
      .select('id, created_at, status')
      .gte('created_at', since.toISOString())
      .in('status', ['em_preparo', 'enviado', 'entregado', 'retirado']);

    const orderIds = (orders ?? []).map((o) => o.id);
    if (orderIds.length === 0) {
      setVelocities({});
      setLoading(false);
      return;
    }

    // 2. Buscar itens desses pedidos
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, quantity, order_id')
      .in('order_id', orderIds);

    // 3. Buscar estoque atual de todos os produtos vendidos
    const productIds = Array.from(new Set((items ?? []).map((i) => i.product_id)));
    const { data: products } = await supabase
      .from('products')
      .select('id, stock')
      .in('id', productIds.length > 0 ? productIds : ['00000000-0000-0000-0000-000000000000']);

    const stockMap = new Map((products ?? []).map((p) => [p.id, p.stock]));

    // 4. Agregar quantidades vendidas por produto
    const soldMap = new Map<string, number>();
    (items ?? []).forEach((it) => {
      soldMap.set(it.product_id, (soldMap.get(it.product_id) ?? 0) + Number(it.quantity));
    });

    // 5. Calcular velocidade e previsão para cada produto
    const result: Record<string, SalesVelocity> = {};
    soldMap.forEach((totalSold, productId) => {
      const stock = stockMap.get(productId) ?? 0;
      const unitsPerDay = totalSold / daysWindow;
      const daysRemaining = unitsPerDay > 0 ? stock / unitsPerDay : null;

      let status: SalesVelocity['status'] = 'ok';
      if (stock <= 0) status = 'out_of_stock';
      else if (daysRemaining === null) status = 'no_sales';
      else if (daysRemaining <= criticalDays) status = 'critical';
      else if (daysRemaining <= warningDays) status = 'warning';

      const estimatedEndDate =
        daysRemaining !== null
          ? new Date(Date.now() + daysRemaining * 86400000)
          : null;

      result[productId] = {
        productId,
        totalSold,
        daysAnalyzed: daysWindow,
        unitsPerDay,
        daysRemaining,
        estimatedEndDate,
        status,
      };
    });

    setVelocities(result);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [daysWindow]);

  return { velocities, loading, reload: load };
}
