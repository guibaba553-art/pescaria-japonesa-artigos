import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Download, FileSpreadsheet, Loader2, TrendingUp, Receipt, ArrowDownToLine, Calculator } from 'lucide-react';

type SimplesAnnex = 'I' | 'II' | 'III';
const ANNEX_RATES: Record<SimplesAnnex, { faixas: Array<{ ate: number; aliquota: number; deducao: number }> }> = {
  I: { // Comércio
    faixas: [
      { ate: 180000, aliquota: 0.04, deducao: 0 },
      { ate: 360000, aliquota: 0.073, deducao: 5940 },
      { ate: 720000, aliquota: 0.095, deducao: 13860 },
      { ate: 1800000, aliquota: 0.107, deducao: 22500 },
      { ate: 3600000, aliquota: 0.143, deducao: 87300 },
      { ate: 4800000, aliquota: 0.19, deducao: 378000 },
    ],
  },
  II: { // Indústria
    faixas: [
      { ate: 180000, aliquota: 0.045, deducao: 0 },
      { ate: 360000, aliquota: 0.078, deducao: 5940 },
      { ate: 720000, aliquota: 0.10, deducao: 13860 },
      { ate: 1800000, aliquota: 0.112, deducao: 22500 },
      { ate: 3600000, aliquota: 0.147, deducao: 85500 },
      { ate: 4800000, aliquota: 0.30, deducao: 720000 },
    ],
  },
  III: { // Serviços
    faixas: [
      { ate: 180000, aliquota: 0.06, deducao: 0 },
      { ate: 360000, aliquota: 0.112, deducao: 9360 },
      { ate: 720000, aliquota: 0.135, deducao: 17640 },
      { ate: 1800000, aliquota: 0.16, deducao: 35640 },
      { ate: 3600000, aliquota: 0.21, deducao: 125640 },
      { ate: 4800000, aliquota: 0.33, deducao: 648000 },
    ],
  },
};

