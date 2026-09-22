/**
 * Define os campos de custo de uma NOVA variação a partir do custo do produto.
 * A variação continua editável: apenas herda o valor inicial.
 */
export interface VariationCostFields {
  cost: number | null;
  cost_group_id: string | null;
}

export function buildNewVariationCostFields(
  productCost?: number | string | null,
  productCostGroupId?: string | null,
): VariationCostFields {
  const raw = typeof productCost === 'string' ? parseFloat(productCost.replace(',', '.')) : productCost;
  const cost = raw != null && !Number.isNaN(raw as number) && Number(raw) > 0 ? Number(raw) : null;
  const group = productCostGroupId && productCostGroupId !== 'none' ? productCostGroupId : null;
  return { cost, cost_group_id: group };
}
