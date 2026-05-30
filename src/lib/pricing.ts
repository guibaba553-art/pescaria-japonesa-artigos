/**
 * Funções puras de cálculo de precificação.
 * Extraídas do ProductEdit para serem testáveis isoladamente.
 */

/**
 * Calcula o custo base somando custo, frete e custos operacionais.
 * baseCost = cost * (1 + freightPct/100 + opCostPct/100)
 */
export function calcBaseCost(cost: number, freightPct: number, opCostPct: number): number {
  return cost * (1 + freightPct / 100 + opCostPct / 100);
}

/**
 * Calcula o valor do lucro bruto sobre o custo base.
 * profit = baseCost * (marginPct / 100)
 */
export function calcProfit(baseCost: number, marginPct: number): number {
  return baseCost * (marginPct / 100);
}

/**
 * Calcula o imposto sobre o valor final.
 * tax = price * (taxPct / 100)
 */
export function calcTaxAmount(price: number, taxPct: number): number {
  return price * (taxPct / 100);
}

/**
 * Calcula o preço final a partir do custo base, margem e imposto.
 * Fórmula: price = baseCost * (1 + marginPct/100) / (1 - taxPct/100)
 *
 * O imposto é calculado sobre o preço final, então:
 *   price = baseCost * (1 + marginPct/100) + price * taxPct/100
 *   price * (1 - taxPct/100) = baseCost * (1 + marginPct/100)
 *   price = baseCost * (1 + marginPct/100) / (1 - taxPct/100)
 */
export function calcPrice(baseCost: number, marginPct: number, taxPct: number): number {
  const denom = 1 - taxPct / 100;
  if (denom <= 0) return baseCost * (1 + marginPct / 100);
  return (baseCost * (1 + marginPct / 100)) / denom;
}

/**
 * Calcula o subtotal antes do imposto.
 * subtotal = baseCost * (1 + marginPct/100)
 */
export function calcSubtotal(baseCost: number, marginPct: number): number {
  return baseCost * (1 + marginPct / 100);
}

/**
 * Calcula a margem de lucro sobre a venda (%).
 * marginPct = (profit / price) * 100
 */
export function calcMarginPercent(profit: number, price: number): number {
  if (price <= 0) return 0;
  return (profit / price) * 100;
}

/**
 * Recupera a margem sobre custo (%) a partir de um preço salvo.
 * Reverte a fórmula calcPrice:
 *   marginPct = ((price * (1 - taxPct/100)) / baseCost - 1) * 100
 */
export function reverseMarginFromPrice(price: number, baseCost: number, taxPct: number): number {
  if (baseCost <= 0 || price <= 0) return 0;
  const denom = 1 - taxPct / 100;
  if (denom <= 0) return 0;
  return ((price * denom) / baseCost - 1) * 100;
}

/**
 * Calcula o detalhamento completo da precificação.
 * Retorna todas as etapas intermediárias visíveis na UI.
 */
export interface PricingBreakdown {
  cost: number;
  freightPct: number;
  freightAmount: number;
  opCostPct: number;
  opCostAmount: number;
  baseCost: number;
  marginPct: number;
  profit: number;
  subtotal: number;
  taxPct: number;
  taxAmount: number;
  finalPrice: number;
  marginOnSale: number; // lucro sobre a venda (%)
}

/**
 * Interface para uma variação de produto com campos de precificação.
 */
export interface VariationPricing {
  cost: number;
  price_pdv: number;
  min_sale_price: number;
  _editMargin?: string;
  _editSiteMargin?: string;
  [key: string]: any;
}

/**
 * Recalcula os preços de todas as variações quando frete, opcost ou imposto mudam.
 * Mantém a margem sobre custo atual de cada variação.
 */
export function repriceAllVariations(
  variations: VariationPricing[],
  newFreightPct: number,
  newOpCostPct: number,
  newTaxPct: number
): VariationPricing[] {
  return variations.map(v => {
    const varCost = Number(v.cost ?? 0);
    if (varCost === 0) return v;
    const varBase = varCost * (1 + newFreightPct / 100 + newOpCostPct / 100);
    const vmPdv = parseFloat(v._editMargin ?? '0');
    const vmSite = parseFloat(v._editSiteMargin ?? '0');
    const updates: Partial<VariationPricing> = {};
    if (vmPdv > 0) {
      const np = calcPrice(varBase, vmPdv, newTaxPct);
      if (isFinite(np) && np > 0) updates.price_pdv = np;
    }
    if (vmSite > 0) {
      const nm = calcPrice(varBase, vmSite, newTaxPct);
      if (isFinite(nm) && nm > 0) updates.min_sale_price = nm;
    }
    return Object.keys(updates).length > 0 ? { ...v, ...updates } : v;
  });
}

/**
 * Calcula o detalhamento completo para uma variação.
 * Usa custo individual da variação + percentuais globais de frete/opcost/tax.
 */
export function calcVariationBreakdown(
  variationCost: number,
  freightPct: number,
  opCostPct: number,
  marginPct: number,
  taxPct: number
): PricingBreakdown {
  return calcPricingBreakdown(variationCost, freightPct, opCostPct, marginPct, taxPct);
}

export function calcPricingBreakdown(
  cost: number,
  freightPct: number,
  opCostPct: number,
  marginPct: number,
  taxPct: number
): PricingBreakdown {
  const freightAmount = cost * (freightPct / 100);
  const opCostAmount = cost * (opCostPct / 100);
  const baseCost = calcBaseCost(cost, freightPct, opCostPct);
  const profit = calcProfit(baseCost, marginPct);
  const subtotal = calcSubtotal(baseCost, marginPct);
  const finalPrice = calcPrice(baseCost, marginPct, taxPct);
  const taxAmount = calcTaxAmount(finalPrice, taxPct);
  const marginOnSale = calcMarginPercent(profit, finalPrice);

  return {
    cost,
    freightPct,
    freightAmount,
    opCostPct,
    opCostAmount,
    baseCost,
    marginPct,
    profit,
    subtotal,
    taxPct,
    taxAmount,
    finalPrice,
    marginOnSale,
  };
}
