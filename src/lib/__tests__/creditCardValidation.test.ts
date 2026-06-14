import { describe, it, expect } from 'vitest';
import {
  luhnCheck,
  detectBrand,
  getBrandLabel,
  validateCardNumber,
  validateExpiry,
  validateCVV,
  validateHolderName,
} from '../creditCardValidation';

// ─── luhnCheck ──────────────────────────────────────────────
describe('luhnCheck', () => {
  it('deve aceitar número Visa 4242424242424242', () => {
    expect(luhnCheck('4242424242424242')).toBe(true);
  });

  it('deve aceitar número Mastercard 5555666677778884', () => {
    expect(luhnCheck('5555666677778884')).toBe(true);
  });

  it('deve rejeitar 1234567890123456', () => {
    expect(luhnCheck('1234567890123456')).toBe(false);
  });

  it('deve retornar true para string vazia (Luhn de soma 0 é válido, validação real é no validateCardNumber)', () => {
    // Luhn: string vazia → sum=0 → 0%10=0 → true
    // O guard de tamanho está em validateCardNumber (min 13 dígitos)
    expect(luhnCheck('')).toBe(true);
  });

  it('deve rejeitar string com letras', () => {
    expect(luhnCheck('4242abcd4242')).toBe(false);
  });

  it('deve aceitar cartão de teste Elo conhecido', () => {
    // Elo 6362970000457013 (cartão de teste válido)
    expect(luhnCheck('6362970000457013')).toBe(true);
  });

  it('deve aceitar Amex 378282246310005', () => {
    expect(luhnCheck('378282246310005')).toBe(true);
  });
});

// ─── detectBrand ────────────────────────────────────────────
describe('detectBrand', () => {
  it('deve detectar Visa para número começando com 4', () => {
    expect(detectBrand('4242424242424242')).toBe('visa');
  });

  it('deve detectar Mastercard para número começando com 5[1-5]', () => {
    expect(detectBrand('5555666677778884')).toBe('mastercard');
  });

  it('deve detectar Mastercard para número começando com 2[2-7]', () => {
    expect(detectBrand('2223000048400011')).toBe('mastercard');
  });

  it('deve detectar Elo para prefixo 6362', () => {
    expect(detectBrand('6362970000457013')).toBe('elo');
  });

  it('deve detectar Amex para número começando com 37', () => {
    expect(detectBrand('378282246310005')).toBe('amex');
  });

  it('deve detectar Discover para número começando com 6011', () => {
    expect(detectBrand('6011111111111117')).toBe('discover');
  });

  it('deve detectar Hipercard para prefixo 606282', () => {
    expect(detectBrand('6062825624254001')).toBe('hipercard');
  });

  it('deve detectar Diners para número começando com 30', () => {
    expect(detectBrand('30123456789019')).toBe('diners');
  });

  it('deve retornar null para número desconhecido', () => {
    expect(detectBrand('9999999999999999')).toBeNull();
  });

  it('deve retornar null para string vazia', () => {
    expect(detectBrand('')).toBeNull();
  });
});

// ─── getBrandLabel ──────────────────────────────────────────
describe('getBrandLabel', () => {
  it('Visa', () => expect(getBrandLabel('visa')).toBe('VISA'));
  it('Mastercard', () => expect(getBrandLabel('mastercard')).toBe('MASTERCARD'));
  it('Elo', () => expect(getBrandLabel('elo')).toBe('ELO'));
  it('Amex', () => expect(getBrandLabel('amex')).toBe('AMEX'));
  it('Discover', () => expect(getBrandLabel('discover')).toBe('DISCOVER'));
  it('Hipercard', () => expect(getBrandLabel('hipercard')).toBe('HIPERCARD'));
  it('Diners', () => expect(getBrandLabel('diners')).toBe('DINERS'));

  it('deve retornar o próprio nome em maiúsculo para marca desconhecida', () => {
    expect(getBrandLabel('unknown')).toBe('UNKNOWN');
  });

  it('deve retornar "Desconhecido" para null', () => {
    expect(getBrandLabel(null)).toBe('Desconhecido');
  });
});

