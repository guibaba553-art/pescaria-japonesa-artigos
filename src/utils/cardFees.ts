// Taxas da maquininha (Stone — Mastercard, sem antecipação, recebe no prazo da parcela).
// Aplicadas SOMENTE em vendas do PDV pagas com cartão.
import { normalizePaymentMethod } from "@/utils/pdvSettlement";

/**
 * Retorna a taxa (fração, ex: 0.023 = 2,30%) cobrada pela maquininha
 * para o método de pagamento + número de parcelas informados.
 * Métodos sem cartão (pix, dinheiro, etc) retornam 0.
 */
export function getCardFeeRate(
  paymentMethod: string | null | undefined,
  installments: number = 1,
): number {
  const method = normalizePaymentMethod(paymentMethod);
  if (method === "debit") return 0.0106;
  if (method !== "credit") return 0;
  const n = Math.max(1, Math.floor(installments || 1));
  if (n === 1) return 0.023;
  if (n >= 2 && n <= 6) return 0.0273;
  // 7x em diante (incluindo 11x/12x): 2,80%
  return 0.028;
}

/** Valor líquido após desconto da taxa da maquininha. */
export function applyCardFee(
  gross: number,
  paymentMethod: string | null | undefined,
  installments: number = 1,
): number {
  const rate = getCardFeeRate(paymentMethod, installments);
  return gross * (1 - rate);
}
