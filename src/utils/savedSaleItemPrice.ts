// Preço unitário de um item de venda salva (orçamento) do PDV.
//
// Cuidado importante: variações costumam ter `price` (site) = 0 e apenas
// `price_pdv` preenchido. Usar `??` aqui deixava o orçamento com R$ 0,00.
// Por isso valores zerados/inválidos são ignorados na cadeia de fallback.

export interface SavedSaleItemLike {
  customPrice?: number | null;
  quantity?: number;
  product?: {
    name?: string | null;
    price?: number | null;
    price_pdv?: number | null;
  } | null;
  variation?: {
    name?: string | null;
    price?: number | null;
    price_pdv?: number | null;
  } | null;
}

function positive(value: unknown): number | null {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return null;
  return n;
}

export function savedSaleItemUnitPrice(item: SavedSaleItemLike): number {
  return (
    positive(item?.customPrice) ??
    positive(item?.variation?.price_pdv) ??
    positive(item?.variation?.price) ??
    positive(item?.product?.price_pdv) ??
    positive(item?.product?.price) ??
    0
  );
}
