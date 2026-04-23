import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Download, Trash2, FileText, Mail } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function MeusDados() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) navigate("/auth");
  }, [user, navigate]);

  const handleExport = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [profile, orders, reviews, messages] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("orders").select("*, order_items(*)").eq("user_id", user.id),
        supabase.from("reviews").select("*").eq("user_id", user.id),
        supabase.from("chat_messages").select("*").eq("user_id", user.id),
      ]);

      const data = {
        exported_at: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        profile: profile.data,
        orders: orders.data,
        reviews: reviews.data,
        messages: messages.data,
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Dados exportados com sucesso");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao exportar dados");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRequest = () => {
    const subject = encodeURIComponent("Solicitação de Exclusão de Dados (LGPD)");
    const body = encodeURIComponent(
      `Solicito a exclusão dos meus dados pessoais nos termos do Art. 18 da LGPD.\n\nE-mail da conta: ${user?.email}\nID: ${user?.id}\n\nObservação: dados fiscais devem ser mantidos pelo prazo legal de 5 anos.`
    );
    window.location.href = `mailto:robertobaba2@gmail.com?subject=${subject}&body=${body}`;
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-bold mb-2">Meus Dados (LGPD)</h1>
        <p className="text-muted-foreground mb-8">
          Exerça seus direitos de titular conforme o Art. 18 da Lei Geral de Proteção de Dados.
        </p>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Download className="w-5 h-5" /> Exportar meus dados</CardTitle>
              <CardDescription>Baixe um arquivo JSON com todas as informações que armazenamos sobre você (portabilidade).</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleExport} disabled={loading}>
                {loading ? "Exportando..." : "Baixar dados"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Corrigir meus dados</CardTitle>
              <CardDescription>Edite seu nome, CPF, telefone e endereço a qualquer momento.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/conta")}>Ir para Minha Conta</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Falar com o Encarregado (DPO)</CardTitle>
              <CardDescription>Roberto Baba — robertobaba2@gmail.com</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <a href="mailto:robertobaba2@gmail.com?subject=Solicita%C3%A7%C3%A3o%20LGPD">Enviar e-mail ao DPO</a>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive"><Trash2 className="w-5 h-5" /> Solicitar exclusão da conta</CardTitle>
              <CardDescription>
                Sua conta e dados pessoais serão removidos. Dados fiscais (notas, pedidos pagos)
                serão retidos por 5 anos por exigência legal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Solicitar exclusão</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar solicitação de exclusão?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Será aberto um e-mail para nosso Encarregado processar sua solicitação em até 15 dias úteis,
                      conforme a LGPD.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteRequest}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
