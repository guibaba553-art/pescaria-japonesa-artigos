import { describe, it, expect } from 'vitest';
import { buildNewVariationCostFields } from '@/utils/variationCostDefaults';

describe('buildNewVariationCostFields', () => {
  it('replica o custo do produto na nova variação', () => {
    expect(buildNewVariationCostFields(5)).toEqual({ cost: 5, cost_group_id: null });
  });

  it('aceita custo digitado como texto com vírgula', () => {
    expect(buildNewVariationCostFields('5,75')).toEqual({ cost: 5.75, cost_group_id: null });
  });

  it('não define custo quando o produto não tem custo', () => {
    expect(buildNewVariationCostFields(null)).toEqual({ cost: null, cost_group_id: null });
    expect(buildNewVariationCostFields('')).toEqual({ cost: null, cost_group_id: null });
    expect(buildNewVariationCostFields(0)).toEqual({ cost: null, cost_group_id: null });
  });

  it('herda o grupo de custo quando houver', () => {
    expect(buildNewVariationCostFields(9, 'grp-1')).toEqual({ cost: 9, cost_group_id: 'grp-1' });
    expect(buildNewVariationCostFields(9, 'none')).toEqual({ cost: 9, cost_group_id: null });
  });
});
