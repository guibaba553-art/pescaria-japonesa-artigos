import { describe, it, expect } from 'vitest';
import {
  calcBaseCost,
  calcProfit,
  calcTaxAmount,
  calcPrice,
  calcSubtotal,
  calcMarginPercent,
  reverseMarginFromPrice,
  calcPricingBreakdown,
  calcVariationBreakdown,
  repriceAllVariations,
  isPricingDisabled,
  isVariationPricingDisabled,
  safeVariationPrice,
  buildVariationPayload,
  VariationPricing,
} from '../pricing';

// ─── calcBaseCost ──────────────────────────────────────────
describe('calcBaseCost', () => {
  it('deve calcular custo base sem percentuais', () => {
    expect(calcBaseCost(100, 0, 0)).toBe(100);
  });

  it('deve somar frete e operacionais corretamente', () => {
    // 100 + 5% de frete + 3% de operacionais = 100 + 5 + 3 = 108
    expect(calcBaseCost(100, 5, 3)).toBe(108);
  });

  it('deve funcionar com custo zero', () => {
    expect(calcBaseCost(0, 10, 5)).toBe(0);
  });

  it('deve funcionar com valores decimais', () => {
    // 12.50 + 5.5% = 12.50 + 0.6875 = 13.1875
    // + 2.3% = 0.2875 → 12.50 + 0.6875 + 0.2875 = 13.475
    const result = calcBaseCost(12.5, 5.5, 2.3);
    expect(result).toBeCloseTo(13.475, 10);
  });

  it('deve lidar com percentuais altos', () => {
    expect(calcBaseCost(100, 100, 50)).toBe(250);
  });
});

// ─── calcProfit ────────────────────────────────────────────
describe('calcProfit', () => {
  it('5% de 12 deve ser 0.60', () => {
    expect(calcProfit(12, 5)).toBeCloseTo(0.60, 10);
  });

  it('30% de 108 deve ser 32.40', () => {
    expect(calcProfit(108, 30)).toBeCloseTo(32.40, 10);
  });

  it('0% de lucro deve ser zero', () => {
    expect(calcProfit(100, 0)).toBe(0);
  });

  it('100% de lucro dobra o custo base', () => {
    expect(calcProfit(50, 100)).toBe(50);
  });

  it('custo base zero deve dar lucro zero', () => {
    expect(calcProfit(0, 50)).toBe(0);
  });
});

// ─── calcTaxAmount ─────────────────────────────────────────
describe('calcTaxAmount', () => {
  it('5% de 12.60 deve ser 0.63', () => {
    expect(calcTaxAmount(12.60, 5)).toBeCloseTo(0.63, 10);
  });

  it('0% de imposto deve ser zero', () => {
    expect(calcTaxAmount(100, 0)).toBe(0);
  });

  it('preço zero deve dar imposto zero', () => {
    expect(calcTaxAmount(0, 10)).toBe(0);
  });
});

