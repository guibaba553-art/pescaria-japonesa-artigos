import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type State =
  | { status: "loading" }
  | { status: "valid" }
  | { status: "already" }
  | { status: "invalid"; message: string }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "invalid", message: "Link de descadastro inválido." });
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        const data = await res.json();

        if (!res.ok) {
          setState({
            status: "invalid",
            message: data?.error || "Token inválido ou expirado.",
          });
          return;
        }

        if (data.valid === false && data.reason === "already_unsubscribed") {
          setState({ status: "already" });
          return;
        }

        setState({ status: "valid" });
      } catch {
        setState({
          status: "invalid",
          message: "Não foi possível validar o link.",
        });
      }
    })();
  }, [token]);

  const handleConfirm = async () => {
    if (!token) return;
    setState({ status: "submitting" });
    const { data, error } = await supabase.functions.invoke(
      "handle-email-unsubscribe",
      { body: { token } },
    );

    if (error) {
      setState({
        status: "error",
        message: "Erro ao processar descadastro. Tente novamente.",
      });
      return;
    }

    if (data?.success || data?.reason === "already_unsubscribed") {
      setState({ status: "success" });
    } else {
      setState({
        status: "error",
        message: "Não foi possível concluir o descadastro.",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Cancelar inscrição</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          {state.status === "loading" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verificando link...</p>
            </div>
          )}

          {state.status === "valid" && (
            <>
              <p className="text-muted-foreground">
                Tem certeza de que deseja parar de receber emails da JAPAS Pesca?
              </p>
              <Button onClick={handleConfirm} variant="destructive" className="w-full">
                Confirmar descadastro
              </Button>
            </>
          )}

          {state.status === "submitting" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Processando...</p>
            </div>
          )}

          {(state.status === "success" || state.status === "already") && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="font-medium">
                {state.status === "success"
                  ? "Você foi descadastrado com sucesso."
                  : "Você já estava descadastrado."}
              </p>
              <p className="text-sm text-muted-foreground">
                Não enviaremos mais emails para este endereço.
              </p>
            </div>
          )}

          {(state.status === "invalid" || state.status === "error") && (
            <div className="flex flex-col items-center gap-3 py-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="font-medium">{state.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
