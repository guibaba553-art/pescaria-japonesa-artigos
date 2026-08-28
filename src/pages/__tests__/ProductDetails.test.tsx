import { describe, it, expect } from 'vitest';

import { PUBLIC_VARIATION_COLUMNS } from '@/utils/productColumns';

describe('ProductDetails variation columns', () => {
  it('deve usar apenas colunas seguras para variações', () => {
    const cols = PUBLIC_VARIATION_COLUMNS.split(', ');
    
    // Verifica que não tem wildcard
    expect(PUBLIC_VARIATION_COLUMNS).not.toBe('*');
    
    // Verifica que colunas sensíveis não estão presentes
    expect(cols).not.toContain('cost');
    expect(cols).not.toContain('price_pdv');
    expect(cols).not.toContain('cost_group_id');
    expect(cols).not.toContain('freight_pct');
    expect(cols).not.toContain('op_cost_pct');
    expect(cols).not.toContain('tax_pct');
  });
});
