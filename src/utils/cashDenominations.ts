// Contagem de cédulas e moedas para fechamento de caixa.
// O usuário informa a QUANTIDADE de cada cédula/moeda e o total é calculado.

export interface Denomination {
  value: number;
  label: string;
  kind: "note" | "coin";
}

export const CASH_DENOMINATIONS: Denomination[] = [
  { value: 200, label: "R$ 200", kind: "note" },
  { value: 100, label: "R$ 100", kind: "note" },
  { value: 50, label: "R$ 50", kind: "note" },
  { value: 20, label: "R$ 20", kind: "note" },
  { value: 10, label: "R$ 10", kind: "note" },
  { value: 5, label: "R$ 5", kind: "note" },
  { value: 2, label: "R$ 2", kind: "note" },
  { value: 1, label: "R$ 1", kind: "coin" },
  { value: 0.5, label: "R$ 0,50", kind: "coin" },
  { value: 0.25, label: "R$ 0,25", kind: "coin" },
  { value: 0.1, label: "R$ 0,10", kind: "coin" },
  { value: 0.05, label: "R$ 0,05", kind: "coin" },
];

export type DenominationCounts = Record<string, number | string | undefined>;

/** Soma total contado a partir das quantidades informadas (ignora valores inválidos). */
export function sumDenominations(counts: DenominationCounts): number {
  let cents = 0;
  for (const d of CASH_DENOMINATIONS) {
    const raw = counts[String(d.value)];
    const qty = typeof raw === "string" ? parseInt(raw, 10) : raw;
    if (!qty || !Number.isFinite(qty) || qty <= 0) continue;
    cents += Math.round(d.value * 100) * Math.floor(qty);
  }
  return cents / 100;
}

/** Quantidade total de cédulas/moedas contadas. */
export function countPieces(counts: DenominationCounts): number {
  return CASH_DENOMINATIONS.reduce((acc, d) => {
    const raw = counts[String(d.value)];
    const qty = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return acc + (qty && Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0);
  }, 0);
}
