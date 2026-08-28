import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { OtpVerificationDialog } from "@/components/OtpVerificationDialog";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { formatPhone, sanitizeNumericInput } from "@/utils/validation";
import { isValidBrMobile } from "@/lib/whatsappOtp";
import { toast } from "sonner";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tab, setTab] = useState("email");
  const [loading, setLoading] = useState(false);
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [otpPhone, setOtpPhone] = useState("");
  const { resetPassword, sendRecoveryOtp } = useAuth();
  const navigate = useNavigate();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await resetPassword(email);

    setLoading(false);

    if (!error) {
      setTimeout(() => navigate("/auth"), 2000);
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = sanitizeNumericInput(phone);
    if (!isValidBrMobile(digits)) return toast.error("Digite seu telefone com DDD.");
    setLoading(true);

    const { error } = await sendRecoveryOtp(digits);

    setLoading(false);
    if (!error) {
      setOtpPhone(digits);
      setOtpDialogOpen(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/10 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/auth")}
            className="w-fit -ml-2 mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <CardTitle className="text-2xl font-bold">Recuperar senha</CardTitle>
          <CardDescription>
            Escolha o canal para receber o código de recuperação
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4 h-10 rounded-full p-1">
              <TabsTrigger value="email" className="rounded-full text-sm font-semibold">E-mail</TabsTrigger>
              <TabsTrigger value="phone" className="rounded-full text-sm font-semibold">WhatsApp</TabsTrigger>
            </TabsList>

            <TabsContent value="email">
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Enviando..." : "Enviar instruções"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="phone">
              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="text"
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                    value={formatPhone(phone)}
                    onChange={(e) => setPhone(sanitizeNumericInput(e.target.value))}
                    required
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  <MessageCircle className="h-4 w-4 text-[#25D366]" />
                  {loading ? "Enviando..." : "Recuperar via WhatsApp"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Enviamos um código de 6 dígitos no seu WhatsApp. Com ele, você
                  define uma nova senha.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <OtpVerificationDialog
        open={otpDialogOpen}
        onOpenChange={setOtpDialogOpen}
        phone={otpPhone}
        alreadySent
        onSuccess={() => navigate("/reset-password")}
      />
    </div>
  );
};

export default ForgotPassword;