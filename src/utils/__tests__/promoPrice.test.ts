import { describe, it, expect } from 'vitest';
import {
  effectiveProductOrVariationPrice,
  effectiveProductPrice,
  getProductDisplayImage,
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
