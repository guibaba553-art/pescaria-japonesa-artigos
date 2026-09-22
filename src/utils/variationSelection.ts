import type { ProductVariation } from '@/types/product';

/**
 * Resolve qual variação deve ficar selecionada ao carregar um produto.
 * Regras:
 * - nunca manter uma variação que não pertence à lista atual (evita nome/preço de outro produto)
 * - se houver ?variacao=ID válido, usa essa
 * - senão, mantém a atual só se ela estiver na lista
 */
export function resolveVariationForProduct(
  variations: ProductVariation[],
  wantedId: string | null | undefined,
  currentSelected: ProductVariation | null | undefined
): ProductVariation | null {
  if (!variations || variations.length === 0) return null;

  if (wantedId) {
    const wanted = variations.find((v) => v.id === wantedId);
    if (wanted) return wanted;
  }

  if (currentSelected) {
    const stillValid = variations.find((v) => v.id === currentSelected.id);
    if (stillValid) return stillValid;
  }

  return null;
}
