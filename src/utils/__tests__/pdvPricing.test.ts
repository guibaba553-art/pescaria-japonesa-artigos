import { describe, it, expect } from 'vitest';
import { getPdvBasePrice, isPdvPromoActive, getPdvPriceForVariation, getPdvDisplayPrice, type PdvPricingFields } from '@/utils/pdvPricing';

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

describe('preço das variações na lista do PDV', () => {
  const parent = { name: 'ISCA LAMBARI 70', price: 26, price_pdv: null };
  const variations = [{ price: 22, price_pdv: 22, stock: 5 }, { price: 22, price_pdv: 22, stock: 4 }];
  it('exibe R$ 22,88 no crédito em vez de R$ 27,04 do produto principal', () => {
    expect(getPdvDisplayPrice({ ...parent, variations }, 'credit').price).toBe(22.88);
  });
  it('exibe R$ 22,00 no PIX', () => {
    expect(getPdvDisplayPrice({ ...parent, variations }, 'pix').price).toBe(22);
  });
  it('não usa variação esgotada para anunciar o menor preço disponível', () => {
    expect(getPdvDisplayPrice({ ...parent, variations: [...variations, { price: 10, stock: 0 }] }, 'pix').price).toBe(22);
  });
  it('respeita preço manual da variação sem herdar o preço manual do pai', () => {
    expect(getPdvDisplayPrice({ ...parent, price_pdv_credit: 40, variations: [{ price: 22, stock: 1, price_pdv_credit: 23 }] }, 'credit').price).toBe(23);
  });
  it('mantém promoção e referência da variação de menor preço', () => {
    const display = getPdvDisplayPrice({ ...parent, variations: [{ price: 22, stock: 1, on_sale: true, sale_price_pdv: 20, sale_ends_at: future }] }, 'credit');
    expect(display).toMatchObject({ price: 20.8, originalPrice: 22.88, onSale: true });
  });
  it('preserva cálculo de produto sem variações', () => {
    expect(getPdvDisplayPrice(parent, 'credit').price).toBe(27.04);
  });
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
