import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeNumericInput, formatCPF, formatCEP, formatPhone } from "@/utils/validation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import japaLogo from "@/assets/japa-logo.png";

export default function CompletarCadastro() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const { user, loading: authLoading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [cep, setCep] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/completar-cadastro?redirect=${redirectTo}`)}`);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, cpf, cep, phone")
        .eq("id", user.id)
        .maybeSingle();

      if (data) {
        // Se já está completo, redireciona
        if (data.cpf && data.cep && data.phone) {
          navigate(redirectTo);
          return;
        }
        setFullName(data.full_name || (user.user_metadata?.full_name as string) || "");
        setCpf(data.cpf || "");
        setCep(data.cep || "");
        setPhone(data.phone || "");
      } else {
        setFullName((user.user_metadata?.full_name as string) || "");
      }
      setChecking(false);
    })();
  }, [user, authLoading, navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (cpf.length !== 11) return toast.error("CPF inválido (11 dígitos)");
    if (cep.length !== 8) return toast.error("CEP inválido (8 dígitos)");
    if (phone.length < 10 || phone.length > 11) return toast.error("Telefone inválido");
    if (!fullName.trim()) return toast.error("Informe seu nome completo");

    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), cpf, cep, phone })
      .eq("id", user.id);
    setLoading(false);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }

    toast.success("Cadastro concluído!");
    navigate(redirectTo);
  };

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <img src={japaLogo} alt="JAPAS" className="h-9 w-9 object-contain" />
          <span className="text-lg font-display font-bold tracking-tight">
            JAPAS<span className="text-primary">.</span>
          </span>
        </div>

        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            Falta pouco
          </div>
          <h2 className="text-2xl sm:text-3xl font-display font-black mb-1">
            Complete seu cadastro
          </h2>
          <p className="text-sm text-muted-foreground">
            Precisamos de alguns dados para emitir notas fiscais e calcular frete.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="cc-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome Completo</Label>
            <Input id="cc-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="h-11 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cc-cpf" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CPF</Label>
              <Input id="cc-cpf" type="text" placeholder="000.000.000-00" value={formatCPF(cpf)} onChange={(e) => setCpf(sanitizeNumericInput(e.target.value))} required maxLength={14} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-cep" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CEP</Label>
              <Input id="cc-cep" type="text" placeholder="00000-000" value={formatCEP(cep)} onChange={(e) => setCep(sanitizeNumericInput(e.target.value))} required maxLength={9} className="h-11 rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telefone</Label>
            <Input id="cc-phone" type="text" placeholder="(00) 00000-0000" value={formatPhone(phone)} onChange={(e) => setPhone(sanitizeNumericInput(e.target.value))} required maxLength={15} className="h-11 rounded-xl" />
          </div>
          <Button type="submit" className="w-full h-12 rounded-full font-bold text-base btn-press" disabled={loading}>
            {loading ? "Salvando..." : "Concluir cadastro"}
          </Button>
        </form>
      </div>
    </div>
  );
}