const csvEscape = (v: any): string => {
  const s = String(v ?? '');
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const downloadCSV = (filename: string, rows: any[][]) => {
  const csv = '\uFEFF' + rows.map((r) => r.map(csvEscape).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export function AccountantReport() {
  const { toast } = useToast();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [annex, setAnnex] = useState<SimplesAnnex>('I');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setData(null);
    try {
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();
      const last12Start = new Date(year, month - 13, 1).toISOString();

      // Vendas online (orders pagos/entregues)
      const { data: orders } = await supabase
        .from('orders')
        .select('id, total_amount, shipping_cost, status, source, created_at')
        .gte('created_at', start)
        .lt('created_at', end);

      const onlineOrders = (orders || []).filter((o) => o.source !== 'pdv' && o.status !== 'cancelado');
      const pdvOrders = (orders || []).filter((o) => o.source === 'pdv' && o.status !== 'cancelado');

      const onlineRevenue = onlineOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const pdvRevenue = pdvOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

      // NF-es saída
      const { data: nfeSaida } = await supabase
        .from('nfe_emissions')
        .select('nfe_number, nfe_key, valor_total, status, emitted_at, modelo, ambiente, tipo')
        .eq('tipo', 'saida')
        .gte('created_at', start)
        .lt('created_at', end);

      // NF-es entrada
      const { data: nfeEntrada } = await supabase
        .from('nfe_entrada_pendentes')
        .select('numero_nfe, chave_nfe, fornecedor_nome, fornecedor_cnpj, valor_total, status, data_emissao')
        .gte('created_at', start)
        .lt('created_at', end);

      // Receita acumulada últimos 12 meses (para alíquota efetiva)
      const { data: orders12 } = await supabase
        .from('orders')
        .select('total_amount, status, source, created_at')
        .gte('created_at', last12Start)
        .lt('created_at', start)
        .neq('status', 'cancelado');

      const rbt12 = (orders12 || []).reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const rbt12WithCurrent = rbt12 + onlineRevenue + pdvRevenue;

      // Calcular DAS (alíquota efetiva)
      const annexData = ANNEX_RATES[annex];
      let aliquotaNominal = 0;
      let deducao = 0;
      for (const faixa of annexData.faixas) {
        if (rbt12WithCurrent <= faixa.ate) {
          aliquotaNominal = faixa.aliquota;
          deducao = faixa.deducao;
          break;
        }
      }
      const aliquotaEfetiva = rbt12WithCurrent > 0
        ? Math.max(0, ((rbt12WithCurrent * aliquotaNominal) - deducao) / rbt12WithCurrent)
        : 0;
      const receitaMes = onlineRevenue + pdvRevenue;
      const dasEstimado = receitaMes * aliquotaEfetiva;

      setData({
        year, month, annex,
        onlineOrders, pdvOrders, onlineRevenue, pdvRevenue,
        totalOrders: onlineOrders.length + pdvOrders.length,
        nfeSaida: nfeSaida || [],
        nfeEntrada: nfeEntrada || [],
        rbt12, rbt12WithCurrent,
        aliquotaNominal, deducao, aliquotaEfetiva, dasEstimado,
      });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const exportAll = () => {
    if (!data) return;
    const mm = String(data.month).padStart(2, '0');
    const periodo = `${data.year}-${mm}`;

    // Resumo
    downloadCSV(`resumo-vendas-${periodo}.csv`, [
      ['RESUMO DE VENDAS', `${mm}/${data.year}`],
      [],
      ['Canal', 'Qtd Pedidos', 'Receita (R$)'],
      ['Site (online)', data.onlineOrders.length, data.onlineRevenue.toFixed(2)],
      ['PDV (loja física)', data.pdvOrders.length, data.pdvRevenue.toFixed(2)],
      ['TOTAL', data.totalOrders, (data.onlineRevenue + data.pdvRevenue).toFixed(2)],
      [],
      ['APURAÇÃO DAS - Simples Nacional'],
      ['Anexo', data.annex],
      ['RBT12 (12 meses anteriores)', data.rbt12.toFixed(2)],
      ['Receita do mês', (data.onlineRevenue + data.pdvRevenue).toFixed(2)],
      ['Alíquota nominal', `${(data.aliquotaNominal * 100).toFixed(2)}%`],
      ['Parcela a deduzir', data.deducao.toFixed(2)],
      ['Alíquota efetiva', `${(data.aliquotaEfetiva * 100).toFixed(4)}%`],
      ['DAS estimado a pagar', data.dasEstimado.toFixed(2)],
    ]);

    // NF-es saída
    if (data.nfeSaida.length) {
      downloadCSV(`nfe-saida-${periodo}.csv`, [
        ['Número', 'Chave', 'Modelo', 'Status', 'Emitida em', 'Valor (R$)', 'Ambiente'],
        ...data.nfeSaida.map((n: any) => [
          n.nfe_number || '',
          n.nfe_key || '',
          n.modelo || '',
          n.status || '',
          n.emitted_at ? new Date(n.emitted_at).toLocaleString('pt-BR') : '',
          Number(n.valor_total || 0).toFixed(2),
          n.ambiente || '',
        ]),
      ]);
    }

    // NF-es entrada
    if (data.nfeEntrada.length) {
      downloadCSV(`nfe-entrada-${periodo}.csv`, [
        ['Número', 'Chave', 'Fornecedor', 'CNPJ Fornecedor', 'Emitida em', 'Valor (R$)', 'Status'],
        ...data.nfeEntrada.map((n: any) => [
          n.numero_nfe || '',
          n.chave_nfe || '',
          n.fornecedor_nome || '',
          n.fornecedor_cnpj || '',
          n.data_emissao ? new Date(n.data_emissao).toLocaleString('pt-BR') : '',
          Number(n.valor_total || 0).toFixed(2),
          n.status || '',
        ]),
      ]);
    }

    toast({ title: 'Relatórios exportados!', description: 'Arquivos CSV enviados para download.' });
  };

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> Relatório Mensal para o Contador
          </CardTitle>
          <CardDescription>
            Gera um pacote completo: resumo de vendas (site + PDV), NF-es de saída e entrada, e apuração estimada do DAS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Mês</Label>
              <select className="w-full h-10 px-3 rounded-md border border-input bg-background" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
                {months.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
              </select>
            </div>
            <div>
              <Label>Ano</Label>
              <select className="w-full h-10 px-3 rounded-md border border-input bg-background" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <Label>Anexo Simples</Label>
              <select className="w-full h-10 px-3 rounded-md border border-input bg-background" value={annex} onChange={(e) => setAnnex(e.target.value as SimplesAnnex)}>
                <option value="I">I - Comércio</option>
                <option value="II">II - Indústria</option>
                <option value="III">III - Serviços</option>
              </select>
            </div>
          </div>
          <Button onClick={load} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}
            Gerar relatório do período
          </Button>
        </CardContent>
      </Card>

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                  <span>Vendas Site</span><TrendingUp className="w-4 h-4" />
                </div>
                <div className="text-xl font-display font-black mt-1">
                  {data.onlineRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
                <div className="text-xs text-muted-foreground">{data.onlineOrders.length} pedidos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                  <span>Vendas PDV</span><TrendingUp className="w-4 h-4" />
                </div>
                <div className="text-xl font-display font-black mt-1">
                  {data.pdvRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
                <div className="text-xs text-muted-foreground">{data.pdvOrders.length} vendas</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                  <span>NF-es Saída</span><Receipt className="w-4 h-4" />
                </div>
                <div className="text-xl font-display font-black mt-1">{data.nfeSaida.length}</div>
                <div className="text-xs text-muted-foreground">notas emitidas</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                  <span>NF-es Entrada</span><ArrowDownToLine className="w-4 h-4" />
                </div>
                <div className="text-xl font-display font-black mt-1">{data.nfeEntrada.length}</div>
                <div className="text-xs text-muted-foreground">compras recebidas</div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">Apuração estimada do DAS — Anexo {data.annex}</CardTitle>
              <CardDescription>Cálculo conforme Lei Complementar 123/2006. Valores estimados; confirme com seu contador.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="RBT12 (receita 12 meses anteriores)" value={data.rbt12.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
              <Row label="Receita do mês de referência" value={(data.onlineRevenue + data.pdvRevenue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
              <Row label="Alíquota nominal da faixa" value={`${(data.aliquotaNominal * 100).toFixed(2)}%`} />
              <Row label="Parcela a deduzir" value={data.deducao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
              <Row label="Alíquota efetiva" value={<Badge variant="secondary">{(data.aliquotaEfetiva * 100).toFixed(4)}%</Badge>} />
              <div className="border-t pt-2 mt-2 flex items-center justify-between">
                <span className="font-bold">DAS estimado a pagar</span>
                <span className="text-xl font-display font-black text-primary">
                  {data.dasEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </CardContent>
          </Card>

          <Button onClick={exportAll} className="w-full" size="lg">
            <Download className="w-4 h-4 mr-2" /> Baixar pacote CSV para o contador
          </Button>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
