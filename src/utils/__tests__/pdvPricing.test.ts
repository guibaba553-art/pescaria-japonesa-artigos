import { describe, it, expect } from 'vitest';
import { getPdvBasePrice, isPdvPromoActive, getPdvPriceForVariation, type PdvPricingFields } from '@/utils/pdvPricing';

const future = new Date(Date.now() + 86_400_000).toISOString();

const base = (over: Partial<PdvPricingFields> = {}): PdvPricingFields => ({
  name: 'Produto',
  price: 20,
  price_pdv: 18,
  on_sale: true,
  sale_price: 15,
  sale_ends_at: future,
  sale_channel: 'both',
  ...over,
});

describe('promoção com preço separado por canal (PDV)', () => {
  it('usa sale_price_pdv quando definido', () => {
    const p = base({ sale_price_pdv: 16 });
    expect(isPdvPromoActive(p)).toBe(true);
    expect(getPdvBasePrice(p)).toBe(16);
  });

  it('cai para sale_price quando sale_price_pdv não é definido', () => {
    expect(getPdvBasePrice(base())).toBe(15);
  });

  it('ignora sale_price_pdv inválido (>= preço base do PDV)', () => {
    const p = base({ sale_price_pdv: 25 });
    expect(isPdvPromoActive(p)).toBe(false);
    expect(getPdvBasePrice(p)).toBe(18);
  });

  it('usa sale_price_pdv da variação', () => {
    const parent = base({ sale_price: 15, sale_price_pdv: 16 });
    const variation = base({ price: 30, price_pdv: 28, sale_price: 25, sale_price_pdv: 26 });
    expect(getPdvPriceForVariation(parent, 30, 'pix', variation)).toBe(26);
  });
});
