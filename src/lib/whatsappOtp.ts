export const RESEND_COOLDOWN_MS = 60_000;

export function toE164(digits: string): string {
  let d = digits.replace(/\D/g, '');
  // DDD 55 (RS) pode abrir número local (55999112233): 12-13 dígitos já são
  // E.164 (55 + DDD + número) — não confundir com prefixo de país já presente.
  const isE164Br = d.length >= 12 && d.length <= 13 && d.startsWith('55');
  if (isE164Br) return `+${d}`;
  if (d.length >= 10 && d.length <= 11) d = `55${d}`;
  return `+${d}`;
}

// Remove o código do país para EXIBIÇÃO (formatPhone espera 10-11 dígitos).
// GoTrue guarda user.phone sem o "+" (ex.: "5563992843900", 13 dígitos);
// números locais com DDD 55 (RS) têm 11 dígitos iniciando em 55 — NÃO cortar.
export function toLocalDigits(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d.slice(2);
  return d;
}

export function isValidBrMobile(digits: string): boolean {
  if (!/^\d{10,11}$/.test(digits)) return false;
  const ddd = parseInt(digits.slice(0, 2), 10);
  return ddd >= 11 && ddd <= 99 && digits[0] !== '0';
}

export function isEmailIdentifier(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

export function canResend(lastSentAt: number | null, now: number = Date.now()): boolean {
  if (lastSentAt === null) return true;
  return now - lastSentAt >= RESEND_COOLDOWN_MS;
}

export function needsPhoneVerification(user: { phone_confirmed_at?: string | null } | null | undefined): boolean {
  return !user?.phone_confirmed_at;
}
