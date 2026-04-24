import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingUp, Calendar, FileText, Download, Calculator, Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Tabela do Simples Nacional - Anexo I (Comércio) - vigente
 * Faixas de receita bruta acumulada nos últimos 12 meses (RBT12)
 */
const SIMPLES_ANEXO_I = [
  { faixa: 1, ate: 180_000,    aliquota: 0.040, deducao: 0,        icms: 0.340 },
  { faixa: 2, ate: 360_000,    aliquota: 0.073, deducao: 5_940,    icms: 0.340 },
  { faixa: 3, ate: 720_000,    aliquota: 0.095, deducao: 13_860,   icms: 0.335 },
  { faixa: 4, ate: 1_800_000,  aliquota: 0.107, deducao: 22_500,   icms: 0.335 },
  { faixa: 5, ate: 3_600_000,  aliquota: 0.143, deducao: 87_300,   icms: 0.335 },
  { faixa: 6, ate: 4_800_000,  aliquota: 0.190, deducao: 378_000,  icms: 0.0   },
];

const TETO_SIMPLES = 4_800_000;
const SUBLIMITE_ICMS = 3_600_000;

interface OrderRow {
  id: string;
  total_amount: number;
  shipping_cost: number;
  created_at: string;
  status: string;
  source: string;
}

function calcularDAS(rbt12: number, faturamentoMes: number) {
  const faixa = SIMPLES_ANEXO_I.find(f => rbt12 <= f.ate) ?? SIMPLES_ANEXO_I[SIMPLES_ANEXO_I.length - 1];
  // Alíquota efetiva = ((RBT12 × Aliq Nominal) − Dedução) / RBT12
  const aliqEfetiva = rbt12 > 0
    ? Math.max(0, (rbt12 * faixa.aliquota - faixa.deducao) / rbt12)
    : faixa.aliquota;
  const das = faturamentoMes * aliqEfetiva;
  // Repartição aproximada (Anexo I): ICMS, PIS, COFINS, IRPJ, CSLL, CPP
  const icmsPct = faixa.icms; // % do DAS que é ICMS
  return {
    faixa: faixa.faixa,
    aliquotaNominal: faixa.aliquota,
    aliquotaEfetiva: aliqEfetiva,
    das,
    icms: das * icmsPct,
    pis: das * 0.0276,
    cofins: das * 0.1274,
    irpj: das * 0.055,
    csll: das * 0.035,
    cpp: das * 0.418,
    proximoTeto: faixa.ate,
  };
}