// ─── calcPrice ─────────────────────────────────────────────
describe('calcPrice', () => {
  it('sem imposto, preço = baseCost * (1 + margem/100)', () => {
    expect(calcPrice(100, 30, 0)).toBeCloseTo(130, 10);
  });

  it('com imposto 5%, preço deve ser maior que subtotal', () => {
    // baseCost=100, margin=30, tax=5
    // subtotal = 130
    // price = 130 / 0.95 = 136.8421...
    const price = calcPrice(100, 30, 5);
    expect(price).toBeGreaterThan(130);
    expect(price).toBeCloseTo(136.842105, 5);
  });

  it('5% de margem sobre custo 12 sem imposto = 12.60', () => {
    expect(calcPrice(12, 5, 0)).toBeCloseTo(12.60, 10);
  });

  it('5% de margem sobre custo 12 com imposto 5%', () => {
    // subtotal = 12.60, price = 12.60 / 0.95 = 13.263157...
    const price = calcPrice(12, 5, 5);
    expect(price).toBeCloseTo(13.263157, 5);
  });

  it('imposto 100% deve dar infinito (retorna subtotal como fallback)', () => {
    // denom = 1 - 1 = 0 → fallback: baseCost * (1 + margin/100)
    expect(calcPrice(100, 10, 100)).toBeCloseTo(110, 10);
  });

  it('margem zero, preço = custo base / (1 - tax/100)', () => {
    const price = calcPrice(100, 0, 10);
    expect(price).toBeCloseTo(111.111111, 5);
  });

  it('custo base zero deve dar zero', () => {
    expect(calcPrice(0, 50, 5)).toBe(0);
  });

  it('edge case: round-trip de salvar e recuperar margem sem imposto', () => {
    const baseCost = 12;
    const marginPct = 5;
    const taxPct = 0;
    const price = calcPrice(baseCost, marginPct, taxPct);
    const recoveredMargin = reverseMarginFromPrice(price, baseCost, taxPct);
    expect(recoveredMargin).toBeCloseTo(marginPct, 10);
  });

  it('edge case: round-trip de salvar e recuperar margem com imposto', () => {
    const baseCost = 12;
    const marginPct = 5;
    const taxPct = 5;
    const price = calcPrice(baseCost, marginPct, taxPct);
    const recoveredMargin = reverseMarginFromPrice(price, baseCost, taxPct);
    // Deve recuperar exatamente (sem arredondamento de state)
    expect(recoveredMargin).toBeCloseTo(marginPct, 10);
  });

  it('edge case: round-trip com margem 30% e imposto 4%', () => {
    const baseCost = 108; // 100 + 5% + 3%
    const marginPct = 30;
    const taxPct = 4;
    const price = calcPrice(baseCost, marginPct, taxPct);
    const recoveredMargin = reverseMarginFromPrice(price, baseCost, taxPct);
    expect(recoveredMargin).toBeCloseTo(marginPct, 10);
  });
});

// ─── calcSubtotal ──────────────────────────────────────────
describe('calcSubtotal', () => {
  it('subtotal = baseCost + profit', () => {
    const baseCost = 100;
    const marginPct = 30;
    const profit = calcProfit(baseCost, marginPct);
    const subtotal = calcSubtotal(baseCost, marginPct);
    expect(subtotal).toBeCloseTo(baseCost + profit, 10);
  });

  it('subtotal deve ser 12.60 para custo 12 e margem 5%', () => {
    expect(calcSubtotal(12, 5)).toBeCloseTo(12.60, 10);
  });
});

// ─── calcMarginPercent ─────────────────────────────────────
describe('calcMarginPercent', () => {
  it('lucro 30 sobre venda 130 = 23.08%', () => {
    expect(calcMarginPercent(30, 130)).toBeCloseTo(23.0769, 2);
  });

  it('lucro zero deve dar 0%', () => {
    expect(calcMarginPercent(0, 100)).toBe(0);
  });

  it('venda zero deve dar 0% (evita divisão por zero)', () => {
    expect(calcMarginPercent(50, 0)).toBe(0);
  });
});

// ─── reverseMarginFromPrice ────────────────────────────────
describe('reverseMarginFromPrice', () => {
  it('deve recuperar margem exata sem imposto', () => {
    const margin = reverseMarginFromPrice(12.60, 12, 0);
    expect(margin).toBeCloseTo(5, 10);
  });

  it('deve recuperar margem exata com imposto', () => {
    const price = calcPrice(12, 5, 5); // ~13.263157...
    const margin = reverseMarginFromPrice(price, 12, 5);
    expect(margin).toBeCloseTo(5, 10);
  });

  it('deve lidar com preço zero', () => {
    expect(reverseMarginFromPrice(0, 100, 10)).toBe(0);
  });

  it('deve lidar com custo base zero', () => {
    expect(reverseMarginFromPrice(100, 0, 10)).toBe(0);
  });
});