// ─── validateCardNumber ─────────────────────────────────────
describe('validateCardNumber', () => {
  it('deve validar número Visa 4242424242424242', () => {
    const result = validateCardNumber('4242424242424242');
    expect(result.valid).toBe(true);
    expect(result.brand).toBe('visa');
  });

  it('deve validar número Mastercard 5555666677778884', () => {
    const result = validateCardNumber('5555666677778884');
    expect(result.valid).toBe(true);
    expect(result.brand).toBe('mastercard');
  });

  it('deve validar com formatação (espaços)', () => {
    const result = validateCardNumber('4242 4242 4242 4242');
    expect(result.valid).toBe(true);
    expect(result.brand).toBe('visa');
  });

  it('deve rejeitar número inválido', () => {
    const result = validateCardNumber('1234567890123456');
    expect(result.valid).toBe(false);
    expect(result.brand).toBeNull();
  });

  it('deve rejeitar número muito curto (< 13 dígitos)', () => {
    const result = validateCardNumber('4242');
    expect(result.valid).toBe(false);
    expect(result.brand).toBeNull();
  });

  it('deve rejeitar número muito longo (> 16 dígitos)', () => {
    const result = validateCardNumber('42424242424242424242');
    expect(result.valid).toBe(false);
    expect(result.brand).toBeNull();
  });

  it('deve rejeitar string vazia', () => {
    const result = validateCardNumber('');
    expect(result.valid).toBe(false);
    expect(result.brand).toBeNull();
  });

  it('deve rejeitar número com letras', () => {
    const result = validateCardNumber('4242abcd42424242');
    expect(result.valid).toBe(false);
    expect(result.brand).toBeNull();
  });
});

// ─── validateExpiry ────────────────────────────────────────
describe('validateExpiry', () => {
  it('deve aceitar uma data futura (12/30 com ano de 2 dígitos)', () => {
    expect(validateExpiry('12', '30')).toBe(true);
  });

  it('deve aceitar uma data futura (12/2030 com ano de 4 dígitos)', () => {
    expect(validateExpiry('12', '2030')).toBe(true);
  });

  it('deve rejeitar mês 13', () => {
    expect(validateExpiry('13', '30')).toBe(false);
  });

  it('deve rejeitar mês 00', () => {
    expect(validateExpiry('00', '30')).toBe(false);
  });

  it('deve rejeitar ano passado (01/20)', () => {
    expect(validateExpiry('01', '20')).toBe(false);
  });

  it('deve rejeitar mês vazio', () => {
    expect(validateExpiry('', '30')).toBe(false);
  });

  it('deve rejeitar ano vazio', () => {
    expect(validateExpiry('12', '')).toBe(false);
  });

  it('deve rejeitar mês com letras', () => {
    expect(validateExpiry('ab', '30')).toBe(false);
  });

  it('deve rejeitar ano com letras', () => {
    expect(validateExpiry('12', 'ab')).toBe(false);
  });

  it('deve rejeitar ano de 1 dígito', () => {
    expect(validateExpiry('12', '3')).toBe(false);
  });
});

// ─── validateCVV ────────────────────────────────────────────
describe('validateCVV', () => {
  it('deve aceitar CVV de 3 dígitos', () => {
    expect(validateCVV('123')).toBe(true);
  });

  it('deve aceitar CVV de 4 dígitos (Amex)', () => {
    expect(validateCVV('1234')).toBe(true);
  });

  it('deve rejeitar CVV de 2 dígitos', () => {
    expect(validateCVV('12')).toBe(false);
  });

  it('deve rejeitar CVV de 5 dígitos', () => {
    expect(validateCVV('12345')).toBe(false);
  });

  it('deve rejeitar CVV vazio', () => {
    expect(validateCVV('')).toBe(false);
  });

  it('deve rejeitar CVV com letras', () => {
    expect(validateCVV('abc')).toBe(false);
  });
});

// ─── validateHolderName ─────────────────────────────────────
describe('validateHolderName', () => {
  it('deve aceitar nome com 3+ caracteres', () => {
    expect(validateHolderName('João Silva')).toBe(true);
  });

  it('deve aceitar nome com exatamente 3 caracteres', () => {
    expect(validateHolderName('Ana')).toBe(true);
  });

  it('deve rejeitar nome com 2 caracteres', () => {
    expect(validateHolderName('Jo')).toBe(false);
  });

  it('deve rejeitar string vazia', () => {
    expect(validateHolderName('')).toBe(false);
  });

  it('deve rejeitar apenas espaços', () => {
    expect(validateHolderName('   ')).toBe(false);
  });

  it('deve aceitar nome com acentos e caracteres especiais', () => {
    expect(validateHolderName('José María González')).toBe(true);
  });
});
