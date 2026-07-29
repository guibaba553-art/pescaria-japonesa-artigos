import { describe, it, expect } from 'vitest';
import { PUBLIC_VARIATION_COLUMNS } from '@/utils/productColumns';

describe('FlashDealsCountdown variation columns', () => {
  it('deve usar colunas explícitas de variação, não wildcard', () => {
    expect(PUBLIC_VARIATION_COLUMNS).not.toBe('*');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('id');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('price');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('on_sale');
    expect(PUBLIC_VARIATION_COLUMNS).toContain('sale_price');
  });
});
