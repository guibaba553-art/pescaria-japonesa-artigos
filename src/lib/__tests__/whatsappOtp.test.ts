import { describe, it, expect } from 'vitest';
import { toE164, isValidBrMobile, isEmailIdentifier, canResend, RESEND_COOLDOWN_MS, needsPhoneVerification } from '@/lib/whatsappOtp';

describe('toE164', () => {
  it('adiciona +55 a celular de 11 dígitos', () => {
    expect(toE164('66992110000')).toBe('+5566992110000');
  });
  it('adiciona +55 a fixo de 10 dígitos', () => {
    expect(toE164('6633221100')).toBe('+556633221100');
  });
  it('mantém +55 quando já presente', () => {
    expect(toE164('5566992110000')).toBe('+5566992110000');
  });
  it('remove caracteres não numéricos', () => {
    expect(toE164('(66) 99211-0000')).toBe('+5566992110000');
  });
});

describe('isValidBrMobile', () => {
  it('aceita 11 dígitos com DDD válido', () => expect(isValidBrMobile('11992110000')).toBe(true));
  it('aceita 10 dígitos', () => expect(isValidBrMobile('1133221100')).toBe(true));
  it('rejeita DDD começando com 0', () => expect(isValidBrMobile('09992110000')).toBe(false));
  it('rejeita tamanho errado', () => expect(isValidBrMobile('999')).toBe(false));
});

describe('isEmailIdentifier', () => {
  it('detecta e-mail', () => expect(isEmailIdentifier('a@b.com')).toBe(true));
  it('detecta telefone', () => expect(isEmailIdentifier('66992110000')).toBe(false));
  it('rejeita string vazia', () => expect(isEmailIdentifier('')).toBe(false));
});

describe('canResend', () => {
  it('permite primeiro envio', () => expect(canResend(null)).toBe(true));
  it('bloqueia dentro do cooldown', () => {
    const now = Date.now();
    expect(canResend(now - RESEND_COOLDOWN_MS / 2, now)).toBe(false);
  });
  it('libera após cooldown', () => {
    const now = Date.now();
    expect(canResend(now - RESEND_COOLDOWN_MS - 1, now)).toBe(true);
  });
});

describe('needsPhoneVerification', () => {
  it('exige verificação quando phone_confirmed_at ausente', () => {
    expect(needsPhoneVerification(null)).toBe(true);
    expect(needsPhoneVerification({ phone_confirmed_at: null })).toBe(true);
    expect(needsPhoneVerification({ phone_confirmed_at: '2026-01-01' })).toBe(false);
  });
});
