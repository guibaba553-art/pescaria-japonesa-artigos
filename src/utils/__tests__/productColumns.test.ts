import { describe, it, expect } from 'vitest';
import { PUBLIC_PRODUCT_COLUMNS, PUBLIC_VARIATION_COLUMNS, PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS } from '../productColumns';

describe('PUBLIC_PRODUCT_COLUMNS', () => {
  const cols = PUBLIC_PRODUCT_COLUMNS.split(', ');

  it('deve incluir colunas seguras básicas', () => {
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('price');
    expect(cols).toContain('stock');
    expect(cols).toContain('image_url');
    expect(cols).toContain('min_sale_price');
  });

  it('deve incluir colunas pdv_only e sale_channel', () => {
    expect(cols).toContain('pdv_only');
    expect(cols).toContain('sale_channel');
  });

  it('NÃO deve incluir colunas sensíveis de custo', () => {
    expect(cols).not.toContain('cost');
    expect(cols).not.toContain('price_pdv');
    expect(cols).not.toContain('price_cash_percent');
    expect(cols).not.toContain('price_pix_percent');
    expect(cols).not.toContain('price_debit_percent');
    expect(cols).not.toContain('price_credit_percent');
    expect(cols).not.toContain('supplier_id');
    expect(cols).not.toContain('created_by');
    expect(cols).not.toContain('freight_pct');
    expect(cols).not.toContain('op_cost_pct');
    expect(cols).not.toContain('tax_pct');
    expect(cols).not.toContain('cost_group_id');
  });
});

describe('PUBLIC_VARIATION_COLUMNS', () => {
  const cols = PUBLIC_VARIATION_COLUMNS.split(', ');

  it('deve incluir colunas seguras básicas de variação', () => {
    expect(cols).toContain('id');
    expect(cols).toContain('product_id');
    expect(cols).toContain('name');
    expect(cols).toContain('price');
    expect(cols).toContain('stock');
    expect(cols).toContain('sku');
    expect(cols).toContain('image_url');
  });

  it('deve incluir a coluna sale_channel', () => {
    expect(cols).toContain('sale_channel');
  });

  it('NÃO deve incluir colunas sensíveis de custo', () => {
    expect(cols).not.toContain('cost');
    expect(cols).not.toContain('price_pdv');
    expect(cols).not.toContain('price_pdv_pix');
    expect(cols).not.toContain('price_pdv_cash');
    expect(cols).not.toContain('price_pdv_debit');
    expect(cols).not.toContain('price_pdv_credit');
    expect(cols).not.toContain('cost_group_id');
    expect(cols).not.toContain('freight_pct');
    expect(cols).not.toContain('op_cost_pct');
    expect(cols).not.toContain('tax_pct');
  });
});

describe('PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS', () => {
  it('NÃO deve usar wildcard (*) para variações', () => {
    expect(PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS).not.toContain('product_variations(*)');
  });

  it('deve usar PUBLIC_VARIATION_COLUMNS para variações', () => {
    expect(PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS).toContain(PUBLIC_VARIATION_COLUMNS);
  });
});
