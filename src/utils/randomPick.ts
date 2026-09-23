/**
 * Embaralha e retorna até `count` itens de forma aleatória (Fisher-Yates).
 * Não muta o array original.
 */
export function pickRandom<T>(items: T[], count: number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.max(0, count));
}
