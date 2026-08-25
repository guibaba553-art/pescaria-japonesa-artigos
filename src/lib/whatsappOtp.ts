export const RESEND_COOLDOWN_MS = 60_000;

export function toE164(digits: string): string {
  let d = digits.replace(/\D/g, '');
  if (!d.startsWith('55') && d.length >= 10) d = `55${d}`;
  return `+${d}`;
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
