import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, TrendingUp, Clock, CreditCard, Banknote, DollarSign, ShoppingBag, Award } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { CustomerTier } from '@/utils/customerTiers';

interface Props {
  customer: any;
  tier?: CustomerTier | null;
}

const BRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));

const fmtSecs = (s: number) => {
  if (!isFinite(s) || s <= 0) return '—';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  if (m <= 0) return `${r}s`;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
};

const payLabel = (m?: string | null) => {
  const k = (m || '').toLowerCase();
  if (k.includes('pix')) return 'PIX';
  if (k.includes('credit') || k.includes('crédit')) return 'Crédito';
  if (k.includes('debit') || k.includes('débit')) return 'Débito';
  if (k.includes('cash') || k.includes('dinheiro')) return 'Dinheiro';
  return m || '—';
};

const payIcon = (k: string) => {
  if (k === 'PIX') return <DollarSign className="w-3 h-3" />;
  if (k === 'Dinheiro') return <Banknote className="w-3 h-3" />;
  return <CreditCard className="w-3 h-3" />;
};

export function CustomerPdvInsights({ customer, tier }: Props) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!customer?.id) return;
      setLoading(true);
      const { data } = await supabase
        .from('orders')
        .select('id, total_amount, payment_method, status, created_at, pdv_service_time_seconds')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (cancel) return;
      setOrders(data || []);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [customer?.id]);

  const insights = useMemo(() => {
    const valid = orders.filter((o) => !['cancelado', 'devolvido'].includes(o.status));
    const count = valid.length;
    const total = valid.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const avg = count ? total / count : 0;
    // Mediana
    const sorted = [...valid].map((o) => Number(o.total_amount || 0)).sort((a, b) => a - b);
    const median = sorted.length
      ? sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : 0;

    // Poder de compra estimado: combina média e mediana para evitar viés de outliers
    const estimatedPower = count >= 2 ? (avg + median) / 2 : avg;

    // Tempo médio (últimas 10 com tempo medido)
    const withTime = valid.filter((o) => Number(o.pdv_service_time_seconds) > 0).slice(0, 10);
    const avgServiceSec = withTime.length
      ? withTime.reduce((s, o) => s + Number(o.pdv_service_time_seconds), 0) / withTime.length
      : 0;

    // % por método nas últimas até 10 compras
    const last = valid.slice(0, 10);
    const payCount: Record<string, number> = {};
    last.forEach((o) => {
      const k = payLabel(o.payment_method);
      payCount[k] = (payCount[k] || 0) + 1;
    });
    const payRanking = Object.entries(payCount)
      .map(([k, v]) => ({ name: k, pct: (v / last.length) * 100 }))
      .sort((a, b) => b.pct - a.pct);

    return { count, total, avg, estimatedPower, avgServiceSec, payRanking, lastN: last.length };
  }, [orders]);

  

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            Painel do cliente
          </div>
          {tier && (
            <Badge
              variant="secondary"
              className="h-5 px-1.5 text-[10px] gap-1 border"
              style={{ borderColor: tier.color, backgroundColor: `${tier.color}20`, color: tier.color }}
            >
              <Award className="w-3 h-3" />
              {tier.name}
              {tier.discount_percent > 0 && ` · ${tier.discount_percent}% desc.`}
            </Badge>
          )}
        </div>

        {/* KPIs principais */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-background border p-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide">
              <TrendingUp className="w-3 h-3" /> Poder de compra
            </div>
            <div className="text-sm font-bold mt-0.5">{BRL(insights.estimatedPower)}</div>
            <div className="text-[10px] text-muted-foreground">
              {insights.count > 0 ? `Base: ${insights.count} compras` : 'Sem histórico'}
            </div>
          </div>
          <div className="rounded-lg bg-background border p-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide">
              <Clock className="w-3 h-3" /> Atend. esperado
            </div>
            <div className="text-sm font-bold mt-0.5">{fmtSecs(insights.avgServiceSec)}</div>
            <div className="text-[10px] text-muted-foreground">
              {insights.avgServiceSec > 0 ? 'Média histórica' : 'Sem dados ainda'}
            </div>
          </div>
        </div>

        {/* Métodos de pagamento */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Pagamentos · últimas {insights.lastN || 0}
            </div>
            {insights.count === 0 && (
              <span className="text-[10px] text-muted-foreground italic">Sem histórico</span>
            )}
          </div>
          {insights.payRanking.length > 0 ? (
            <div className="space-y-1">
              {insights.payRanking.map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 shrink-0 w-20 justify-start">
                    {payIcon(p.name)} {p.name}
                  </Badge>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.max(4, p.pct)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono w-9 text-right tabular-nums">
                    {Math.round(p.pct)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground italic">
              Primeira compra deste cliente.
            </div>
          )}
        </div>

        {insights.count > 0 && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t pt-2">
            <span className="inline-flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" /> {insights.count} compras
            </span>
            <span>Ticket médio: <strong className="text-foreground">{BRL(insights.avg)}</strong></span>
            <span>Total: <strong className="text-foreground">{BRL(insights.total)}</strong></span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
