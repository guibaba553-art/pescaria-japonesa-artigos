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
