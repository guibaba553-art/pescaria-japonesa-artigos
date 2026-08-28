import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PUBLIC_VARIATION_COLUMNS } from '@/utils/productColumns';

const currentDir = dirname(fileURLToPath(import.meta.url));

describe('FlashDealsCountdown variation columns', () => {
  it('deve usar colunas explícitas de variação, não wildcard', () => {
    expect(PUBLIC_VARIATION_COLUMNS).not.toBe('*');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('id');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('price');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('on_sale');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('sale_price');
  });

  it('não deve usar select wildcard (*) no componente', () => {
    const source = readFileSync(resolve(currentDir, '../FlashDealsCountdown.tsx'), 'utf-8');
    expect(source).not.toMatch(/\.select\(\s*['"`]\*\s*['"`]\s*\)/);
    expect(source).not.toContain('product_variations(*)');
    expect(source).not.toContain('products(*)');
  });

  it('deve reutilizar PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS nos selects de products', () => {
    const source = readFileSync(resolve(currentDir, '../FlashDealsCountdown.tsx'), 'utf-8');
    expect(source).toContain('PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS');
    expect(source).not.toContain('variations:product_variations(');
  });
});
