/**
 * Gerador de códigos de barras internos (EAN-13 válido).
 *
 * Códigos começam com "200" — prefixo reservado para uso interno
 * de lojas (não conflita com códigos de fabricantes reais).
 *
 * Formato: 200 + 9 dígitos aleatórios + 1 dígito verificador (EAN-13)
 */

import { supabase } from '@/integrations/supabase/client';

const INTERNAL_PREFIX = '200';

/**
 * Calcula o dígito verificador EAN-13.
 */
function calcEAN13CheckDigit(twelveDigits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(twelveDigits[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

/**
 * Gera um candidato a código EAN-13 com prefixo interno.
 */
function generateCandidate(): string {
  let body = INTERNAL_PREFIX;
  for (let i = 0; i < 9; i++) {
    body += Math.floor(Math.random() * 10).toString();
  }
  const check = calcEAN13CheckDigit(body);
  return body + check.toString();
}

/**
 * Verifica se o código já existe em produtos ou variações.
 */
async function codeExists(code: string): Promise<boolean> {
  const [{ data: prod }, { data: variation }] = await Promise.all([
    supabase.from('products').select('id').eq('sku', code).limit(1).maybeSingle(),
    supabase.from('product_variations').select('id').eq('sku', code).limit(1).maybeSingle(),
  ]);
  return !!prod || !!variation;
}

/**
 * Gera um código de barras interno único (EAN-13, prefixo 200).
 * Tenta no máximo 10 vezes para encontrar um código não duplicado.
 */
export async function generateUniqueBarcode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateCandidate();
    const exists = await codeExists(candidate);
    if (!exists) return candidate;
  }
  throw new Error('Não foi possível gerar um código de barras único. Tente novamente.');
}
