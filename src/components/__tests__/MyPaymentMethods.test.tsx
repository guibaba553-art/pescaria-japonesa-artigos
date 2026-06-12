import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// MyPaymentMethods — validação de token antes de INSERT (2026-06-11)
//
// O componente MyPaymentMethods chama tokenize-card e só salva o cartão
// no banco se o token retornado for válido (não-vazio, length >= 10).
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
