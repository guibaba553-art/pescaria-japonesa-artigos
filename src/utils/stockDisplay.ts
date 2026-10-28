/**
 * Retorna a mensagem de baixo estoque para exibição na página do produto.
 * - Estoque ≤ 0 → null
 * - Estoque ≤ 10 → alerta de baixo estoque
 * - Estoque > 10 → null (não mostra nada)
 */
export function getStockMessage(stock: number): string | null {
  if (stock <= 0) return null;
  if (stock <= 10) {
    return `⚠️ Apenas ${stock} ${stock === 1 ? 'unidade' : 'unidades'} em estoque`;
  }
  return null;
}

/** Produtos com variações usam somente o saldo das variações, nunca o saldo principal antigo. */
export function getPdvDisplayStock(product: {
  stock: number;
  variations?: { stock: number }[];
}): number {
  const available = (stock: number) => Number.isFinite(Number(stock)) ? Math.max(0, Number(stock)) : 0;
  if (product.variations?.length) {
    return product.variations.reduce((total, variation) => total + available(variation.stock), 0);
  }
  return available(product.stock);
}
