import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

interface ErrorRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  message: string;
  stack: string | null;
  source: string | null;
  url: string | null;
  user_agent: string | null;
  severity: string;
  context: unknown;
  created_at: string;
}

export default function AdminErrors() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) navigate("/admin");
  }, [isAdmin, loading, navigate]);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setBusy(false);
    if (error) {
      toast.error("Erro ao carregar: " + error.message);
      return;
    }
    setRows((data || []) as ErrorRow[]);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const deleteOne = async (id: string) => {
    const { error } = await supabase.from("error_logs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const clearAll = async () => {
    if (!confirm("Apagar TODOS os erros registrados?")) return;
    const { error } = await supabase.from("error_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) return toast.error(error.message);
    setRows([]);
    toast.success("Registros apagados");
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        [r.message, r.source, r.url, r.user_email, r.stack].some((v) =>
          (v || "").toLowerCase().includes(q),
        ),
      )
    : rows;

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <div className="bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/20 text-destructive mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider">Painel de Erros</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">Erros do Site</h1>
            <p className="text-sm text-background/60 mt-1">
              Erros capturados de todos os usuários (até 500 mais recentes).
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/admin")}
            className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground self-start md:self-end"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Painel
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por mensagem, URL, e-mail..."
              className="pl-9"
            />
          </div>
          <Button onClick={load} disabled={busy} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${busy ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button onClick={clearAll} variant="destructive" disabled={!rows.length}>
            <Trash2 className="w-4 h-4 mr-2" />
            Limpar tudo
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Mostrando {filtered.length} de {rows.length}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground py-12 border rounded-lg bg-card">
              Nenhum erro registrado.
            </div>
          )}
          {filtered.map((r) => {
            const open = expanded === r.id;
            return (
              <div key={r.id} className="border rounded-lg bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant={r.severity === "warn" ? "secondary" : "destructive"}>
                        {r.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </span>
                      {r.user_email ? (
                        <span className="text-xs">{r.user_email}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">anônimo</span>
                      )}
                      {r.source && (
                        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                          [{r.source}]
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium break-words">{r.message}</div>
                    {r.url && (
                      <div className="text-xs text-muted-foreground truncate mt-1">{r.url}</div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : r.id)}>
                      {open ? "Fechar" : "Detalhes"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteOne(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {open && (
                  <div className="mt-3 space-y-2 text-xs">
                    {r.stack && (
                      <pre className="whitespace-pre-wrap break-words bg-muted/60 rounded p-2 max-h-64 overflow-auto">
                        {r.stack}
                      </pre>
                    )}
                    {r.user_agent && (
                      <div className="text-muted-foreground"><b>UA:</b> {r.user_agent}</div>
                    )}
                    {r.context !== null && r.context !== undefined && (
                      <pre className="whitespace-pre-wrap break-words bg-muted/60 rounded p-2 max-h-48 overflow-auto">
                        {JSON.stringify(r.context, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
