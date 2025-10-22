import { z } from 'zod';
import { VALIDATION_RULES } from '@/config/constants';

// Schemas de validação para formulários

export const authSchemas = {
  email: z
    .string()
    .trim()
    .email({ message: 'Email inválido' })
    .max(255, { message: 'Email muito longo' }),
  
  password: z
    .string()
    .min(VALIDATION_RULES.PASSWORD_MIN_LENGTH, { 
      message: `Senha deve ter no mínimo ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} caracteres` 
    }),
  
  cpf: z
    .string()
    .regex(/^\d{11}$/, { message: 'CPF deve ter 11 dígitos' })
    .refine(validateCPF, { message: 'CPF inválido' }),
  
  cep: z
    .string()
    .regex(/^\d{8}$/, { message: 'CEP deve ter 8 dígitos' }),
  
  phone: z
    .string()
    .min(VALIDATION_RULES.PHONE_MIN_LENGTH, { message: 'Telefone inválido' })
    .max(VALIDATION_RULES.PHONE_MAX_LENGTH, { message: 'Telefone inválido' })
    .regex(/^\d+$/, { message: 'Apenas números são permitidos' }),
  
  fullName: z
    .string()
    .trim()
    .min(3, { message: 'Nome deve ter no mínimo 3 caracteres' })
    .max(100, { message: 'Nome muito longo' }),
};

export const signUpSchema = z.object({
  email: authSchemas.email,
  password: authSchemas.password,
  fullName: authSchemas.fullName,
  cpf: authSchemas.cpf,
  cep: authSchemas.cep,
  phone: authSchemas.phone,
});

export const signInSchema = z.object({
  email: authSchemas.email,
  password: authSchemas.password,
});

// Validação de CPF
export function validateCPF(cpf: string): boolean {
  if (!cpf || cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(10, 11))) return false;

  return true;
}

// Sanitização de inputs
export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

export function sanitizeNumericInput(input: string): string {
  return input.replace(/\D/g, '');
}

// Formatação
export function formatCPF(cpf: string): string {
  const clean = sanitizeNumericInput(cpf);
  if (clean.length <= 3) return clean;
  if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
  if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

export function formatCEP(cep: string): string {
  const clean = sanitizeNumericInput(cep);
  if (clean.length <= 5) return clean;
  return `${clean.slice(0, 5)}-${clean.slice(5, 8)}`;
}

export function formatPhone(phone: string): string {
  const clean = sanitizeNumericInput(phone);
  if (clean.length <= 2) return clean;
  if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
}
