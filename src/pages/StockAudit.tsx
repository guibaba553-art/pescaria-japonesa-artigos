import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Loader2, Mail, Play, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditRun {
  id: string;
  run_at: string;
  status: string;
  total_skus: number;
  ok_count: number;
  discrepancy_count: number;
  email_sent: boolean;
  error_message: string | null;
}

interface Discrepancy {
  id: string;
  product_name: string;
  variation_name: string | null;
  sku: string | null;
  current_stock: number;
  expected_stock: number;
  difference: number;
  probable_cause: string | null;
  resolved: boolean;
  created_at: string;
  product_id: string;
}

export default function StockAudit() {
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: d }] = await Promise.all([
      supabase.from("stock_audit_runs").select("*").order("run_at", { ascending: false }).limit(30),
      supabase.from("stock_audit_discrepancies").select("*").eq("resolved", false).order("created_at", { ascending: false }).limit(500),
    ]);
    setRuns((r as AuditRun[]) ?? []);
    setDiscrepancies((d as Discrepancy[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("stock-audit-daily");
      if (error) throw error;
      toast({ title: "Auditoria executada", description: `${data?.total_skus ?? 0} SKUs verificados, ${data?.discrepancies ?? 0} divergência(s)` });
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const resolve = async (id: string) => {
    const user = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_audit_discrepancies").update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: user.data.user?.id }).eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setDiscrepancies(prev => prev.filter(d => d.id !== id));
  };

  const lastRun = runs[0];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6" /> Auditoria de Estoque</h1>
          <p className="text-sm text-muted-foreground">Backup XML diário enviado para guibaba553@gmail.com às 03h, com checagem automática de divergências.</p>
        </div>
        <Button onClick={runNow} disabled={running}>
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          Rodar agora
        </Button>
      </div>

      {lastRun && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Última auditoria</div><div className="text-lg font-semibold">{format(new Date(lastRun.run_at), "dd/MM HH:mm", { locale: ptBR })}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">SKUs verificados</div><div className="text-lg font-semibold">{lastRun.total_skus}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Divergências ativas</div><div className={`text-lg font-semibold ${discrepancies.length ? "text-destructive" : "text-green-600"}`}>{discrepancies.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />Email backup</div><div className="text-lg font-semibold">{lastRun.email_sent ? <span className="text-green-600">Enviado</span> : <span className="text-destructive">Falhou</span>}</div></CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Divergências encontradas ({discrepancies.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-6"><Loader2 className="w-6 h-6 animate-spin inline" /></div> :
            discrepancies.length === 0 ? <div className="text-center py-6 text-muted-foreground"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600" />Nenhuma divergência. Estoque conferido ✓</div> :
            <Table>
              <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Atual</TableHead><TableHead className="text-right">Esperado</TableHead><TableHead className="text-right">Diferença</TableHead><TableHead>Causa provável</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {discrepancies.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.product_name}{d.variation_name && <span className="text-muted-foreground"> — {d.variation_name}</span>}</TableCell>
                    <TableCell className="font-mono text-xs">{d.sku || "—"}</TableCell>
                    <TableCell className="text-right">{d.current_stock}</TableCell>
                    <TableCell className="text-right">{d.expected_stock}</TableCell>
                    <TableCell className="text-right"><Badge variant={d.difference > 0 ? "default" : "destructive"}>{d.difference > 0 ? "+" : ""}{d.difference}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.probable_cause}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => resolve(d.id)}>Resolver</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico ({runs.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Status</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead className="text-right">OK</TableHead><TableHead className="text-right">Divergências</TableHead><TableHead>Email</TableHead></TableRow></TableHeader>
            <TableBody>
              {runs.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{format(new Date(r.run_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                  <TableCell><Badge variant={r.status === "success" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">{r.total_skus}</TableCell>
                  <TableCell className="text-right text-green-600">{r.ok_count}</TableCell>
                  <TableCell className="text-right">{r.discrepancy_count > 0 ? <span className="text-destructive font-semibold">{r.discrepancy_count}</span> : 0}</TableCell>
                  <TableCell>{r.email_sent ? "✓" : "✗"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
