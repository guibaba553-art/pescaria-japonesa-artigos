import { describe, it, expect } from 'vitest';
import { resolveVariationForProduct } from '@/utils/variationSelection';
import type { ProductVariation } from '@/types/product';

const v = (id: string, name: string, price: number): ProductVariation =>
  ({ id, product_id: 'p1', name, price, stock: 5 } as ProductVariation);

describe('resolveVariationForProduct', () => {
  it('não mantém variação de outro produto', () => {
    const corda = v('corda-1', 'CORDA PRETO PP 3,0 MM', 80);
    expect(resolveVariationForProduct([], null, corda)).toBeNull();
    expect(resolveVariationForProduct([v('a', 'A', 10)], null, corda)).toBeNull();
  });

  it('usa a variação pedida pela URL quando pertence ao produto', () => {
    const list = [v('a', 'A', 10), v('b', 'B', 20)];
    expect(resolveVariationForProduct(list, 'b', null)?.id).toBe('b');
    expect(resolveVariationForProduct(list, 'zzz', null)).toBeNull();
  });

  it('mantém a seleção atual quando ela pertence ao produto', () => {
    const list = [v('a', 'A', 10)];
    expect(resolveVariationForProduct(list, null, v('a', 'A', 10))?.id).toBe('a');
  });
});
