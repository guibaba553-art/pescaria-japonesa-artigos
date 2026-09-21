/**
 * Montagem do payload da venda do PDV enviada à operação única
 * `create_pdv_sale` no banco (venda + pagamentos + itens em uma transação).
 *
 * Funções puras — sem acesso a rede ou estado de React.
 */

export type PdvPaymentPart = {
  method: string;
  amount: number | string;
  installments?: number | string | null;
};

export type PdvPaymentRow = {
  payment_method: string;
  amount: number;
  installments: number;
  cash_received: number | null;
};

const round2 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(2));

/**
 * Uma linha por meio de pagamento usado. Vendas com um único meio também
 * registram uma linha, para o financeiro ler sempre daqui.
 *
 * Dinheiro pode ser informado com troco: registra só o valor que cobre a venda.
 */
export function buildPdvPaymentRows(params: {
  parts: PdvPaymentPart[];
  total: number;
  splitMode: boolean;
  cashReceivedInput?: string | null;
}): PdvPaymentRow[] {
  const { parts, total, splitMode, cashReceivedInput } = params;
  const parsedCashInput = parseFloat(String(cashReceivedInput ?? '').replace(',', '.'));
  const cashInput = Number.isFinite(parsedCashInput) ? parsedCashInput : null;

  return parts.map((part, idx, arr) => {
    const others = arr.reduce((sum, other, i) => (i === idx ? sum : sum + (Number(other.amount) || 0)), 0);
    const raw = Number(part.amount) || 0;
    const amount = part.method === 'cash'
      ? Math.max(0, Math.min(raw, total - others))
      : raw;

    return {
      payment_method: part.method,
      amount: round2(amount),
      installments: part.method === 'credit' ? Math.max(1, Number(part.installments) || 1) : 1,
      cash_received: part.method === 'cash'
        ? (splitMode ? round2(raw) : cashInput)
        : null,
    };
  });
}

export type PdvSaleItemInput = {
  productId: string;
  variationId?: string | null;
  quantity: number;
  unitPrice: number;
};

export type PdvSaleItemRow = {
  product_id: string;
  variation_id: string | null;
  quantity: number;
  price_at_purchase: number;
};

/**
 * Itens da venda com o desconto geral rateado no preço unitário.
 */
export function buildPdvItemRows(items: PdvSaleItemInput[], discountRatio: number): PdvSaleItemRow[] {
  const ratio = Number.isFinite(discountRatio) ? Math.max(0, Math.min(1, discountRatio)) : 0;
  return items.map((item) => ({
    product_id: item.productId,
    variation_id: item.variationId ?? null,
    quantity: item.quantity,
    price_at_purchase: round2(item.unitPrice * (1 - ratio)),
  }));
}