// ─── calcPricingBreakdown ──────────────────────────────────
describe('calcPricingBreakdown', () => {
  it('deve calcular detalhamento completo', () => {
    const bd = calcPricingBreakdown(100, 5, 3, 30, 4);

    // Custo base: 100 + 5 + 3 = 108
    expect(bd.baseCost).toBeCloseTo(108, 10);
    expect(bd.freightAmount).toBeCloseTo(5, 10);
    expect(bd.opCostAmount).toBeCloseTo(3, 10);

    // Lucro: 30% de 108 = 32.40
    expect(bd.profit).toBeCloseTo(32.40, 10);

    // Subtotal: 108 + 32.40 = 140.40
    expect(bd.subtotal).toBeCloseTo(140.40, 10);

    // Preço final: 140.40 / 0.96 = 146.25
    expect(bd.finalPrice).toBeCloseTo(146.25, 10);

    // Imposto: 146.25 * 0.04 = 5.85
    expect(bd.taxAmount).toBeCloseTo(5.85, 10);

    // Soma: subtotal + imposto = preço final
    expect(bd.subtotal + bd.taxAmount).toBeCloseTo(bd.finalPrice, 10);

    // Soma alternativa: baseCost + profit + taxAmount = finalPrice
    expect(bd.baseCost + bd.profit + bd.taxAmount).toBeCloseTo(bd.finalPrice, 10);

    // Margem sobre venda: 32.40 / 146.25 = 22.15%
    expect(bd.marginOnSale).toBeCloseTo(22.1538, 2);
  });

  it('edge case: sem imposto, subtotal = preço final', () => {
    const bd = calcPricingBreakdown(12, 0, 0, 5, 0);
    expect(bd.baseCost).toBe(12);
    expect(bd.profit).toBeCloseTo(0.60, 10);
    expect(bd.subtotal).toBeCloseTo(12.60, 10);
    expect(bd.finalPrice).toBeCloseTo(12.60, 10);
    expect(bd.taxAmount).toBe(0);
    expect(bd.subtotal).toBe(bd.finalPrice);
    // Soma: baseCost + profit + tax = finalPrice
    expect(bd.baseCost + bd.profit + bd.taxAmount).toBeCloseTo(bd.finalPrice, 10);
  });

  it('edge case: margem zero, preço = baseCost / (1 - tax/100)', () => {
    const bd = calcPricingBreakdown(100, 0, 0, 0, 10);
    expect(bd.profit).toBe(0);
    expect(bd.subtotal).toBe(100);
    expect(bd.finalPrice).toBeCloseTo(111.111111, 5);
    expect(bd.taxAmount).toBeCloseTo(11.111111, 5);
    expect(bd.subtotal + bd.taxAmount).toBeCloseTo(bd.finalPrice, 10);
  });

  it('edge case: todos os campos zerados', () => {
    const bd = calcPricingBreakdown(0, 0, 0, 0, 0);
    expect(bd.baseCost).toBe(0);
    expect(bd.profit).toBe(0);
    expect(bd.subtotal).toBe(0);
    expect(bd.finalPrice).toBe(0);
    expect(bd.taxAmount).toBe(0);
    expect(bd.marginOnSale).toBe(0);
  });

  it('edge case: custo alto, margem baixa, imposto alto', () => {
    const bd = calcPricingBreakdown(500, 10, 8, 3, 27.5);
    // baseCost: 500 * 1.18 = 590
    expect(bd.baseCost).toBeCloseTo(590, 10);
    // profit: 590 * 0.03 = 17.70
    expect(bd.profit).toBeCloseTo(17.70, 10);
    // subtotal: 590 + 17.70 = 607.70
    expect(bd.subtotal).toBeCloseTo(607.70, 10);
    // finalPrice: 607.70 / 0.725 = 838.2068...
    expect(bd.finalPrice).toBeCloseTo(838.2068, 2);
    // taxAmount: 838.2068 * 0.275 = 230.5069...
    expect(bd.taxAmount).toBeCloseTo(230.5069, 2);
    // Soma confere
    expect(bd.subtotal + bd.taxAmount).toBeCloseTo(bd.finalPrice, 1);
  });

  it('edge case: valores decimais no custo e percentuais', () => {
    const bd = calcPricingBreakdown(12.75, 3.5, 1.8, 22.5, 6.4);
    // baseCost: 12.75 * (1 + 0.035 + 0.018) = 12.75 * 1.053 = 13.42575
    expect(bd.baseCost).toBeCloseTo(13.42575, 10);
    // profit: 13.42575 * 0.225 = 3.02079...
    expect(bd.profit).toBeCloseTo(3.02079, 5);
    // subtotal: 13.42575 + 3.02079 = 16.44654...
    expect(bd.subtotal).toBeCloseTo(16.44654, 5);
    // finalPrice: 16.44654 / 0.936 = 17.57109...
    expect(bd.finalPrice).toBeCloseTo(17.57109, 2);
    // Soma
    expect(bd.baseCost + bd.profit + bd.taxAmount).toBeCloseTo(bd.finalPrice, 1);
  });
});

