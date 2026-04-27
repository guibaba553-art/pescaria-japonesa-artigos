import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { signUpSchema } from '@/utils/validation';
import { VALIDATION_RULES } from '@/config/constants';

export interface EmployeePermissions {
  pdv: boolean;
  catalog: boolean;
  cash_register: boolean;
  dashboard: boolean;
  orders: boolean;
  sales_analysis: boolean;
  triagem: boolean;
  fiscal: boolean;
}

const ADMIN_PERMS: EmployeePermissions = {
  pdv: true, catalog: true, cash_register: true, dashboard: true,
  orders: true, sales_analysis: true, triagem: true, fiscal: true,
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signUp: (email: string, password: string, fullName: string, cpf: string, phone: string, cep?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
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

    const handleSession = (session: Session | null, isInitial = false) => {
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
      (_event, session) => handleSession(session)
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

  const checkUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (!error && data) {
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
          const { data: perm } = await supabase
            .from('employee_permissions')
            .select('can_access_pdv, can_access_catalog, can_access_cash_register, can_access_dashboard, can_access_orders, can_access_sales_analysis, can_access_triagem, can_access_fiscal')
            .eq('user_id', userId)
            .maybeSingle();
          const p: EmployeePermissions = {
            pdv: perm?.can_access_pdv ?? true,
            catalog: perm?.can_access_catalog ?? true,
            cash_register: perm?.can_access_cash_register ?? false,
            dashboard: perm?.can_access_dashboard ?? false,
            orders: perm?.can_access_orders ?? true,
            sales_analysis: perm?.can_access_sales_analysis ?? false,
            triagem: perm?.can_access_triagem ?? true,
            fiscal: perm?.can_access_fiscal ?? false,
          };
          setCanAccessPdv(p.pdv);
          setPermissions(p);
        } else {
          setCanAccessPdv(true);
          setPermissions(ADMIN_PERMS);
        }
      }
    } finally {
      setRoleLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string, cpf: string, phone: string, cep?: string) => {
    // Validar todos os campos usando zod
    try {
      signUpSchema.parse({
        email,
        password,
        fullName,
        cpf,
        cep: cep || '',
        phone
      });
    } catch (error: any) {
      const firstError = error.errors?.[0];
      toast({
        title: "Erro de validação",
        description: firstError?.message || "Dados inválidos",
        variant: "destructive"
      });
      return { error: new Error(firstError?.message || "Dados inválidos") };
    }
    
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName
        }
      }
    });

    if (error) {
      // Verificar se é erro de email duplicado
      if (error.message.includes('already registered') || error.message.includes('User already registered')) {
        toast({
          title: "Email já cadastrado",
          description: "Este email já possui uma conta. Por favor, faça login ou use outro email.",
          variant: "destructive"
        });
        return { error: new Error('EMAIL_ALREADY_EXISTS') };
      }
      
      toast({
        title: "Erro ao criar conta",
        description: error.message,
        variant: "destructive"
      });
      return { error };
    }

    // Se o usuário já existe mas não há erro (conta não confirmada ainda)
    if (data.user && !data.session) {
      toast({
        title: "Email já cadastrado",
        description: "Este email já possui uma conta. Verifique sua caixa de entrada ou faça login.",
        variant: "destructive"
      });
      return { error: new Error('EMAIL_ALREADY_EXISTS') };
    }

    // Atualizar perfil com CPF, telefone e (opcionalmente) CEP
    if (data.user) {
      const profileUpdate: { cpf: string; phone: string; cep?: string } = { cpf, phone };
      if (cep && cep.length === 8) profileUpdate.cep = cep;

      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', data.user.id);

      if (profileError) {
        console.error('Erro ao atualizar perfil:', profileError);
      }
    }

    toast({
      title: "Conta criada!",
      description: "Verifique seu e-mail para confirmar o cadastro antes de fazer login."
    });

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      toast({
        title: "Erro ao fazer login",
        description: error.message,
        variant: "destructive"
      });
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

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      signUp, 
      signIn, 
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
