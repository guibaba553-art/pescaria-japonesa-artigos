/**
 * Roteamento de gateway PIX baseado no valor do pedido.
 *
 * Regra de negócio:
 * - Asaas:     R$ 1,99 fixo por transação → melhor para pedidos >= R$ 201
 * - Mercado Pago: 0,99% sobre o valor  → melhor para pedidos < R$ 201
 *
 * Break-even: R$ 1,99 / 0,0099 ≈ R$ 201
 *
 * Ambos suportam reembolso parcial (CDC Art. 49), condição obrigatória
 * para o ecommerce operar em conformidade com a regulamentação brasileira.
 */

const ASAAS_FIXED_FEE = 1.99;
const MERCADOPAGO_RATE = 0.0099;

/** Ponto de equilíbrio onde Asaas e Mercado Pago têm o mesmo custo */
export const BREAK_EVEN = ASAAS_FIXED_FEE / MERCADOPAGO_RATE; // ≈ 201.01

export type PixGateway = 'mercadopago' | 'asaas';

/**
 * Seleciona o gateway PIX mais barato para um dado valor de pedido.
 *
 * @param orderTotal - Valor total do pedido em reais (R$)
 * @param customThreshold - Sobrescreve o break-even (útil para testes e configuração dinâmica)
 * @returns 'mercadopago' ou 'asaas'
 *
 * @example
 * selectPixGateway(150)   // → 'mercadopago' (custo: ~R$ 1,49 vs R$ 1,99)
 * selectPixGateway(500)   // → 'asaas'       (custo: R$ 1,99 vs ~R$ 4,95)
 */
export function selectPixGateway(
  orderTotal: number,
  customThreshold?: number,
): PixGateway {
  const threshold = customThreshold ?? BREAK_EVEN;

  if (orderTotal <= 0) return 'mercadopago'; // safety fallback

  return orderTotal < threshold ? 'mercadopago' : 'asaas';
}
