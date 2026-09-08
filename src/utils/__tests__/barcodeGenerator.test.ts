import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({ maybeSingle }),
        }),
      }),
    }),
  },
}));

import { generateUniqueBarcode } from '../barcodeGenerator';

describe('generateUniqueBarcode', () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    maybeSingle.mockResolvedValue({ data: null });
  });

  it('gera código com exatamente 6 dígitos', async () => {
    const code = await generateUniqueBarcode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('gera códigos diferentes entre chamadas', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) codes.add(await generateUniqueBarcode());
    expect(codes.size).toBeGreaterThan(1);
  });
});
