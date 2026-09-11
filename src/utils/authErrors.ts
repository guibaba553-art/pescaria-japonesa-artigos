// Traduz mensagens de erro do Supabase Auth (inglês) para pt-BR.
export function translateAuthError(message?: string | null): string {
  const msg = (message || "").toLowerCase();

  if (msg.includes("email not confirmed")) return "E-mail não confirmado. Verifique sua caixa de entrada (e o spam) e confirme seu e-mail antes de entrar.";
  if (msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("user already registered") || msg.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("password should be")) return "A senha deve ter pelo menos 6 caracteres.";
  if (msg.includes("unable to validate email") || msg.includes("invalid email")) return "E-mail inválido.";
  if (msg.includes("email rate limit") || msg.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (msg.includes("user not found")) return "Usuário não encontrado.";
  if (msg.includes("signup is disabled") || msg.includes("signups not allowed")) return "Cadastros estão temporariamente desativados.";
  if (msg.includes("email not allowed")) return "Este e-mail não é permitido.";
  if (msg.includes("weak password")) return "Senha muito fraca. Use uma senha mais forte.";
  if (msg.includes("token has expired") || msg.includes("token is expired") || msg.includes("otp expired")) return "O link expirou. Solicite um novo.";
  if (msg.includes("new password should be different")) return "A nova senha deve ser diferente da anterior.";
  if (msg.includes("network") || msg.includes("failed to fetch")) return "Falha de conexão. Verifique sua internet e tente novamente.";

  return message || "Ocorreu um erro inesperado. Tente novamente.";
}
