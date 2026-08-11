import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingleMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: maybeSingleMock }),
      }),
    }),
  },
}));

import { validateSiteCart } from '../siteCartValidation';

beforeEach(() => {
  maybeSingleMock.mockReset();
});

describe('validateSiteCart', () => {
  it('não remove itens quando a consulta falha (erro de rede/permissão)', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    const result = await validateSiteCart([
      { id: 'p1', name: 'Produto 1', price: 50, quantity: 1, cartItemKey: 'p1' },
    ]);

    expect(result.removeKeys).toEqual([]);
  });

  it('remove item quando o produto realmente não existe', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await validateSiteCart([
      { id: 'p1', name: 'Produto 1', price: 50, quantity: 1, cartItemKey: 'p1' },
    ]);

    expect(result.removeKeys).toEqual(['p1']);
  });
});
