import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string;
const COOLDOWN_SECONDS = 60;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [emailError, setEmailError] = useState("");
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  // Cooldown regressivo
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const validateEmail = (value: string): string => {
    if (!value.trim()) return "O email é obrigatório.";
    if (!EMAIL_REGEX.test(value.trim())) return "Formato de email inválido.";
    return "";
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (emailError) setEmailError(validateEmail(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateEmail(email);
    if (validationError) {
      setEmailError(validationError);
      return;
    }
    setEmailError("");

    const captchaToken = recaptchaRef.current?.getValue();
    if (!captchaToken) {
      setEmailError("Confirme que você não é um robô.");
      return;
    }

    setLoading(true);
    const { error } = await resetPassword(email.trim(), captchaToken);
    setLoading(false);
    recaptchaRef.current?.reset();

    if (!error) {
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;

    const captchaToken = recaptchaRef.current?.getValue();
    if (!captchaToken) {
      setEmailError("Confirme que você não é um robô.");
      return;
    }

    setLoading(true);
    await resetPassword(email.trim(), captchaToken);
    setLoading(false);
    recaptchaRef.current?.reset();
    setCooldown(COOLDOWN_SECONDS);
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
            {sent
              ? "Email enviado! Verifique sua caixa de entrada."
              : "Digite seu email para receber as instruções de recuperação"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
                <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Instruções enviadas</p>
                  <p className="text-muted-foreground mt-1">
                    Se o email{" "}
                    <strong>{email}</strong>{" "}
                    estiver cadastrado, você receberá um link para redefinir sua senha em instantes.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleResend}
                  disabled={cooldown > 0 || loading}
                >
                  {cooldown > 0
                    ? `Reenviar em ${cooldown}s`
                    : loading
                      ? "Enviando..."
                      : "Reenviar email"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate("/auth")}
                >
                  Voltar para o login
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={handleEmailChange}
                  required
                  disabled={loading}
                  className={emailError ? "border-destructive" : ""}
                  autoComplete="email"
                />
                {emailError && (
                  <p className="text-xs text-destructive">{emailError}</p>
                )}
              </div>

              <div className="flex justify-center">
                <ReCAPTCHA
                  ref={recaptchaRef}
                  sitekey={RECAPTCHA_SITE_KEY}
                  hl="pt-BR"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enviando..." : "Enviar instruções"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
