import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, Trash2, Search, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
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
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});

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
    if (error) {
      setBusy(false);
      toast.error("Erro ao carregar: " + error.message);
      return;
    }
    const list = (data || []) as ErrorRow[];
    setRows(list);

    const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const m: Record<string, string> = {};
      (profs || []).forEach((p: any) => { if (p.full_name) m[p.id] = p.full_name; });
      setNames(m);
    } else {
      setNames({});
    }
    setBusy(false);
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

  const explain = async (r: ErrorRow) => {
    setSummarizing((s) => ({ ...s, [r.id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("explain-error", {
        body: {
          message: r.message,
          stack: r.stack,
          source: r.source,
          url: r.url,
          user_agent: r.user_agent,
          context: r.context,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSummaries((s) => ({ ...s, [r.id]: (data as any).summary }));
    } catch (e: any) {
      toast.error(e.message || "Falha ao gerar resumo");
    } finally {
      setSummarizing((s) => ({ ...s, [r.id]: false }));
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        [r.message, r.source, r.url, r.user_email, r.stack, names[r.user_id || ""]].some((v) =>
          (v || "").toLowerCase().includes(q),
        ),
      )
    : rows;

  const groupedByDay = useMemo(() => {
    const groups: Record<string, ErrorRow[]> = {};
    for (const r of filtered) {
      const d = new Date(r.created_at);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      (groups[key] ||= []).push(r);
    }
    return Object.entries(groups).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const fmtDay = (key: string) => {
    const [y, m, d] = key.split("-");
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  };

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
              Erros capturados de todos os usuários, agrupados por dia.
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
              placeholder="Buscar por mensagem, URL, e-mail ou nome..."
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

        {groupedByDay.length === 0 && (
          <div className="text-center text-muted-foreground py-12 border rounded-lg bg-card">
            Nenhum erro registrado.
          </div>
        )}

        <div className="space-y-4">
          {groupedByDay.map(([day, list]) => {
            const isOpen = openDays[day] ?? true;
            return (
              <div key={day} className="border rounded-lg bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenDays((s) => ({ ...s, [day]: !isOpen }))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-semibold capitalize">{fmtDay(day)}</span>
                  </div>
                  <Badge variant="secondary">{list.length} {list.length === 1 ? "erro" : "erros"}</Badge>
                </button>

                {isOpen && (
                  <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((r) => {
                      const time = new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                      const name = (r.user_id && names[r.user_id]) || null;
                      return (
                        <div key={r.id} className="border rounded-md bg-background p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant={r.severity === "warn" ? "secondary" : "destructive"} className="text-[10px]">
                              {r.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground tabular-nums">{time}</span>
                          </div>

                          <div className="text-xs">
                            <div className="font-medium truncate">{name || "Anônimo"}</div>
                            <div className="text-muted-foreground truncate">{r.user_email || "sem e-mail"}</div>
                          </div>

                          <div className="text-sm font-medium break-words line-clamp-3" title={r.message}>
                            {r.message}
                          </div>

                          {r.url && (
                            <div className="text-[11px] text-muted-foreground truncate" title={r.url}>
                              {r.url}
                            </div>
                          )}

                          <div className="flex gap-1 mt-auto pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => explain(r)}
                              disabled={!!summarizing[r.id]}
                            >
                              <Sparkles className={`w-3.5 h-3.5 mr-1 ${summarizing[r.id] ? "animate-pulse" : ""}`} />
                              {summarizing[r.id] ? "Analisando..." : summaries[r.id] ? "Reanalisar" : "Resumo IA"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteOne(r.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>

                          {summaries[r.id] && (
                            <div className="mt-1 text-xs bg-muted/60 rounded p-2 whitespace-pre-wrap break-words max-h-64 overflow-auto">
                              {summaries[r.id]}
                            </div>
                          )}

                          {r.stack && (
                            <details className="text-[11px] text-muted-foreground">
                              <summary className="cursor-pointer hover:text-foreground">Stack trace</summary>
                              <pre className="whitespace-pre-wrap break-words mt-1 max-h-48 overflow-auto">{r.stack}</pre>
                            </details>
                          )}
                        </div>
                      );
                    })}
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
