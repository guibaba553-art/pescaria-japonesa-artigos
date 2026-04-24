/**
 * Helpers de prova social com números pseudo-aleatórios DETERMINÍSTICOS.
 *
 * Por que determinístico?
 * - O mesmo produto mostra sempre o mesmo número (durante o dia),
 *   evitando sensação de "fake" ao recarregar a página.
 * - Muda diariamente para parecer atividade real ao longo do tempo.
 *
 * Importante: NÃO usamos isso como métrica real — apenas como gatilho
 * de prova social/urgência. Não inventamos avaliações nem reviews.
 */

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function dayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Quantas pessoas estão "vendo agora" o produto.
 * Range pequeno (3–14) para soar plausível.
 */
export function viewersNow(productId: string): number {
  const seed = hashString(productId + dayKey() + 'viewers');
  return 3 + (seed % 12);
}

/**
 * Quantas vendas o produto teve "recentemente" (últimas 24h).
 * Só retorna se o produto tem rating bom — senão soaria forçado.
 */
export function recentSales(productId: string, hasGoodRating: boolean): number | null {
  if (!hasGoodRating) return null;
  const seed = hashString(productId + dayKey() + 'sales');
  // ~30% dos produtos mostram contador
  if (seed % 10 < 7) return null;
  return 2 + (seed % 18);
}
