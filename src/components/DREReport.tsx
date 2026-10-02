import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, FileBarChart, Download, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { computeDRE, expensesInPeriod, dreCategoryGroup, type DREResult, type DRECategoryGroup } from '@/lib/dre';
import { getCardFeeRate } from '@/utils/cardFees';

async function fetchAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}


type DREData = DREResult & {
  vendasCount: number; itensSemCusto: number;
  byCategory: Record<string, number>;
  gastos: Array<{ data: string; categoria: string; descricao: string; valor: number }>;
};
const GROUP_LABEL: Record<DRECategoryGroup, string> = {
  estoque: 'Vira estoque (entra no CMV quando vender)',
  imposto: 'Imposto pago (já descontado no Simples)',
  vendas: 'Despesas com vendas',
  financeiro: 'Despesas financeiras',
  administrativo: 'Despesas administrativas',
};

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function DREReport() {
  const { toast } = useToast();
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DREData | null>(null);
  const [simplesAliquota, setSimplesAliquota] = useState(6.0); // % padrão Anexo I faixa 1

  const load = async () => {
    setLoading(true);
    try {
      const startISO = new Date(`${startDate}T00:00:00-04:00`).toISOString();
      const endISO = new Date(`${endDate}T23:59:59.999-04:00`).toISOString();

      const orders = await fetchAll<any>((f, t) => supabase
        .from('orders')
        .select('id, total_amount, shipping_cost, status, payment_method, installments')
        .gte('created_at', startISO).lte('created_at', endISO)
        .order('created_at').order('id').range(f, t));

      const validStatuses = new Set(['em_preparo', 'aguardando_envio', 'pronto_retirada', 'enviado', 'entregado', 'retirado']);
      const returnStatuses = new Set(['devolvido', 'reembolsado']);
      const validOrders = orders.filter((o) => validStatuses.has(o.status));
      const returnedOrders = orders.filter((o) => returnStatuses.has(o.status));
      const soldOrders = [...validOrders, ...returnedOrders];
      const prod = (o: any) => Number(o.total_amount || 0) - Number(o.shipping_cost || 0);

      const productRevenue = soldOrders.reduce((s, o) => s + prod(o), 0);
      const freightRevenue = soldOrders.reduce((s, o) => s + Number(o.shipping_cost || 0), 0);
      const returns = returnedOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

      // CMV e taxas só das vendas que ficaram (válidas)
      const validIds = validOrders.map((o) => o.id);
      let cmv = 0, itensSemCusto = 0, paymentFees = 0;
      const items: any[] = [];
      const payments: any[] = [];
      for (let i = 0; i < validIds.length; i += 200) {
        const chunk = validIds.slice(i, i + 200);
        items.push(...await fetchAll<any>((f, t) => supabase.from('order_items')
          .select('id, quantity, product_id, variation_id').in('order_id', chunk).order('id').range(f, t)));
        payments.push(...await fetchAll<any>((f, t) => supabase.from('order_payments')
          .select('id, order_id, payment_method, amount, installments').in('order_id', chunk).order('id').range(f, t)));
      }
      if (items.length) {
        const [{ data: allProducts }, { data: allVars }] = await Promise.all([
          supabase.rpc('get_products_admin'), supabase.rpc('get_product_variations_admin'),
        ]);
        const pCost = new Map((allProducts || []).map((p: any) => [p.id, Number(p.cost ?? 0)]));
        const vCost = new Map((allVars || []).map((v: any) => [v.id, Number(v.cost ?? 0)]));
        for (const it of items) {
          const c = (it.variation_id && vCost.get(it.variation_id)) || pCost.get(it.product_id) || 0;
          if (!c) itensSemCusto++;
          cmv += Number(it.quantity) * c;
        }
      }
      const payByOrder = new Map<string, any[]>();
      payments.forEach((p) => payByOrder.set(p.order_id, [...(payByOrder.get(p.order_id) || []), p]));
      for (const o of validOrders) {
        const split = payByOrder.get(o.id);
        if (split?.length) split.forEach((p) => { paymentFees += Number(p.amount || 0) * getCardFeeRate(p.payment_method, p.installments || 1); });
        else paymentFees += Number(o.total_amount || 0) * getCardFeeRate(o.payment_method, o.installments || 1);
      }

      const [{ data: expenses }, { data: overrides }] = await Promise.all([
        supabase.from('expenses').select('id, type, category, description, amount, expense_date, end_date').lte('expense_date', endDate),
        supabase.from('expense_overrides').select('expense_id, year_month, amount, skipped'),
      ]);
      const { byCategory } = expensesInPeriod((expenses || []) as any, (overrides || []) as any, startDate, endDate);
      const gastos = ((expenses || []) as any[])
        .filter((e) => e.type !== 'fixed' && e.expense_date >= startDate && e.expense_date <= endDate)
        .map((e) => ({ data: e.expense_date, categoria: e.category, descricao: e.description, valor: Number(e.amount) }));

      const r = computeDRE({ productRevenue, freightRevenue, returns, simplesRate: simplesAliquota, cmv, paymentFees, expensesByCategory: byCategory });
      setData({ ...r, vendasCount: validOrders.length, itensSemCusto, byCategory, gastos });
    } catch (e) {
      toast({
        title: 'Erro ao gerar DRE',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCSV = () => {
    if (!data) return;
    const rows = [['DRE - Demonstração de Resultado do Exercício'], [`Período: ${startDate} a ${endDate}`], [], ...linhas.map((l) => [l.label, fmtBRL(l.value)])];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `DRE_${startDate}_a_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const linhas = useMemo(() => {
    if (!data) return [] as Array<{ label: string; value: number; bold?: boolean; big?: boolean; divider?: boolean; color?: string; subInfo?: string; indent?: boolean }>;
    const neg = 'text-destructive';
    const res = (v: number) => (v >= 0 ? 'text-green-700' : 'text-destructive');
    const adm = Object.entries(data.admDetail).map(([k, v]) => ({ label: `• ${k}`, value: -v, indent: true, color: 'text-muted-foreground' }));
    return [
      { label: '(+) Receita Bruta', value: data.receitaBruta, bold: true },
      { label: '• Venda de mercadorias', value: data.productRevenue, indent: true, color: 'text-muted-foreground' },
      { label: '• Fretes cobrados', value: data.freightRevenue, indent: true, color: 'text-muted-foreground' },
      { label: '(−) Devoluções e reembolsos', value: -data.devolucoes, color: neg },
      { label: `(−) Simples Nacional (${simplesAliquota}%)`, value: -data.impostos, color: neg },
      { label: '(=) Receita Líquida', value: data.receitaLiquida, bold: true, divider: true },
      { label: '(−) CMV — Custo das Mercadorias Vendidas', value: -data.cmv, color: neg,
        subInfo: data.itensSemCusto ? `${data.itensSemCusto} item(ns) vendido(s) sem custo cadastrado — o CMV pode estar menor que o real` : undefined },
      { label: '(=) Lucro Bruto', value: data.lucroBruto, bold: true, divider: true, color: res(data.lucroBruto), subInfo: `Margem bruta: ${data.margemBruta.toFixed(2)}%` },
      { label: '(−) Despesas com vendas', value: -data.despesasVendas, color: neg },
      { label: '• Taxas de cartão e PIX', value: -data.taxasPagamento, indent: true, color: 'text-muted-foreground' },
      { label: '• Frete pago e outros', value: -data.freteEtc, indent: true, color: 'text-muted-foreground' },
      { label: '(−) Despesas administrativas', value: -data.despesasAdministrativas, color: neg },
      ...adm,
      { label: '(−) Despesas financeiras', value: -data.despesasFinanceiras, color: neg },
      { label: '(=) Resultado Líquido', value: data.resultadoLiquido, bold: true, big: true, divider: true, color: res(data.resultadoLiquido), subInfo: `Margem líquida: ${data.margemLiquida.toFixed(2)}%` },
    ];
  }, [data, simplesAliquota]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileBarChart className="w-5 h-5" /> DRE — Demonstração de Resultado
          </CardTitle>
          <CardDescription>
            Receita, custos e despesas do período. Os valores de imposto são uma estimativa
            (Simples Nacional) — para o relatório oficial use a contadora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label htmlFor="dre-start" className="text-xs">Data inicial</Label>
              <Input id="dre-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dre-end" className="text-xs">Data final</Label>
              <Input id="dre-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dre-aliq" className="text-xs">Alíquota Simples (%)</Label>
              <Input id="dre-aliq" type="number" step="0.1" min="0" max="33"
                value={simplesAliquota}
                onChange={(e) => setSimplesAliquota(Number(e.target.value) || 0)} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={load} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Calcular
              </Button>
              <Button variant="outline" onClick={exportCSV} disabled={!data}>
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Gastos fixos entram proporcionais aos dias do período; gastos variáveis só na data deles.
              Compras de mercadoria não são despesa: viram estoque e entram pelo CMV quando vendidas.
              O DAS pago não é descontado de novo, pois o Simples já é calculado sobre a receita.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado do período</CardTitle>
            <CardDescription>
              {startDate} → {endDate} · {data.vendasCount} venda(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {linhas.map((l, i) => (
                <div key={i}>
                  <div
                    className={`flex items-baseline justify-between py-2 ${
                      l.divider ? 'border-t border-border' : ''
                    }`}
                  >
                    <span
                      className={`${l.bold ? 'font-semibold' : 'text-sm'} ${
                        l.color || ''
                      } ${l.big ? 'text-base' : ''}`}
                    >
                      <span className={l.indent ? 'pl-4' : ''}>{l.label}</span>
                    </span>
                    <span
                      className={`tabular-nums ${l.bold ? 'font-bold' : ''} ${
                        l.color || ''
                      } ${l.big ? 'text-lg' : ''}`}
                    >
                      {fmtBRL(l.value)}
                    </span>
                  </div>
                  {l.subInfo && (
                    <div className="text-xs text-muted-foreground pl-2 -mt-1 pb-1">
                      {l.subInfo}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground border-t border-border pt-3">
              <div>Compras de mercadoria no período (estoque, fora do resultado): <b>{fmtBRL(data.comprasMercadoria)}</b></div>
              <div>DAS / impostos pagos no período (caixa): <b>{fmtBRL(data.dasPago)}</b></div>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Todos os gastos lançados no período</CardTitle>
            <CardDescription>
              Cada categoria e onde ela entra no DRE. Gastos fixos contam proporcionais aos dias escolhidos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.keys(data.byCategory).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gasto lançado neste período.</p>
            ) : (
              <div className="divide-y divide-border">
                {Object.entries(data.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                  <div key={cat} className="flex justify-between py-2 text-sm">
                    <span><b>{cat}</b> <span className="text-muted-foreground">· {GROUP_LABEL[dreCategoryGroup(cat)]}</span></span>
                    <span className="tabular-nums">{fmtBRL(v)}</span>
                  </div>
                ))}
              </div>
            )}
            {data.gastos.length > 0 && (
              <div className="text-xs space-y-1 border-t border-border pt-3">
                <div className="font-semibold text-sm mb-1">Lançamentos avulsos ({data.gastos.length})</div>
                {data.gastos.map((g, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{g.data.split('-').reverse().join('/')} · {g.categoria} · {g.descricao}</span>
                    <span className="tabular-nums">{fmtBRL(g.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
