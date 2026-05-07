import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, FileBarChart, Download, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

interface DREData {
  receitaBruta: number;
  vendasCount: number;
  deducoes: number; // Simples Nacional aproximado + cancelamentos
  receitaLiquida: number;
  cmv: number; // custo dos produtos vendidos
  lucroBruto: number;
  despesasFixas: number;
  despesasVariaveis: number;
  despesasOperacionais: number;
  resultadoOperacional: number;
  margemBruta: number;
  margemLiquida: number;
}

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
      const startISO = `${startDate}T00:00:00`;
      const endISO = `${endDate}T23:59:59`;

      // 1) Pedidos válidos (entregue/retirado/enviado/em_preparo) — exclui cancelados/devolvidos
      const { data: orders, error: ordErr } = await supabase
        .from('orders')
        .select('id, total_amount, shipping_cost, status, created_at')
        .gte('created_at', startISO)
        .lte('created_at', endISO);
      if (ordErr) throw ordErr;

      const validStatuses = new Set([
        'em_preparo', 'aguardando_envio', 'enviado', 'entregado', 'retirado',
      ]);
      const validOrders = (orders || []).filter((o) => validStatuses.has(o.status));
      const validIds = validOrders.map((o) => o.id);

      const receitaBruta = validOrders.reduce(
        (s, o) => s + Number(o.total_amount || 0) - Number(o.shipping_cost || 0), 0,
      );

      // Cancelamentos / devoluções no período (dedução)
      const cancelados = (orders || [])
        .filter((o) => o.status === 'cancelado' || o.status === 'devolvido')
        .reduce((s, o) => s + Number(o.total_amount || 0) - Number(o.shipping_cost || 0), 0);

      // 2) CMV — custo dos produtos vendidos
      let cmv = 0;
      if (validIds.length > 0) {
        // Buscar em chunks para não estourar limite de 1000
        const chunks: string[][] = [];
        for (let i = 0; i < validIds.length; i += 200) {
          chunks.push(validIds.slice(i, i + 200));
        }
        for (const chunk of chunks) {
          const { data: items } = await supabase
            .from('order_items')
            .select('quantity, product_id, products(cost)')
            .in('order_id', chunk);
          (items || []).forEach((it: any) => {
            const cost = Number(it.products?.cost || 0);
            cmv += Number(it.quantity) * cost;
          });
        }
      }

      // 3) Despesas no período
      const { data: expenses } = await supabase
        .from('expenses')
        .select('type, amount, expense_date, end_date')
        .lte('expense_date', endDate);

      let despesasFixas = 0;
      let despesasVariaveis = 0;
      const periodStart = new Date(startDate);
      const periodEnd = new Date(endDate);

      (expenses || []).forEach((e: any) => {
        const start = new Date(e.expense_date);
        const end = e.end_date ? new Date(e.end_date) : null;
        const inRange = start <= periodEnd && (!end || end >= periodStart);
        if (!inRange) return;
        const amt = Number(e.amount || 0);
        if (e.type === 'fixed') despesasFixas += amt;
        else despesasVariaveis += amt;
      });

      const despesasOperacionais = despesasFixas + despesasVariaveis;

      // 4) Dedução Simples (estimativa) sobre receita bruta
      const simplesEstim = receitaBruta * (simplesAliquota / 100);
      const deducoes = simplesEstim + cancelados;

      const receitaLiquida = receitaBruta - deducoes;
      const lucroBruto = receitaLiquida - cmv;
      const resultadoOperacional = lucroBruto - despesasOperacionais;

      const margemBruta = receitaBruta > 0 ? (lucroBruto / receitaBruta) * 100 : 0;
      const margemLiquida = receitaBruta > 0 ? (resultadoOperacional / receitaBruta) * 100 : 0;

      setData({
        receitaBruta,
        vendasCount: validOrders.length,
        deducoes,
        receitaLiquida,
        cmv,
        lucroBruto,
        despesasFixas,
        despesasVariaveis,
        despesasOperacionais,
        resultadoOperacional,
        margemBruta,
        margemLiquida,
      });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar DRE', description: e.message, variant: 'destructive' });
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
    const rows = [
      ['DRE - Demonstração de Resultado do Exercício'],
      [`Período: ${startDate} a ${endDate}`],
      [],
      ['(+) RECEITA BRUTA DE VENDAS', fmtBRL(data.receitaBruta)],
      [`    Nº de vendas`, String(data.vendasCount)],
      [`(-) Deduções (Simples ${simplesAliquota}% + cancelamentos)`, fmtBRL(-data.deducoes)],
      ['(=) RECEITA LÍQUIDA', fmtBRL(data.receitaLiquida)],
      ['(-) CMV (Custo dos Produtos Vendidos)', fmtBRL(-data.cmv)],
      ['(=) LUCRO BRUTO', fmtBRL(data.lucroBruto)],
      [`    Margem bruta`, `${data.margemBruta.toFixed(2)}%`],
      ['(-) Despesas Fixas', fmtBRL(-data.despesasFixas)],
      ['(-) Despesas Variáveis', fmtBRL(-data.despesasVariaveis)],
      ['(=) RESULTADO OPERACIONAL (LUCRO/PREJUÍZO)', fmtBRL(data.resultadoOperacional)],
      [`    Margem líquida`, `${data.margemLiquida.toFixed(2)}%`],
    ];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `DRE_${startDate}_a_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const linhas = useMemo(() => {
    if (!data) return [];
    return [
      { label: '(+) Receita Bruta de Vendas', value: data.receitaBruta, bold: true, color: 'text-foreground' },
      { label: `(−) Deduções (Simples ${simplesAliquota}% + cancelamentos)`, value: -data.deducoes, color: 'text-red-600' },
      { label: '(=) Receita Líquida', value: data.receitaLiquida, bold: true, divider: true },
      { label: '(−) CMV — Custo dos Produtos Vendidos', value: -data.cmv, color: 'text-red-600' },
      { label: '(=) Lucro Bruto', value: data.lucroBruto, bold: true, color: data.lucroBruto >= 0 ? 'text-green-700' : 'text-red-700', divider: true, subInfo: `Margem bruta: ${data.margemBruta.toFixed(2)}%` },
      { label: '(−) Despesas Fixas', value: -data.despesasFixas, color: 'text-red-600' },
      { label: '(−) Despesas Variáveis', value: -data.despesasVariaveis, color: 'text-red-600' },
      { label: '(=) Resultado Operacional', value: data.resultadoOperacional, bold: true, big: true, color: data.resultadoOperacional >= 0 ? 'text-green-700' : 'text-red-700', divider: true, subInfo: `Margem líquida: ${data.margemLiquida.toFixed(2)}%` },
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
              Receita = vendas válidas (entregues, retiradas, enviadas, em preparo) sem o frete.
              CMV = soma de (quantidade × custo) de cada item vendido. Despesas vêm do módulo "Gastos".
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
                      {l.label}
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
