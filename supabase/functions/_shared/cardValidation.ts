import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

/**
 * Zod schema for validating credit card fields before calling Asaas API.
 * Error messages in Portuguese per requirements (P09).
 */
export const creditCardSchema = z.object({
  cardNumber: z
    .string()
    .min(1, 'Número do cartão inválido')
    .refine((val) => {
      const cleaned = val.replace(/\D/g, '');
      if (cleaned.length < 13 || cleaned.length > 19) return false;
      // Luhn check
      let sum = 0;
      let alternate = false;
      for (let i = cleaned.length - 1; i >= 0; i--) {
        let digit = parseInt(cleaned[i], 10);
        if (alternate) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        alternate = !alternate;
      }
      return sum % 10 === 0;
    }, 'Número do cartão inválido'),
  holderName: z
    .string()
    .min(3, 'Nome do titular inválido (mín. 3 caracteres)'),
  expiryMonth: z
    .string()
    .min(1, 'Data de validade inválida')
    .refine((val) => {
      const clean = val.replace(/\D/g, '');
      const m = parseInt(clean, 10);
      return !isNaN(m) && m >= 1 && m <= 12;
    }, 'Data de validade inválida'),
  expiryYear: z
    .string()
    .min(2, 'Data de validade inválida')
    .max(4, 'Data de validade inválida')
    .refine((val) => {
      const clean = val.replace(/\D/g, '');
      if (clean.length < 2 || clean.length > 4) return false;
      let y = parseInt(clean, 10);
      if (clean.length === 2) y += 2000;
      if (isNaN(y) || y < 2000 || y > 2100) return false;
      // Future-or-current check — just basic year range
      return true;
    }, 'Data de validade inválida'),
  ccv: z
    .string()
    .regex(/^\d{3,4}$/, 'CVV inválido'),
});

/**
 * Validate credit card fields and return an array of error messages.
 * If valid, returns empty array.
 */
export function validateCreditCardFields(card: {
  cardNumber?: string;
  holderName?: string;
  expiryMonth?: string;
  expiryYear?: string;
  ccv?: string;
}): string[] {
  const result = creditCardSchema.safeParse(card);
  if (result.success) return [];

  return result.error.errors.map((err) => err.message);
}
