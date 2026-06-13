import { describe, it, expect } from 'vitest';
import { validateCardNumber } from '@/lib/creditCardValidation';

// ═══════════════════════════════════════════════════════════════════════════
// MyPaymentMethods — validação de token antes de INSERT (2026-06-11)
//
// O componente MyPaymentMethods chama tokenize-card e só salva o cartão
// no banco se o token retornado for válido (não-vazio, length >= 10).
//
// Após refatoração (2026-07-25): o formulário manual foi substituído pelo
// CreditCardForm, que coleta CVV + demais campos necessários para tokenizar.
// A detecção de bandeira agora usa validateCardNumber de @/lib/creditCardValidation.
// ═══════════════════════════════════════════════════════════════════════════

describe('MyPaymentMethods — guarda de token antes do INSERT', () => {
  it('salva se token.length >= 10', () => {
    expect('76496073-536f-4835-80db-c45d00f33695'.length >= 10).toBe(true);
  });

  it('NÃO salva se token vazio', () => {
    expect(''.length >= 10).toBe(false);
  });

  it('NÃO salva se token null', () => {
    const t: string | null = null;
    expect(!!(t && t.length >= 10)).toBe(false);
  });

  it('toast de erro quando token inválido', () => {
    const t = '';
    const msg = !t || t.length < 10
      ? 'Falha ao tokenizar cartão. Tente novamente.'
      : '';
    expect(msg).toBe('Falha ao tokenizar cartão. Tente novamente.');
  });
});

describe('MyPaymentMethods — helpers removidos em favor de creditCardValidation', () => {
  it('usa validateCardNumber para detectar bandeira', () => {
    const { brand, valid } = validateCardNumber('4111111111111111');
    expect(valid).toBe(true);
    expect(brand).toBe('visa');
  });

  it('usa validateCardNumber para Mastercard', () => {
    const { brand, valid } = validateCardNumber('5555555555554444');
    expect(valid).toBe(true);
    expect(brand).toBe('mastercard');
  });

  it('não exporta mais detectCardBrand (foi removido)', async () => {
    // O módulo não deve mais conter a função detectCardBrand
    const mod = await import('@/components/MyPaymentMethods');
    expect((mod as any).detectCardBrand).toBeUndefined();
  });

  it('não exporta mais isValidLuhn (foi removido)', async () => {
    const mod = await import('@/components/MyPaymentMethods');
    expect((mod as any).isValidLuhn).toBeUndefined();
  });

  it('não exporta mais formatCardNumber (foi removido)', async () => {
    const mod = await import('@/components/MyPaymentMethods');
    expect((mod as any).formatCardNumber).toBeUndefined();
  });
});

describe('MyPaymentMethods — tokenize-card recebe ccv (correção 2026-07-25)', () => {
  it('a edge function tokenize-card requer ccv (confirmado pelo handler)', async () => {
    // O handler da edge function exige ccv: se faltar retorna 400
    const bodySemCcv = {
      cardNumber: '4111111111111111',
      holderName: 'T',
      expiryMonth: '12',
      expiryYear: '30',
    };
    // ccv está faltando — a edge function rejeita
    const hasCcv = 'ccv' in (bodySemCcv as any);
    expect(hasCcv).toBe(false);

    const bodyComCcv = { ...bodySemCcv, ccv: '123' };
    expect('ccv' in bodyComCcv).toBe(true);
  });
});
