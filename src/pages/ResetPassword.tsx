import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const redirectToAuthWithError = (description: string) => {
      toast({
        title: "Link inválido ou expirado",
        description,
        variant: "destructive",
      });
      navigate("/auth", { replace: true });
    };

    const getParams = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash,
      );

      return {
        error: searchParams.get("error") || hashParams.get("error"),
        errorDescription:
          searchParams.get("error_description") || hashParams.get("error_description"),
        code: searchParams.get("code") || hashParams.get("code"),
        tokenHash: searchParams.get("token_hash") || hashParams.get("token_hash"),
        type: searchParams.get("type") || hashParams.get("type"),
      };
    };

    const cleanRecoveryParamsFromUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      url.searchParams.delete("type");
      url.searchParams.delete("token_hash");
      url.searchParams.delete("error");
      url.searchParams.delete("error_description");
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
    };

    const bootstrapRecovery = async () => {
      const { error, errorDescription, code, tokenHash, type } = getParams();

      if (error || errorDescription) {
        redirectToAuthWithError(
          decodeURIComponent(errorDescription || error || "Este link não é mais válido.").replace(/\+/g, " "),
        );
        return;
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (cancelled) return;

        if (exchangeError) {
          redirectToAuthWithError(exchangeError.message);
          return;
        }

        cleanRecoveryParamsFromUrl();
        setReady(true);
        return;
      }

      if (tokenHash && type === "recovery") {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });

        if (cancelled) return;

        if (verifyError) {
          redirectToAuthWithError(verifyError.message);
          return;
        }

        cleanRecoveryParamsFromUrl();
        setReady(true);
        return;
      }

      const hashParams = new URLSearchParams(
        window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash,
      );
      const hasImplicitTokens = hashParams.has("access_token") && hashParams.has("refresh_token");

      if (hasImplicitTokens) {
        setReady(true);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (cancelled) return;

      if (session) {
        setReady(true);
        return;
      }

      redirectToAuthWithError("Este link de recuperação é inválido ou expirou. Solicite um novo.");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true);
      }
    });

    void bootstrapRecovery();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter pelo menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    const { error } = await updatePassword(newPassword);
    
    setLoading(false);
    
    if (!error) {
      setTimeout(() => {
        navigate("/");
      }, 1500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/10 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Nova senha</CardTitle>
          <CardDescription>
            Digite sua nova senha abaixo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Nova senha"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={loading || !ready}
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Confirmar nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading || !ready}
                minLength={6}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !ready}
            >
              {loading ? "Atualizando..." : !ready ? "Validando link..." : "Atualizar senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