// ─── calcVariationBreakdown ────────────────────────────────
describe('calcVariationBreakdown', () => {
  it('variação com custo diferente deve gerar precificação independente', () => {
    // Variação com custo 15, mesmos % globais
    const bd = calcVariationBreakdown(15, 5, 3, 30, 4);

    expect(bd.baseCost).toBeCloseTo(16.20, 10); // 15 * 1.08
    expect(bd.profit).toBeCloseTo(4.86, 10);    // 16.20 * 0.30
    expect(bd.subtotal).toBeCloseTo(21.06, 10);  // 16.20 + 4.86
    expect(bd.finalPrice).toBeCloseTo(21.9375, 10); // 21.06 / 0.96
    expect(bd.taxAmount).toBeCloseTo(0.8775, 10);    // 21.9375 * 0.04
    expect(bd.subtotal + bd.taxAmount).toBeCloseTo(bd.finalPrice, 10);
  });

  it('variação com custo zero deve dar tudo zero', () => {
    const bd = calcVariationBreakdown(0, 5, 3, 30, 4);
    expect(bd.baseCost).toBe(0);
    expect(bd.profit).toBe(0);
    expect(bd.subtotal).toBe(0);
    expect(bd.finalPrice).toBe(0);
    expect(bd.taxAmount).toBe(0);
  });

  it('duas variações com custos diferentes devem ter margem sobre venda diferente', () => {
    const cheap = calcVariationBreakdown(10, 0, 0, 50, 0);
    const expensive = calcVariationBreakdown(100, 0, 0, 50, 0);

    // Ambas têm 50% de lucro sobre custo
    expect(cheap.profit).toBe(5);   // 10 * 0.50
    expect(expensive.profit).toBe(50); // 100 * 0.50

    // Mas a margem sobre venda é igual para ambas (50/150 = 33.33%)
    expect(cheap.marginOnSale).toBeCloseTo(33.3333, 2);
    expect(expensive.marginOnSale).toBeCloseTo(33.3333, 2);
  });
});

