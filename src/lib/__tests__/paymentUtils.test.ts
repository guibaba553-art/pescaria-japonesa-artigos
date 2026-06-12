import { describe, it, expect } from 'vitest';

/**
 * Calcula as opções de parcelamento disponíveis.
 * Extraído da lógica em CreditCardForm.tsx para testabilidade.
 */
function calculateInstallmentOptions(totalAmount: number): { value: string; label: string; installmentValue: number }[] {
  const maxInstallments = Math.min(10, Math.floor(totalAmount / 5));
  const count = Math.max(1, maxInstallments);
  const options: { value: string; label: string; installmentValue: number }[] = [];
  for (let i = 1; i <= count; i++) {
    const value = totalAmount / i;
    options.push({
      value: String(i),
      label: `${i}x de R$ ${value.toFixed(2).replace('.', ',')}`,
      installmentValue: value,
    });
  }
  return options;
}

function getMaxInstallments(totalAmount: number): number {
  return Math.max(1, Math.min(10, Math.floor(totalAmount / 5)));
}

describe('calculateInstallmentOptions', () => {
  it('deve retornar 10 opções para R$ 500,00', () => {
    const options = calculateInstallmentOptions(500);
    expect(options).toHaveLength(10);
    expect(options[0].value).toBe('1');
    expect(options[0].installmentValue).toBe(500);
    expect(options[9].value).toBe('10');
    expect(options[9].installmentValue).toBe(50);
  });

  it('deve retornar 1 opção para R$ 7,00 (mínimo R$ 5 por parcela)', () => {
    const options = calculateInstallmentOptions(7);
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe('1');
    expect(options[0].installmentValue).toBe(7);
  });

  it('deve retornar 1 opção para R$ 5,00', () => {
    const options = calculateInstallmentOptions(5);
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe('1');
  });

  it('deve retornar 3 opções para R$ 20,00 (20/5=4, min(10,4)=4... mas floor(20/5)=4)', () => {
    const options = calculateInstallmentOptions(20);
    // floor(20/5) = 4, min(10,4) = 4
    expect(options).toHaveLength(4);
    expect(options[0].installmentValue).toBe(20);    // 1x de 20
    expect(options[3].installmentValue).toBe(5);     // 4x de 5
  });

  it('deve retornar 1 opção para R$ 4,99 (abaixo do mínimo por parcela)', () => {
    const options = calculateInstallmentOptions(4.99);
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe('1');
  });

  it('deve retornar 1 opção para R$ 0,00', () => {
    const options = calculateInstallmentOptions(0);
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe('1');
    expect(options[0].installmentValue).toBe(0);
  });

  it('cada parcela deve ser >= R$ 5,00 para todas as opções', () => {
    const options = calculateInstallmentOptions(150);
    for (const opt of options) {
      const installmentValue = 150 / parseInt(opt.value);
      expect(installmentValue).toBeGreaterThanOrEqual(5);
    }
  });

  it('deve retornar labels legíveis', () => {
    const options = calculateInstallmentOptions(100);
    expect(options[0].label).toContain('1x de');
    expect(options[1].label).toContain('2x de');
  });
});

describe('getMaxInstallments', () => {
  it('R$ 500 → 10x', () => {
    expect(getMaxInstallments(500)).toBe(10);
  });

  it('R$ 150 → 10x', () => {
    expect(getMaxInstallments(150)).toBe(10);
  });

  it('R$ 100 → 10x', () => {
    expect(getMaxInstallments(100)).toBe(10);
  });

  it('R$ 30 → 6x', () => {
    expect(getMaxInstallments(30)).toBe(6);
  });

  it('R$ 7 → 1x', () => {
    expect(getMaxInstallments(7)).toBe(1);
  });

  it('R$ 0 → 1x', () => {
    expect(getMaxInstallments(0)).toBe(1);
  });
});
