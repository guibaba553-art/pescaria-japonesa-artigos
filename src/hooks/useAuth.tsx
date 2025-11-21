import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { signUpSchema } from '@/utils/validation';
import { VALIDATION_RULES } from '@/config/constants';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signUp: (email: string, password: string, fullName: string, cpf: string, cep: string, phone: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
  isEmployee: boolean;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            checkUserRole(session.user.id);
          }, 0);
        } else {
          setIsEmployee(false);
          setIsAdmin(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        checkUserRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRole = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (!error && data) {
      const roles = data.map(r => r.role);
      setIsEmployee(roles.includes('employee'));
      setIsAdmin(roles.includes('admin'));
    }
  };

  const signUp = async (email: string, password: string, fullName: string, cpf: string, cep: string, phone: string) => {
    // Validar todos os campos usando zod
    try {
      signUpSchema.parse({
        email,
        password,
        fullName,
        cpf,
        cep,
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

    // Atualizar perfil com CPF, CEP e telefone
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          cpf, 
          cep, 
          phone 
        })
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