export function TaxProjection() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"current" | "last">("current");

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      // Busca pedidos dos últimos 13 meses para calcular RBT12
      const since = new Date();
      since.setMonth(since.getMonth() - 13);
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_amount, shipping_cost, created_at, status, source")
        .gte("created_at", since.toISOString())
        .neq("status", "cancelado" as any)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      setOrders((data as any) || []);
    } catch (err) {
      console.error("Erro ao carregar pedidos:", err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const refDate = period === "current" ? now : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const endMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);

    // Receita do mês selecionado (sem frete - frete não é receita tributável)
    const ordersDoMes = orders.filter(o => {
      const d = new Date(o.created_at);
      return d >= startMonth && d < endMonth;
    });
    const faturamentoMes = ordersDoMes.reduce((s, o) => s + (Number(o.total_amount) - Number(o.shipping_cost || 0)), 0);

    // RBT12 = receita bruta dos últimos 12 meses anteriores ao mês de apuração
    const rbt12Start = new Date(startMonth);
    rbt12Start.setMonth(rbt12Start.getMonth() - 12);
    const rbt12 = orders
      .filter(o => {
        const d = new Date(o.created_at);
        return d >= rbt12Start && d < startMonth;
      })
      .reduce((s, o) => s + (Number(o.total_amount) - Number(o.shipping_cost || 0)), 0);

    // Faturamento acumulado no ano (para limite anual)
    const startYear = new Date(refDate.getFullYear(), 0, 1);
    const faturamentoAno = orders
      .filter(o => {
        const d = new Date(o.created_at);
        return d >= startYear && d < endMonth;
      })
      .reduce((s, o) => s + (Number(o.total_amount) - Number(o.shipping_cost || 0)), 0);

    const calc = calcularDAS(rbt12, faturamentoMes);

    return {
      ordersDoMes,
      faturamentoMes,
      rbt12,
      faturamentoAno,
      calc,
      refDate,
    };
  }, [orders, period]);

  // Alertas
  const alerts = useMemo(() => {
    const a: { tipo: "warning" | "danger" | "info"; titulo: string; msg: string }[] = [];
    const pctTeto = (stats.faturamentoAno / TETO_SIMPLES) * 100;
    if (pctTeto >= 95) {
      a.push({
        tipo: "danger",
        titulo: "Limite do Simples Nacional crítico",
        msg: `Você já atingiu ${pctTeto.toFixed(1)}% do teto anual de R$ 4,8 milhões. Acima disso, exclusão obrigatória do regime no mês seguinte.`,
      });
    } else if (pctTeto >= 80) {
      a.push({
        tipo: "warning",
        titulo: "Aproximando-se do teto anual",
        msg: `${pctTeto.toFixed(1)}% do limite anual já consumido. Planeje-se: acima de 20% de excesso há saída obrigatória do Simples.`,
      });
    }
    if (stats.faturamentoAno >= SUBLIMITE_ICMS && stats.faturamentoAno < TETO_SIMPLES) {
      a.push({
        tipo: "warning",
        titulo: "Sublimite de ICMS ultrapassado",
        msg: `Acima de R$ 3,6 mi/ano, ICMS e ISS passam a ser recolhidos fora do Simples (regime normal estadual).`,
      });
    }
    // Mudança de faixa
    const faixaAtual = stats.calc.faixa;
    if (faixaAtual < 6) {
      const proximaFaixa = SIMPLES_ANEXO_I[faixaAtual];
      const distancia = proximaFaixa.ate - stats.rbt12;
      const pctFaixa = (stats.rbt12 / proximaFaixa.ate) * 100;
      if (pctFaixa >= 90) {
        a.push({
          tipo: "info",
          titulo: `Próxima faixa do Simples (Faixa ${faixaAtual + 1})`,
          msg: `Faltam ${distancia.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de RBT12 para mudar para alíquota de ${(proximaFaixa.aliquota * 100).toFixed(2)}%.`,
        });
      }
    }
    return a;
  }, [stats]);

  // Detalhe por pedido (mês atual)
  const ordersByTax = useMemo(() => {
    return stats.ordersDoMes.map(o => {
      const base = Number(o.total_amount) - Number(o.shipping_cost || 0);
      const impostoEstimado = base * stats.calc.aliquotaEfetiva;
      return {
        id: o.id,
        date: o.created_at,
        source: o.source,
        total: Number(o.total_amount),
        base,
        imposto: impostoEstimado,
        liquido: base - impostoEstimado,
      };
    });
  }, [stats]);

  const exportCSV = () => {
    const rows = [
      ["Pedido", "Data", "Origem", "Total", "Base tributável", "Imposto estimado", "Líquido"],
      ...ordersByTax.map(o => [
        o.id.slice(0, 8),
        new Date(o.date).toLocaleDateString("pt-BR"),
        o.source,
        o.total.toFixed(2),
        o.base.toFixed(2),
        o.imposto.toFixed(2),
        o.liquido.toFixed(2),
      ]),
    ];
    const csv = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `impostos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (n: number) => (n * 100).toFixed(2) + "%";

  if (loading) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          Calculando impostos...
        </CardContent>
      </Card>
    );
  }

  const pctTetoAnual = (stats.faturamentoAno / TETO_SIMPLES) * 100;

  return (
    <div className="space-y-4">
      {/* Header com seletor */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-display font-bold">Impostos — Simples Nacional</h2>
          <p className="text-xs text-muted-foreground">
            Anexo I (Comércio) • Calculado a partir das vendas registradas no sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-44">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Mês atual</SelectItem>
              <SelectItem value="last">Mês anterior</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {alerts.map((a, i) => (
        <Alert key={i} variant={a.tipo === "danger" ? "destructive" : "default"}>
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>{a.titulo}</AlertTitle>
          <AlertDescription>{a.msg}</AlertDescription>
        </Alert>
      ))}

      <Tabs defaultValue="painel" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="painel">
            <Calculator className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Painel mensal</span>
            <span className="sm:hidden">Painel</span>
          </TabsTrigger>
          <TabsTrigger value="das">
            <TrendingUp className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Projeção DAS</span>
            <span className="sm:hidden">DAS</span>
          </TabsTrigger>
          <TabsTrigger value="pedidos">
            <FileText className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Por pedido</span>
            <span className="sm:hidden">Pedidos</span>
          </TabsTrigger>
        </TabsList>

        {/* PAINEL */}
        <TabsContent value="painel" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Faturamento do mês" value={fmt(stats.faturamentoMes)} sub={`${stats.ordersDoMes.length} pedidos`} />
            <KpiCard label="DAS estimado" value={fmt(stats.calc.das)} sub={`Alíq. efetiva ${pct(stats.calc.aliquotaEfetiva)}`} accent="text-primary" />
            <KpiCard label="RBT12" value={fmt(stats.rbt12)} sub={`Faixa ${stats.calc.faixa} de 6`} />
            <KpiCard label="Acumulado no ano" value={fmt(stats.faturamentoAno)} sub={`${pctTetoAnual.toFixed(1)}% do teto`} accent={pctTetoAnual >= 80 ? "text-yellow-600" : undefined} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Repartição estimada do DAS</CardTitle>
              <CardDescription>Como os tributos do Simples Nacional se distribuem dentro da guia</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <TaxBar label="ICMS" value={stats.calc.icms} total={stats.calc.das} />
              <TaxBar label="CPP (INSS)" value={stats.calc.cpp} total={stats.calc.das} />
              <TaxBar label="COFINS" value={stats.calc.cofins} total={stats.calc.das} />
              <TaxBar label="IRPJ" value={stats.calc.irpj} total={stats.calc.das} />
              <TaxBar label="CSLL" value={stats.calc.csll} total={stats.calc.das} />
              <TaxBar label="PIS/PASEP" value={stats.calc.pis} total={stats.calc.das} />
            </CardContent>
          </Card>

          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription className="text-xs">
              Cálculo baseado nos pedidos não cancelados registrados no sistema (PDV + Site). O frete é descontado da base tributável.
              Valores são <strong>estimativas</strong> — confirme com sua contabilidade antes de recolher.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* DAS */}
        <TabsContent value="das" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Projeção da guia DAS</CardTitle>
              <CardDescription>Vencimento até dia 20 do mês seguinte</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-6 bg-primary/5 rounded-lg">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Valor estimado da guia</p>
                <p className="text-4xl font-display font-black text-primary">{fmt(stats.calc.das)}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Referente a {stats.refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <DetailRow label="Faixa" value={`${stats.calc.faixa} / 6`} />
                <DetailRow label="Alíquota nominal" value={pct(stats.calc.aliquotaNominal)} />
                <DetailRow label="Alíquota efetiva" value={pct(stats.calc.aliquotaEfetiva)} />
                <DetailRow label="Faturamento mês" value={fmt(stats.faturamentoMes)} />
                <DetailRow label="RBT12" value={fmt(stats.rbt12)} />
                <DetailRow label="Próximo teto da faixa" value={fmt(stats.calc.proximoTeto)} />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Limite anual do Simples</span>
                  <span className="font-bold">{fmt(stats.faturamentoAno)} / {fmt(TETO_SIMPLES)}</span>
                </div>
                <Progress value={Math.min(100, pctTetoAnual)} className="h-3" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {pctTetoAnual >= 100
                    ? "⚠️ Teto excedido"
                    : `Resta ${fmt(TETO_SIMPLES - stats.faturamentoAno)} até o teto`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tabela do Anexo I — Comércio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Faixa</TableHead>
                      <TableHead>RBT12 até</TableHead>
                      <TableHead>Alíquota</TableHead>
                      <TableHead>Dedução</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SIMPLES_ANEXO_I.map(f => (
                      <TableRow key={f.faixa} className={f.faixa === stats.calc.faixa ? "bg-primary/5 font-bold" : ""}>
                        <TableCell>{f.faixa}</TableCell>
                        <TableCell>{fmt(f.ate)}</TableCell>
                        <TableCell>{(f.aliquota * 100).toFixed(2)}%</TableCell>
                        <TableCell>{fmt(f.deducao)}</TableCell>
                        <TableCell>{f.faixa === stats.calc.faixa && <Badge>Atual</Badge>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PEDIDOS */}
        <TabsContent value="pedidos">
          <Card>
            <CardHeader>
              <CardTitle>Imposto detalhado por pedido</CardTitle>
              <CardDescription>
                {ordersByTax.length} pedidos no período • Alíquota aplicada: {pct(stats.calc.aliquotaEfetiva)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ordersByTax.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Nenhum pedido no período selecionado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Canal</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right text-destructive">Imposto</TableHead>
                        <TableHead className="text-right text-green-600">Líquido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersByTax.slice(0, 100).map(o => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                          <TableCell className="text-xs">{new Date(o.date).toLocaleDateString("pt-BR")}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{o.source}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{fmt(o.total)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmt(o.base)}</TableCell>
                          <TableCell className="text-right text-destructive">{fmt(o.imposto)}</TableCell>
                          <TableCell className="text-right text-green-600 font-bold">{fmt(o.liquido)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {ordersByTax.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Mostrando 100 de {ordersByTax.length}. Exporte CSV para ver todos.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-lg font-bold mt-1 ${accent || ""}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function TaxBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pctVal = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ({pctVal.toFixed(1)}%)
        </span>
      </div>
      <Progress value={pctVal} className="h-2" />
    </div>
  );
}