// ─── repriceAllVariations ──────────────────────────────────
describe('repriceAllVariations', () => {
  it('deve recalcular preços de todas as variações quando imposto muda', () => {
    const variations: VariationPricing[] = [
      { cost: 10, price_pdv: 15, min_sale_price: 14, _editMargin: '50', _editSiteMargin: '40' },
      { cost: 20, price_pdv: 30, min_sale_price: 28, _editMargin: '50', _editSiteMargin: '40' },
    ];

    // Mudar imposto de 0% para 10%
    const result = repriceAllVariations(variations, 0, 0, 10);

    // Variação 1: base=10, margin=50%, tax=10% → calcPrice(10, 50, 10) = 15/0.9 = 16.666...
    expect(result[0].price_pdv).toBeCloseTo(16.666667, 4);
    // min_sale: calcPrice(10, 40, 10) = 14/0.9 = 15.555...
    expect(result[0].min_sale_price).toBeCloseTo(15.555556, 4);

    // Variação 2: base=20, margin=50%, tax=10% → calcPrice(20, 50, 10) = 30/0.9 = 33.333...
    expect(result[1].price_pdv).toBeCloseTo(33.333333, 4);
    expect(result[1].min_sale_price).toBeCloseTo(31.111111, 4);
  });

  it('deve recalcular preços quando frete e opcost mudam', () => {
    const variations: VariationPricing[] = [
      { cost: 100, price_pdv: 130, min_sale_price: 120, _editMargin: '30', _editSiteMargin: '20' },
    ];

    // Adicionar 5% frete e 3% opcost
    const result = repriceAllVariations(variations, 5, 3, 0);

    // base = 100 * 1.08 = 108
    // price = calcPrice(108, 30, 0) = 140.40
    expect(result[0].price_pdv).toBeCloseTo(140.40, 10);
    // min_sale = calcPrice(108, 20, 0) = 129.60
    expect(result[0].min_sale_price).toBeCloseTo(129.60, 10);
  });

  it('variação sem margem definida não deve ser alterada', () => {
    const variations: VariationPricing[] = [
      { cost: 50, price_pdv: 60, min_sale_price: 55 },
    ];

    const result = repriceAllVariations(variations, 10, 5, 8);
    expect(result[0].price_pdv).toBe(60);   // não alterado
    expect(result[0].min_sale_price).toBe(55); // não alterado
  });

  it('variação com custo zero não deve ser alterada', () => {
    const variations: VariationPricing[] = [
      { cost: 0, price_pdv: 10, min_sale_price: 8, _editMargin: '30' },
      { cost: 10, price_pdv: 15, min_sale_price: 14, _editMargin: '50' },
    ];

    const result = repriceAllVariations(variations, 5, 3, 2);

    // Primeira (custo zero): não alterada
    expect(result[0].price_pdv).toBe(10);
    // Segunda: alterada normalmente
    expect(result[1].price_pdv).toBeGreaterThan(15); // com imposto deve ser maior
  });

  it('array vazio de variações deve retornar vazio', () => {
    const result = repriceAllVariations([], 10, 5, 8);
    expect(result).toEqual([]);
  });

  it('round-trip: salvar e recuperar margens das variações após repricing', () => {
    const originalMargin = 25;
    const variations: VariationPricing[] = [
      { cost: 50, price_pdv: 62.50, min_sale_price: 60, _editMargin: String(originalMargin), _editSiteMargin: '20' },
    ];

    // Reprice com imposto 5% (que estava 0% antes)
    const repriced = repriceAllVariations(variations, 0, 0, 5);

    // O preço deve aumentar para acomodar o imposto
    // calcPrice(50, 25, 5) = 62.50 / 0.95 = 65.789...
    expect(repriced[0].price_pdv).toBeCloseTo(65.789474, 4);

    // A margem armazenada (_editMargin) deve permanecer a mesma
    expect(repriced[0]._editMargin).toBe(String(originalMargin));
  });
});

// ─── isPricingDisabled ─────────────────────────────────────
describe('isPricingDisabled', () => {
  it('deve bloquear quando custo é zero', () => {
    expect(isPricingDisabled(0, '5', '3')).toBe(true);
  });

  it('não deve bloquear quando todos os campos estão preenchidos', () => {
    expect(isPricingDisabled(100, '5', '3')).toBe(false);
    expect(isPricingDisabled(0.01, '0', '0')).toBe(false);
    expect(isPricingDisabled(50, '10', '2.5')).toBe(false);
  });

  it('deve bloquear quando frete não está preenchido (string vazia)', () => {
    expect(isPricingDisabled(100, '', '3')).toBe(true);
  });

  it('deve bloquear quando custos operacionais não está preenchido (string vazia)', () => {
    expect(isPricingDisabled(100, '5', '')).toBe(true);
  });

  it('deve bloquear quando ambos frete e opcost estão vazios', () => {
    expect(isPricingDisabled(100, '', '')).toBe(true);
  });

  it('NÃO deve bloquear quando frete e opcost são zero explícito (preenchidos com "0")', () => {
    // "0" é diferente de "" — o campo foi preenchido, só que com valor zero
    expect(isPricingDisabled(100, '0', '0')).toBe(false);
  });

  it('deve aceitar frete zero e opcost positivo', () => {
    expect(isPricingDisabled(100, '0', '5')).toBe(false);
  });

  it('deve aceitar frete positivo e opcost zero', () => {
    expect(isPricingDisabled(100, '5', '0')).toBe(false);
  });

  it('custo negativo também deve bloquear (defensivo)', () => {
    expect(isPricingDisabled(-5, '5', '3')).toBe(true);
  });

  it('deve bloquear quando frete tem valor negativo', () => {
    expect(isPricingDisabled(100, '-5', '3')).toBe(true);
  });

  it('deve bloquear quando opcost tem valor negativo', () => {
    expect(isPricingDisabled(100, '5', '-3')).toBe(true);
  });
});

