import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, PackageX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface IncompleteSale {
  order_id: string;
  created_at: string;
  source: string | null;
  status: string;
  payment_method: string | null;
  total_amount: number;
  customer_name: string | null;
  item_count: number;
  stock_movement_count: number;
  has_fiscal: boolean;
}

const methodLabels: Record<string, string> = {
  cash: 'Dinheiro',
  credit: 'Crédito',
  debit: 'Débito',
  pix: 'PIX',
};

export function describeIncompleteSale(sale: IncompleteSale): string {
  const missing: string[] = [];
  if (Number(sale.item_count) === 0) missing.push('sem produtos');
  if (Number(sale.stock_movement_count) === 0) missing.push('sem baixa de estoque');
  if (sale.has_fiscal) missing.push('nota fiscal emitida');
  return missing.join(' · ');
}

export function IncompleteSalesPanel() {
  const [sales, setSales] = useState<IncompleteSale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_incomplete_sales', { p_limit: 200 });
    if (!error && data) setSales(data as unknown as IncompleteSale[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return null;
  if (sales.length === 0) return null;

  const total = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            Vendas incompletas ({sales.length})
          </span>
          <Button size="sm" variant="outline" onClick={load} className="h-7 text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Atualizar
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Vendas registradas sem produtos ou sem baixa de estoque — total de{' '}
          {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 max-h-72 overflow-y-auto">
        {sales.map((sale) => (
          <div
            key={sale.order_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <PackageX className="w-4 h-4 text-destructive shrink-0" />
              <span className="font-mono text-xs">#{sale.order_id.slice(0, 8)}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(sale.created_at).toLocaleString('pt-BR')}
              </span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {sale.source === 'pdv' ? 'PDV' : 'Site'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{sale.customer_name || 'Sem cliente'}</span>
              <span>{methodLabels[String(sale.payment_method)] || sale.payment_method || '—'}</span>
              <span className="font-semibold">
                {Number(sale.total_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
              <Badge variant="destructive" className="text-[10px]">
                {describeIncompleteSale(sale)}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
