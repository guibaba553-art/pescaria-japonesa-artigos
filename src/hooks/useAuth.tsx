import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { signUpSchema } from '@/utils/validation';
import { VALIDATION_RULES } from '@/config/constants';
import { toE164 } from '@/lib/whatsappOtp';

export interface EmployeePermissions {
  pdv: boolean;
  catalog: boolean;
  cash_register: boolean;
  dashboard: boolean;
  orders: boolean;
  sales_analysis: boolean;
  triagem: boolean;
  fiscal: boolean;
  customers: boolean;
}

const ADMIN_PERMS: EmployeePermissions = {
  pdv: true, catalog: true, cash_register: true, dashboard: true,
  orders: true, sales_analysis: true, triagem: true, fiscal: true, customers: true,
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signUp: (phone: string, password: string, fullName: string, cpf: string) => Promise<{ error: any }>;
  signIn: (identifier: string, password: string) => Promise<{ error: any }>;
  sendPhoneOtp: (phone: string) => Promise<{ error: any }>;
  sendRecoveryOtp: (phone: string) => Promise<{ error: any }>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ error: any }>;
  linkGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
  isEmployee: boolean;
  isAdmin: boolean;
  canAccessPdv: boolean;
  permissions: EmployeePermissions;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canAccessPdv, setCanAccessPdv] = useState(true);
  const [permissions, setPermissions] = useState<EmployeePermissions>(ADMIN_PERMS);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const loading = authLoading || roleLoading;
  const { toast } = useToast();

  useEffect(() => {
    // Guarda o último user.id processado para evitar re-checar role/profile
    // toda vez que a aba volta a ficar visível (TOKEN_REFRESHED, USER_UPDATED, etc.)
    let lastUserId: string | null = null;

    const handleSession = (session: Session | null, isInitial = false, event?: string) => {
      // IMPORTANTE: Ignorar SIGNED_OUT que vem de falha de refresh quando offline
      // ou quando há outras abas. Só desloga se realmente foi um signOut explícito
      // ou se o servidor confirmou (USER_DELETED, etc.).
      if (event === 'TOKEN_REFRESHED' && !session) {
        // Falha de refresh — não desloga imediatamente, mantém estado atual
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      const newUserId = session?.user?.id ?? null;

      // Se o usuário não mudou, não re-executa checagens (evita "reload" ao
      // minimizar/voltar para a aba, que dispara TOKEN_REFRESHED).
      if (!isInitial && newUserId === lastUserId) {
        return;
      }
      lastUserId = newUserId;

      if (session?.user) {
        setRoleLoading(true);
        setTimeout(() => {
          checkUserRole(session.user.id);
          checkProfileCompleteness(session.user.id);
        }, 0);
      } else {
        setIsEmployee(false);
        setIsAdmin(false);
        setCanAccessPdv(true);
        setPermissions(ADMIN_PERMS);
        setRoleLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => handleSession(session, false, event)
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session, true);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Usuários vindos de OAuth (Google) podem chegar sem CPF/CEP/telefone preenchidos.
  // Se faltarem dados, redireciona para a página de completar cadastro.
  const checkProfileCompleteness = async (userId: string) => {
    const path = window.location.pathname;
    const skipPaths = ['/completar-cadastro', '/auth', '/forgot-password', '/reset-password', '/~oauth'];
    if (skipPaths.some((p) => path.startsWith(p))) return;

    const { data } = await supabase
      .from('profiles')
      .select('cpf, phone')
      .eq('id', userId)
      .maybeSingle();

    if (data && (!data.cpf || !data.phone)) {
      const redirect = encodeURIComponent(path + window.location.search);
      window.location.href = `/completar-cadastro?redirect=${redirect}`;
    }
  };

  const checkUserRole = async (userId: string, attempt = 0) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) throw error;
      if (!data) throw new Error('no_data');

      const roles = data.map(r => r.role);
      const employee = roles.includes('employee');
      const admin = roles.includes('admin');
      setIsEmployee(employee);
      setIsAdmin(admin);

      // Admins always have full access. For employees, check granular permissions.
      if (admin) {
        setCanAccessPdv(true);
        setPermissions(ADMIN_PERMS);
      } else if (employee) {
        const { data: perm, error: permErr } = await supabase
          .from('employee_permissions')
          .select('can_access_pdv, can_access_catalog, can_access_cash_register, can_access_dashboard, can_access_orders, can_access_sales_analysis, can_access_triagem, can_access_fiscal, can_access_customers')
          .eq('user_id', userId)
          .maybeSingle();
        if (permErr) throw permErr;
        const p: EmployeePermissions = {
          pdv: perm?.can_access_pdv ?? true,
          catalog: perm?.can_access_catalog ?? true,
          cash_register: perm?.can_access_cash_register ?? false,
          dashboard: perm?.can_access_dashboard ?? false,
          orders: perm?.can_access_orders ?? true,
          sales_analysis: perm?.can_access_sales_analysis ?? false,
          triagem: perm?.can_access_triagem ?? true,
          fiscal: perm?.can_access_fiscal ?? false,
          customers: (perm as any)?.can_access_customers ?? false,
        };
        setCanAccessPdv(p.pdv);
        setPermissions(p);
      } else {
        setCanAccessPdv(true);
        setPermissions(ADMIN_PERMS);
      }
      setRoleLoading(false);
    } catch (err: any) {
      const msg = err?.message || String(err);
      const isNetwork = /failed to fetch|networkerror|network|fetch/i.test(msg);
      // Em erro de rede, tenta de novo até 5x com backoff exponencial.
      // NUNCA derruba permissões silenciosamente — o usuário continua com o
      // que tinha (admin/employee permanece logado e funcional).
      if (isNetwork && attempt < 5) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        setTimeout(() => checkUserRole(userId, attempt + 1), delay);
        return;
      }
      console.error('checkUserRole falhou:', msg);
      setRoleLoading(false);
    }
  };

  const signUp = async (phone: string, password: string, fullName: string, cpf: string) => {
    try {
      signUpSchema.parse({ password, fullName, cpf, phone });
    } catch (error: any) {
      const firstError = error.issues?.[0];
      toast({ title: "Erro de validação", description: firstError?.message || "Dados inválidos", variant: "destructive" });
      return { error: new Error(firstError?.message || "Dados inválidos") };
    }

    const { data, error } = await supabase.auth.signUp({
      phone: toE164(phone),
      password,
      options: {
        // phone no metadata é essencial: o trigger de profiles o usa para
        // popular profiles.phone (checkProfileCompleteness exige cpf+phone).
        // Digitos apenas — profiles.phone tem CHECK (phone ~ '^\d{10,11}$').
        data: { full_name: fullName, cpf, phone },
      },
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('User already registered')) {
        toast({ title: "Telefone já cadastrado", description: "Este telefone já tem conta. Faça login.", variant: "destructive" });
        return { error: new Error('PHONE_ALREADY_EXISTS') };
      }
      toast({ title: "Erro ao criar conta", description: error.message, variant: "destructive" });
      return { error };
    }

    if (data.user && data.user.identities && data.user.identities.length === 0) {
      toast({ title: "Telefone já cadastrado", description: "Este telefone já possui uma conta.", variant: "destructive" });
      return { error: new Error('PHONE_ALREADY_EXISTS') };
    }

    toast({ title: "Conta criada!", description: "Digite o código que enviamos no seu WhatsApp." });
    return { error: null };
  };

  const signIn = async (identifier: string, password: string) => {
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier.trim());
    const credentials = isEmail
      ? { email: identifier.trim(), password }
      : { phone: toE164(identifier), password };

    const { error } = await supabase.auth.signInWithPassword(credentials);

    if (error) {
      toast({ title: "Erro ao fazer login", description: error.message, variant: "destructive" });
    }
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsEmployee(false);
    setIsAdmin(false);
    toast({
      title: "Logout realizado",
      description: "Até logo!"
    });
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    
    if (error) {
      toast({
        title: "Erro ao solicitar recuperação",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
    
    toast({
      title: "Email enviado!",
      description: "Verifique sua caixa de entrada para redefinir sua senha.",
    });
    return { error: null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    
    if (error) {
      toast({
        title: "Erro ao atualizar senha",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
    
    toast({
      title: "Senha atualizada!",
      description: "Sua senha foi atualizada com sucesso.",
    });
    return { error: null };
  };

  const sendPhoneOtp = async (phone: string) => {
    const e164 = toE164(phone);
    // Logado (checkout/legado/troca): atualiza telefone → dispara OTP phone_change.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.auth.updateUser({ phone: e164 });
      if (error) {
        toast({ title: "Erro ao enviar código", description: translatePhoneError(error.message), variant: "destructive" });
        return { error };
      }
      return { error: null };
    }

    // Login via WhatsApp temporariamente desativado (custo por mensagem).
    // Cadastro continua enviando OTP via fluxo nativo do GoTrue; o caminho
    // deslogado aqui era o único que gerava custo adicional.
    toast({
      title: "Login via WhatsApp indisponível",
      description: "Use telefone+senha para entrar. Em breve novamente!",
      variant: "destructive",
    });
    return { error: new Error('WHATSAPP_LOGIN_DISABLED') };
  };

  const sendRecoveryOtp = async (phone: string) => {
    // "Esqueci minha senha" via WhatsApp — fluxo essencial (único caminho de
    // recuperação para contas só-telefone). Custo aceito pelo negócio.
    const { error } = await supabase.auth.signInWithOtp({ phone: toE164(phone) });
    if (error) {
      toast({ title: "Erro ao enviar código", description: translatePhoneError(error.message), variant: "destructive" });
    } else {
      toast({ title: "Código enviado!", description: "Confira o WhatsApp deste número." });
    }
    return { error };
  };

  const verifyPhoneOtp = async (phone: string, token: string) => {
    const e164 = toE164(phone);
    const { data: { user } } = await supabase.auth.getUser();
    const type = user ? ('phone_change' as const) : ('sms' as const);
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token, type });
    if (error) {
      toast({ title: "Código inválido", description: "Confira os 6 dígitos e tente novamente.", variant: "destructive" });
      return { error };
    }
    toast({ title: "Telefone confirmado!" });
    return { error: null };
  };

  const linkGoogle = async () => {
    const { error } = await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) toast({ title: "Não foi possível vincular o Google", description: error.message, variant: "destructive" });
    return { error };
  };

  const translatePhoneError = (message: string): string => {
    if (message.includes('already registered')) return 'Este telefone já tem uma conta. Faça login.';
    if (message.includes('Phone already in use') || message.includes('exists')) return 'Telefone já vinculado a outra conta.';
    return message;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      signUp, 
      signIn, 
      sendPhoneOtp,
      sendRecoveryOtp,
      verifyPhoneOtp,
      linkGoogle,
      signOut,
      resetPassword,
      updatePassword,
      isEmployee,
      isAdmin,
      canAccessPdv,
      permissions,
      loading 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