// ─── isVariationPricingDisabled ────────────────────────────
describe('isVariationPricingDisabled', () => {
  it('deve bloquear quando custo da variação é zero', () => {
    expect(isVariationPricingDisabled(0, '5', '3')).toBe(true);
  });

  it('não deve bloquear quando todos os campos estão preenchidos', () => {
    expect(isVariationPricingDisabled(50, '5', '3')).toBe(false);
    expect(isVariationPricingDisabled(10, '0', '0')).toBe(false);
  });

  it('deve bloquear quando frete não está preenchido (string vazia)', () => {
    expect(isVariationPricingDisabled(50, '', '3')).toBe(true);
  });

  it('deve bloquear quando custos operacionais não está preenchido (string vazia)', () => {
    expect(isVariationPricingDisabled(50, '5', '')).toBe(true);
  });

  it('NÃO deve bloquear quando frete e opcost são zero explícito (preenchidos com "0")', () => {
    // Este é o cenário que estava quebrado — o código antigo bloqueava com liveFreightPct === 0
    expect(isVariationPricingDisabled(50, '0', '0')).toBe(false);
  });

  it('deve aceitar frete zero e opcost positivo (cenário do bug)', () => {
    // Bug original: liveFreightPct === 0 bloqueava quando frete era "0"
    expect(isVariationPricingDisabled(30, '0', '5')).toBe(false);
  });

  it('deve aceitar frete positivo e opcost zero (cenário do bug)', () => {
    expect(isVariationPricingDisabled(30, '5', '0')).toBe(false);
  });

  it('deve bloquear quando frete tem valor negativo', () => {
    expect(isVariationPricingDisabled(50, '-5', '3')).toBe(true);
  });

  it('deve bloquear quando opcost tem valor negativo', () => {
    expect(isVariationPricingDisabled(50, '5', '-3')).toBe(true);
  });
});

// ─── safeVariationPrice ────────────────────────────────────
describe('safeVariationPrice', () => {
  it('deve retornar o próprio número quando válido', () => {
    expect(safeVariationPrice(10)).toBe(10);
    expect(safeVariationPrice(99.90)).toBe(99.90);
    expect(safeVariationPrice(0)).toBe(0);
  });

  it('deve converter NaN para 0 (caso do bug: parseFloat("") → NaN)', () => {
    expect(safeVariationPrice(NaN)).toBe(0);
  });

  it('deve converter null/undefined para 0', () => {
    expect(safeVariationPrice(null as any)).toBe(0);
    expect(safeVariationPrice(undefined as any)).toBe(0);
  });

  it('deve converter string numérica para número', () => {
    expect(safeVariationPrice('15.50' as any)).toBe(15.50);
  });

  it('deve converter string vazia para 0', () => {
    expect(safeVariationPrice('' as any)).toBe(0);
  });

  it('deve tratar negativo como 0 (defensivo)', () => {
    expect(safeVariationPrice(-5)).toBe(0);
  });
});

// ─── buildVariationPayload ─────────────────────────────────
describe('buildVariationPayload', () => {
  it('deve incluir campos de promoção (on_sale, sale_price, sale_ends_at)', () => {
    const result = buildVariationPayload({
      on_sale: true,
      sale_price: 8,
      sale_ends_at: '2026-12-31T23:59:59.000Z',
    }, 'prod-1');

    expect(result.on_sale).toBe(true);
    expect(result.sale_price).toBe(8);
    expect(result.sale_ends_at).toBe('2026-12-31T23:59:59.000Z');
  });

  it('sale_price deve ser null quando on_sale é false', () => {
    const result = buildVariationPayload({
      on_sale: false,
      sale_price: 8,
    }, 'prod-1');

    expect(result.on_sale).toBe(false);
    expect(result.sale_price).toBeNull();
  });

  it('sale_ends_at deve ser null quando on_sale é false', () => {
    const result = buildVariationPayload({
      on_sale: false,
      sale_ends_at: '2026-12-31T23:59:59.000Z',
    }, 'prod-1');

    expect(result.sale_ends_at).toBeNull();
  });

  it('valores padrão quando campos de promoção não estão definidos', () => {
    const result = buildVariationPayload({}, 'prod-1');

    expect(result.on_sale).toBe(false);
    expect(result.sale_price).toBeNull();
    expect(result.sale_ends_at).toBeNull();
  });
});
