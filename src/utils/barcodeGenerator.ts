/**
 * Gerador de códigos de barras internos curtos (6 dígitos).
 *
 * Formato: 6 dígitos numéricos (ex.: 204731), impressos em CODE39 nas etiquetas.
 */

import { supabase } from '@/integrations/supabase/client';

const CODE_LENGTH = 6;

/**
 * Gera um candidato a código de 6 dígitos.
 */
function generateCandidate(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
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
 * Gera um código de barras interno único de 6 dígitos.
 * Tenta no máximo 20 vezes para encontrar um código não duplicado.
 */
export async function generateUniqueBarcode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateCandidate();
    const exists = await codeExists(candidate);
    if (!exists) return candidate;
  }
  throw new Error('Não foi possível gerar um código de barras único. Tente novamente.');
}
