import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';

const REMEMBER_ME_KEY = 'japas:rememberMe';
const SUPABASE_AUTH_KEY = `sb-${import.meta.env.VITE_SUPABASE_PROJECT_ID}-auth-token`;
import { sanitizeNumericInput, formatCPF, formatCEP, formatPhone } from '@/utils/validation';
import { ArrowLeft, Truck, CreditCard, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import japaLogo from '@/assets/japa-logo.png';

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const { signIn, signUp, user } = useAuth();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupCpf, setSignupCpf] = useState('');
  const [signupCep, setSignupCep] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  if (user) {
    navigate(redirectTo);
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);
    if (!error) navigate(redirectTo);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) {
      toast.error('Você precisa aceitar os Termos de Uso e a Política de Privacidade.');
      return;
    }
    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName, signupCpf, signupCep, signupPhone);
    setLoading(false);

    if (error && error.message === 'EMAIL_ALREADY_EXISTS') {
      setLoginEmail(signupEmail);
      setActiveTab('login');
      return;
    }

    if (!error) navigate(redirectTo);
  };

  const benefits = [
    { icon: Truck, label: 'Envio rápido para todo o Brasil' },
    { icon: CreditCard, label: '10x sem juros no cartão' },
    { icon: ShieldCheck, label: 'Compra 100% segura' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left side: brand panel (desktop only) */}
      <div className="hidden lg:flex lg:w-[42%] bg-foreground text-background p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />

        <button
          onClick={() => navigate('/')}
          className="relative flex items-center gap-2.5 hover:opacity-70 transition-opacity self-start"
        >
          <img src={japaLogo} alt="JAPAS" className="h-9 w-9 object-contain" />
          <span className="text-lg font-display font-bold tracking-tight">
            JAPAS<span className="text-primary-glow">.</span>
          </span>
        </button>

        <div className="relative space-y-8">
          <div>
            <p className="text-xs font-bold text-primary-glow uppercase tracking-wider mb-3">
              Bem-vindo
            </p>
            <h1 className="text-4xl xl:text-5xl font-display font-black leading-tight">
              Tudo de pesca,<br />
              <span className="text-background/60">pelo menor preço.</span>
            </h1>
          </div>

          <ul className="space-y-3">
            {benefits.map((b, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <b.icon className="w-4 h-4 text-primary-glow" />
                </div>
                <span className="text-sm font-medium">{b.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-background/50">
          © {new Date().getFullYear()} JAPAS Pesca · Sinop, MT
        </p>
      </div>

      {/* Right side: form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Voltar para a loja
          </Button>

          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <img src={japaLogo} alt="JAPAS" className="h-9 w-9 object-contain" />
            <span className="text-lg font-display font-bold tracking-tight">
              JAPAS<span className="text-primary">.</span>
            </span>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-display font-black mb-1">
              {activeTab === 'login' ? 'Entrar na conta' : 'Criar uma conta'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {activeTab === 'login'
                ? 'Acesse seu perfil, pedidos e ofertas exclusivas.'
                : 'Cadastre-se em segundos e ganhe ofertas no email.'}
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} ref={tabsRef}>
            <TabsList className="grid w-full grid-cols-2 mb-5 h-11 rounded-full p-1">
              <TabsTrigger value="login" className="rounded-full text-sm font-semibold">Entrar</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-full text-sm font-semibold">Criar Conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="h-12 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="h-12 rounded-xl"
                  />
                </div>
                <Button type="submit" className="w-full h-12 rounded-full font-bold text-base btn-press" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </Button>
                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => navigate('/forgot-password')}
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    Esqueci minha senha
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome Completo</Label>
                  <Input id="signup-name" type="text" placeholder="Seu nome" value={signupName} onChange={(e) => setSignupName(e.target.value)} required className="h-11 rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-cpf" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CPF</Label>
                    <Input id="signup-cpf" type="text" placeholder="000.000.000-00" value={formatCPF(signupCpf)} onChange={(e) => setSignupCpf(sanitizeNumericInput(e.target.value))} required maxLength={14} className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-cep" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CEP</Label>
                    <Input id="signup-cep" type="text" placeholder="00000-000" value={formatCEP(signupCep)} onChange={(e) => setSignupCep(sanitizeNumericInput(e.target.value))} required maxLength={9} className="h-11 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telefone</Label>
                  <Input id="signup-phone" type="text" placeholder="(00) 00000-0000" value={formatPhone(signupPhone)} onChange={(e) => setSignupPhone(sanitizeNumericInput(e.target.value))} required maxLength={15} className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
                  <Input id="signup-email" type="email" placeholder="seu@email.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Senha</Label>
                  <Input id="signup-password" type="password" placeholder="Mínimo 6 caracteres" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={6} className="h-11 rounded-xl" />
                </div>
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox id="accept-terms" checked={acceptedTerms} onCheckedChange={(c) => setAcceptedTerms(c === true)} className="mt-0.5" />
                  <Label htmlFor="accept-terms" className="text-xs font-normal leading-snug cursor-pointer text-muted-foreground">
                    Li e aceito os{' '}
                    <Link to="/termos-de-uso" target="_blank" className="text-primary underline font-medium">Termos de Uso</Link>
                    {' '}e a{' '}
                    <Link to="/politica-privacidade" target="_blank" className="text-primary underline font-medium">Política de Privacidade</Link>.
                  </Label>
                </div>
                <Button type="submit" className="w-full h-12 rounded-full font-bold text-base btn-press" disabled={loading || !acceptedTerms}>
                  {loading ? 'Criando conta...' : 'Criar conta grátis'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
