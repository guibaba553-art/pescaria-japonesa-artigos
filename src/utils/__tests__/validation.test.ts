import { describe, it, expect } from 'vitest';
import { signUpSchema } from '@/utils/validation';

describe('signUpSchema (telefone como identidade)', () => {
  const valid = {
    password: '123456',
    fullName: 'Gustavo Angeli',
    cpf: '52998224725',
    phone: '66992110000',
  };

  it('aceita cadastro sem e-mail', () => {
    const r = signUpSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejeita e-mails enviados indevidamente (campo removido)', () => {
    const r = signUpSchema.safeParse({ ...valid, email: 'a@b.com' });
    expect(r.success).toBe(true); // zod ignora chave extra por padrão
    expect((r.success && (r.data as { email?: unknown }).email) === undefined).toBe(true);
  });

  it('exige telefone válido', () => {
    expect(signUpSchema.safeParse({ ...valid, phone: '999' }).success).toBe(false);
  });

  it('valida CPF', () => {
    expect(signUpSchema.safeParse({ ...valid, cpf: '11111111111' }).success).toBe(false);
  });
});
