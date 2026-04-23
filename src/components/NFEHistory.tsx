import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Package, Building2, Calendar, CheckCircle2, XCircle } from "lucide-react";
import { PanelHeader } from "@/components/admin/PanelHeader";

interface NFEHistoryItem {
  id: string;
  created_at: string;
  fornecedor_nome: string;
  fornecedor_cnpj: string;
  products_count: number;
  tipo: string;
  status: string;
}

export const NFEHistory = () => {
  const [history, setHistory] = useState<NFEHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("nfe_emissions")
        .select("*")
        .eq("tipo", "entrada")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
    } finally {
      setLoading(false);
    }
  };

  const success = history.filter((h) => h.status === "success").length;
  const errors = history.length - success;
  const totalProducts = history.reduce((s, h) => s + (h.products_count || 0), 0);

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <PanelHeader
        icon={FileText}
        title="Histórico de Notas Importadas"
        description="Últimas 50 notas fiscais de entrada processadas"
        kpis={[
          { label: 'Total', value: history.length },
          { label: 'Sucesso', value: success, tone: 'success' },
          { label: 'Erros', value: errors, tone: 'danger' },
          { label: 'Produtos', value: totalProducts, tone: 'primary' },
        ]}
      />

      <CardContent className="p-4 md:p-6">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando histórico...</div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
            <FileText className="w-14 h-14 mb-3 opacity-40" />
            <p className="text-sm font-medium">Nenhuma nota fiscal importada ainda</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {history.map((item) => {
              const ok = item.status === "success";
              return (
                <Card
                  key={item.id}
                  className={`border-l-4 transition-all hover:shadow-md ${
                    ok ? "border-l-emerald-500" : "border-l-destructive"
                  }`}
                >
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{item.fornecedor_nome || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {item.fornecedor_cnpj || "-"}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          ok
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            : "bg-destructive/15 text-destructive border-destructive/30"
                        }
                      >
                        {ok ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                        {ok ? "Sucesso" : "Erro"}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        {item.products_count || 0} produtos
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
