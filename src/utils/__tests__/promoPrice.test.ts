import { describe, it, expect } from 'vitest';
import {
  effectiveProductOrVariationPrice,
  effectiveProductPrice,
  getProductDisplayImage,
  isPromoActive,
  PromoFields,
} from '../promoPrice';

// ─── effectiveProductOrVariationPrice ──────────────────────
describe('effectiveProductOrVariationPrice', () => {
  const baseProduct = {
    price: 50,
    min_sale_price: null,
    on_sale: false,
    sale_price: null,
  };

  it('produto sem variações: retorna o preço base', () => {
    expect(effectiveProductOrVariationPrice({ ...baseProduct })).toBe(50);
  });

  it('produto sem variações com promo: retorna sale_price', () => {
    expect(effectiveProductOrVariationPrice({
      ...baseProduct,
      on_sale: true,
      sale_price: 30,
    })).toBe(30);
  });

  it('produto com variações: retorna o menor preço entre as variações', () => {
    const product = {
      ...baseProduct,
      variations: [
        { price: 100, min_sale_price: null, on_sale: false, sale_price: null },
        { price: 30, min_sale_price: null, on_sale: false, sale_price: null },
        { price: 80, min_sale_price: null, on_sale: false, sale_price: null },
      ],
    };
    expect(effectiveProductOrVariationPrice(product as any)).toBe(30);
  });

  it('variações com min_sale_price: usa min_sale_price no cálculo', () => {
    const product = {
      ...baseProduct,
      variations: [
        { price: 100, min_sale_price: 25, on_sale: false, sale_price: null },
        { price: 80, min_sale_price: 40, on_sale: false, sale_price: null },
      ],
    };
    expect(effectiveProductOrVariationPrice(product as any)).toBe(25);
  });

  it('variações com promo individual: usa sale_price da variação', () => {
    const product = {
      ...baseProduct,
      variations: [
        { price: 100, min_sale_price: null, on_sale: true, sale_price: 15 },
        { price: 50, min_sale_price: null, on_sale: false, sale_price: null },
      ],
    };
    expect(effectiveProductOrVariationPrice(product as any)).toBe(15);
  });

  it('ignora variações com preço zero ou negativo', () => {
    const product = {
      ...baseProduct,
      variations: [
        { price: 0, min_sale_price: null, on_sale: false, sale_price: null },
        { price: -1, min_sale_price: null, on_sale: false, sale_price: null },
        { price: 45, min_sale_price: null, on_sale: false, sale_price: null },
      ],
    };
    expect(effectiveProductOrVariationPrice(product as any)).toBe(45);
  });

  it('array de variações vazio: cai para preço base', () => {
    expect(effectiveProductOrVariationPrice({
      ...baseProduct,
      variations: [],
    } as any)).toBe(50);
  });

  it('deve ser consistente com effectiveProductPrice quando sem variações', () => {
    const p = { price: 80, min_sale_price: 60, on_sale: false, sale_price: null };
    expect(effectiveProductOrVariationPrice(p as any))
      .toBe(effectiveProductPrice(p));
  });
});

// ─── isPromoActive ─────────────────────────────────────────
describe('isPromoActive', () => {
  const makeItem = (overrides: Partial<PromoFields> = {}): PromoFields => ({
    price: 100,
    on_sale: true,
    sale_price: 50,
    ...overrides,
  });

  it('promo ativa com todos os campos válidos retorna true', () => {
    expect(isPromoActive(makeItem())).toBe(true);
  });

  it('promo com sale_ends_at no passado retorna false', () => {
    expect(isPromoActive(makeItem({ sale_ends_at: '2020-01-01T00:00:00.000Z' }))).toBe(false);
  });

  it('promo com sale_ends_at no futuro retorna true', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(isPromoActive(makeItem({ sale_ends_at: future }))).toBe(true);
  });

  it('promo com sale_ends_at exatamente agora retorna false (<= now)', () => {
    const now = new Date();
    expect(isPromoActive(makeItem({ sale_ends_at: now.toISOString() }), now)).toBe(false);
  });

  it('promo sem sale_ends_at (nulo) retorna true se demais campos OK', () => {
    expect(isPromoActive(makeItem({ sale_ends_at: null }))).toBe(true);
  });

  it('promo com on_sale=false retorna false', () => {
    expect(isPromoActive(makeItem({ on_sale: false }))).toBe(false);
  });

  it('promo com sale_price null retorna false', () => {
    expect(isPromoActive(makeItem({ sale_price: null }))).toBe(false);
  });

  it('promo com sale_price >= price retorna false', () => {
    expect(isPromoActive(makeItem({ sale_price: 100 }))).toBe(false);
    expect(isPromoActive(makeItem({ sale_price: 150 }))).toBe(false);
  });

  it('promo com sale_limit_qty atingido retorna false', () => {
    expect(isPromoActive(makeItem({ sale_limit_qty: 10, sale_sold_qty: 10 }))).toBe(false);
    expect(isPromoActive(makeItem({ sale_limit_qty: 5, sale_sold_qty: 10 }))).toBe(false);
  });

  it('promo com sale_limit_qty não atingido retorna true', () => {
    expect(isPromoActive(makeItem({ sale_limit_qty: 10, sale_sold_qty: 3 }))).toBe(true);
  });

  it('promo sem sale_limit_qty (nulo) retorna true', () => {
    expect(isPromoActive(makeItem({ sale_limit_qty: null, sale_sold_qty: 10 }))).toBe(true);
  });

  it('item null/undefined retorna false', () => {
    expect(isPromoActive(null as any)).toBe(false);
    expect(isPromoActive(undefined as any)).toBe(false);
  });

  it('price <= 0 retorna false', () => {
    expect(isPromoActive(makeItem({ price: 0 }))).toBe(false);
    expect(isPromoActive(makeItem({ price: -1 }))).toBe(false);
  });

  it('now customizado permite simular momento futuro', () => {
    const futureNow = new Date('2025-06-01T00:00:00.000Z');
    // Promo que expira depois de futureNow
    expect(isPromoActive(
      makeItem({ sale_ends_at: '2025-07-01T00:00:00.000Z' }),
      futureNow,
    )).toBe(true);
    // Promo que expira antes de futureNow
    expect(isPromoActive(
      makeItem({ sale_ends_at: '2025-05-01T00:00:00.000Z' }),
      futureNow,
    )).toBe(false);
  });
});

// ─── getProductDisplayImage ────────────────────────────────
describe('getProductDisplayImage', () => {
  it('sem variação selecionada: retorna imagem do produto base', () => {
    expect(getProductDisplayImage('base.jpg', null)).toBe('base.jpg');
  });

  it('com variação sem imagem própria: retorna imagem do produto base', () => {
    expect(getProductDisplayImage('base.jpg', { image_url: null })).toBe('base.jpg');
  });

  it('com variação com imagem própria: retorna imagem da variação', () => {
    expect(getProductDisplayImage('base.jpg', { image_url: 'var.jpg' })).toBe('var.jpg');
  });
});
