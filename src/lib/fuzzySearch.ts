/**
 * Busca "tolerante": ignora acentos, maiúsculas, pontuação,
 * aceita palavras fora de ordem e erros de digitação leves.
 */

export function normalizeText(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  const n = normalizeText(input);
  return n ? n.split(' ').filter(Boolean) : [];
}

/** Distância de Levenshtein com corte (retorna max+1 se ultrapassar). */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/** Tolerância de erro conforme o tamanho do termo. */
export function typoTolerance(token: string): number {
  if (token.length <= 3) return 0;
  if (token.length <= 5) return 1;
  if (token.length <= 8) return 2;
  return 3;
}

/**
 * Pontua um texto contra a busca.
 * Retorna 0 quando não há correspondência (todos os termos precisam bater).
 */
export function fuzzyScore(haystack: string, query: string): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;

  const hay = normalizeText(haystack);
  if (!hay) return 0;
  const words = hay.split(' ').filter(Boolean);

  let total = 0;
  for (const token of tokens) {
    let best = 0;

    if (hay.startsWith(token)) best = 100;
    else if (words.some((w) => w === token)) best = 95;
    else if (words.some((w) => w.startsWith(token))) best = 85;
    else if (hay.includes(token)) best = 70;
    else {
      const tol = typoTolerance(token);
      if (tol > 0) {
        let bestDist = tol + 1;
        for (const w of words) {
          const d = levenshtein(token, w, tol);
          if (d < bestDist) bestDist = d;
          // também compara com prefixo da palavra (ex.: "carretil" vs "carretilha")
          if (w.length > token.length) {
            const dp = levenshtein(token, w.slice(0, token.length), tol);
            if (dp < bestDist) bestDist = dp;
          }
        }
        if (bestDist <= tol) best = 60 - bestDist * 10;
      }
    }

    if (best === 0) return 0;
    total += best;
  }

  return total / tokens.length;
}

/** Pontua vários campos, dando peso maior aos primeiros. */
export function fuzzyScoreFields(fields: (string | null | undefined)[], query: string): number {
  let best = 0;
  fields.forEach((f, i) => {
    if (!f) return;
    const s = fuzzyScore(f, query) * (1 - Math.min(i, 5) * 0.08);
    if (s > best) best = s;
  });
  return best;
}

/** Filtra e ordena itens por relevância. */
export function fuzzySearch<T>(
  items: T[],
  query: string,
  getFields: (item: T) => (string | null | undefined)[],
  limit?: number
): T[] {
  if (!query.trim()) return limit ? items.slice(0, limit) : items;
  const scored = items
    .map((item) => ({ item, score: fuzzyScoreFields(getFields(item), query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const out = scored.map((x) => x.item);
  return limit ? out.slice(0, limit) : out;
}
