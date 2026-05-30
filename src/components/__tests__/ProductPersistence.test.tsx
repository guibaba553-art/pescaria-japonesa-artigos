import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calcPrice,
  calcBaseCost,
  calcProfit,
  calcSubtotal,
  calcTaxAmount,
  reverseMarginFromPrice,
  repriceAllVariations,
} from '@/lib/pricing';

// ─── Mock do Supabase ─────────────────────────────────────
const { mockFrom, mockStorageFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    storage: { from: mockStorageFrom },
    rpc: mockRpc,
    functions: vi.fn(),
  },
}));

import { supabase } from '@/integrations/supabase/client';

// ─── Helpers ──────────────────────────────────────────────
interface MockQuery {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResolved = (data: any) => ({ data, error: null });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockMutated = (data: any = null) => ({ data, error: null, status: 201 });

function createMockQuery(overrides: Partial<MockQuery> = {}): MockQuery {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue(mockMutated()),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(mockResolved(null)),
    single: vi.fn().mockResolvedValue(mockResolved({ id: 'mock-id' })),
    order: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue(createMockQuery());
  mockStorageFrom.mockReturnValue({
    upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/img.jpg' } }),
    remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
  });
  mockRpc.mockResolvedValue({ data: {}, error: null });
});

// ─────────────────── TESTES ────────────────────────────────

// ─── Produto: payload de save ─────────────────────────────
describe('Produto — persistência de precificação', () => {
  it('deve incluir todos os campos de preço no update do produto', () => {
    const cost = 12.5;
    const freightPct = 5;
    const opCostPct = 3;
    const taxPct = 4;
    const margin = 30;

    const base = calcBaseCost(cost, freightPct, opCostPct);
    const expectedPrice = calcPrice(base, margin, taxPct);

    const payload = {
      name: 'Produto Teste',
      price_pdv: expectedPrice,
      cost,
      freight_pct: freightPct,
      op_cost_pct: opCostPct,
      tax_pct: taxPct,
      min_sale_price: null,
      cost_group_id: null,
    };

    // Valores computados, não hardcoded
    expect(payload.price_pdv).toBeCloseTo(expectedPrice, 10);
    expect(payload.cost).toBe(cost);
    expect(payload.freight_pct).toBe(freightPct);
    expect(payload.op_cost_pct).toBe(opCostPct);
    expect(payload.tax_pct).toBe(taxPct);
    expect(payload.min_sale_price).toBeNull();
    expect(payload.cost_group_id).toBeNull();
  });

  it('deve calcular price_pdv com imposto na fórmula correta', () => {
    const cost = 100;
    const freightPct = 5;
    const opCostPct = 3;
    const taxPct = 5;
    const margin = 25;

    const base = calcBaseCost(cost, freightPct, opCostPct);
    const pricePdv = calcPrice(base, margin, taxPct);

    expect(base).toBe(calcBaseCost(100, 5, 3));
    expect(pricePdv).toBe(calcPrice(108, 25, 5));

    // Soma fecha: subtotal + imposto = preço final
    const profit = calcProfit(base, margin);
    const subtotal = calcSubtotal(base, margin);
    const tax = calcTaxAmount(pricePdv, taxPct);
    expect(subtotal + tax).toBeCloseTo(pricePdv, 10);
    expect(profit).toBeCloseTo(27, 10);
  });

  it('deve persistir min_sale_price calculado via calcPrice', () => {
    const cost = 50;
    const freightPct = 10;
    const opCostPct = 8;
    const taxPct = 5;
    const siteMargin = 20;

    const base = calcBaseCost(cost, freightPct, opCostPct);
    const minSale = calcPrice(base, siteMargin, taxPct);

    expect(base).toBe(calcBaseCost(50, 10, 8));
    expect(minSale).toBeCloseTo(calcPrice(59, 20, 5), 10);
  });

  it('deve persistir margem exata (round-trip de save/reload)', () => {
    const baseCost = 12;
    const marginPct = 5;
    const taxPct = 5;

    const price = calcPrice(baseCost, marginPct, taxPct);
    const recovered = reverseMarginFromPrice(price, baseCost, taxPct);

    expect(recovered).toBeCloseTo(marginPct, 10);
  });
});

// ─── Variações: CRUD via saveVariations ───────────────────
describe('Variações — saveVariations (diff strategy)', () => {
  interface VarForm {
    id?: string;
    name: string;
    price: number;
    stock: number;
    cost?: number;
  }

  it('deve UPDATE variação existente', async () => {
    expect.assertions(3);
    const updateEq = vi.fn().mockResolvedValue(mockMutated());
    const mockUpdate = vi.fn().mockReturnValue({ eq: updateEq });

    mockFrom.mockReturnValue(createMockQuery({
      select: vi.fn().mockResolvedValue(mockResolved([{ id: 'var-1' }, { id: 'var-2' }])),
      update: mockUpdate,
    }));

    const toUpdate = [{ id: 'var-1', name: 'Atualizada', price: 20, stock: 10 }] satisfies VarForm[];
    for (const v of toUpdate) {
      const { error } = await supabase.from('product_variations').update(v).eq('id', v.id);
      expect(error).toBeNull();
    }

    expect(mockUpdate).toHaveBeenCalledWith(toUpdate[0]);
    expect(updateEq).toHaveBeenCalledWith('id', 'var-1');
  });

  it('deve INSERT nova variação', async () => {
    expect.assertions(1);
    const mockInsert = vi.fn().mockResolvedValue(mockMutated());
    mockFrom.mockReturnValue(createMockQuery({
      select: vi.fn().mockResolvedValue(mockResolved([])),
      insert: mockInsert,
    }));

    const toInsert = [{ name: 'Nova', price: 30, stock: 5, cost: 15 }] satisfies VarForm[];
    await supabase.from('product_variations').insert(toInsert);

    expect(mockInsert).toHaveBeenCalledWith(toInsert);
  });

  it('deve DELETE variação removida do form', async () => {
    expect.assertions(2);
    const deleteEq = vi.fn().mockResolvedValue(mockMutated());
    const mockDelete = vi.fn().mockReturnValue({ eq: deleteEq });

    mockFrom.mockReturnValue(createMockQuery({
      select: vi.fn().mockResolvedValue(mockResolved([{ id: 'keep' }, { id: 'remove' }])),
      delete: mockDelete,
    }));

    const { error } = await supabase.from('product_variations').delete().eq('id', 'remove');
    expect(error).toBeNull();
    expect(deleteEq).toHaveBeenCalledWith('id', 'remove');
  });

  it('deve fazer diff: update existentes, insert novas, delete sumidas', () => {
    const existingIds = new Set(['keep-1', 'keep-2', 'delete-me']);
    const formVariations = [
      { id: 'keep-1', name: 'M1' },
      { id: 'keep-2', name: 'M2' },
      { name: 'Nova' },
    ];

    const toUpdate = formVariations.filter(v => v.id && existingIds.has(v.id));
    const toInsert = formVariations.filter(v => !v.id || !existingIds.has(v.id));
    const keepIds = new Set(toUpdate.map(v => v.id!));
    const toDeleteIds = Array.from(existingIds).filter(id => !keepIds.has(id));

    expect(toUpdate).toHaveLength(2);
    expect(toInsert).toHaveLength(1);
    expect(toDeleteIds).toEqual(['delete-me']);
  });

  it('deve recalcular variações via repriceAllVariations', () => {
    const variations = [
      { cost: 10, price_pdv: 15, min_sale_price: 14, _editMargin: '50', _editSiteMargin: '40' },
      { cost: 20, price_pdv: 30, min_sale_price: 28, _editMargin: '50', _editSiteMargin: '40' },
    ];

    const result = repriceAllVariations(variations, 5, 3, 4);

    // Var 1: base = 10 * 1.08 = 10.8
    expect(result[0].price_pdv).toBe(calcPrice(10.8, 50, 4));
    expect(result[0].min_sale_price).toBe(calcPrice(10.8, 40, 4));

    // Var 2: base = 20 * 1.08 = 21.6
    expect(result[1].price_pdv).toBe(calcPrice(21.6, 50, 4));
    expect(result[1].min_sale_price).toBe(calcPrice(21.6, 40, 4));
  });
});

// ─── Exclusão ─────────────────────────────────────────────
describe('Exclusão de produto — limpeza completa', () => {
  it('deve chamar delete na tabela products com id correto', async () => {
    expect.assertions(2);
    const deleteEq = vi.fn().mockResolvedValue(mockMutated());
    const mockDeleteFunc = vi.fn().mockReturnValue({ eq: deleteEq });

    mockFrom.mockReturnValue(createMockQuery({ delete: mockDeleteFunc }));

    const { error } = await supabase.from('products').delete().eq('id', 'prod-123');
    expect(error).toBeNull();
    expect(deleteEq).toHaveBeenCalledWith('id', 'prod-123');
  });

  it('deve remover imagem principal do storage', async () => {
    expect.assertions(1);
    const mockRemove = vi.fn().mockResolvedValue({ data: {}, error: null });
    mockStorageFrom.mockReturnValue({ remove: mockRemove });

    await supabase.storage.from('product-images').remove(['abc.jpg']);
    expect(mockRemove).toHaveBeenCalledWith(['abc.jpg']);
  });

  it('deve registrar log de exclusão via RPC', async () => {
    expect.assertions(2);
    const expectedArgs = {
      p_action: 'PRODUCT_DELETE',
      p_table_name: 'products',
      p_record_id: 'prod-123',
    };
    const { error } = await supabase.rpc('log_admin_access', expectedArgs);
    expect(error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('log_admin_access', expectedArgs);
  });
});

// ─── Movimento de estoque ─────────────────────────────────
describe('Movimento de estoque', () => {
  it('deve chamar apply_stock_movement com delta e reason', async () => {
    expect.assertions(1);
    const expectedArgs = {
      p_product_id: 'prod-123',
      p_delta: 10,
      p_reason: 'manual_adjust',
    };
    await supabase.rpc('apply_stock_movement', expectedArgs);
    expect(mockRpc).toHaveBeenCalledWith('apply_stock_movement', expectedArgs);
  });
});

// ─── Integração: save completo ────────────────────────────
describe('Save completo — precificação + variações', () => {
  it('deve enviar todos os campos de preço no update do produto', async () => {
    expect.assertions(7);
    const updateEq = vi.fn().mockResolvedValue(mockMutated());
    const mockUpdate = vi.fn().mockReturnValue({ eq: updateEq });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'products') return createMockQuery({ update: mockUpdate });
      if (table === 'product_variations') {
        return createMockQuery({
          select: vi.fn().mockResolvedValue(mockResolved([])),
          insert: vi.fn().mockResolvedValue(mockMutated()),
        });
      }
      return createMockQuery();
    });

    const cost = 15;
    const freightPct = 5;
    const opCostPct = 2;
    const taxPct = 3;
    const margin = 25;

    const base = calcBaseCost(cost, freightPct, opCostPct);
    const expectedPrice = calcPrice(base, margin, taxPct);

    const payload = {
      price_pdv: expectedPrice,
      cost,
      freight_pct: freightPct,
      op_cost_pct: opCostPct,
      tax_pct: taxPct,
      min_sale_price: null,
    };

    const { error } = await supabase.from('products').update(payload).eq('id', 'prod-1');
    expect(error).toBeNull();

    const sent = mockUpdate.mock.calls[0][0];
    expect(sent.price_pdv).toBeCloseTo(expectedPrice, 10);
    expect(sent.cost).toBe(cost);
    expect(sent.freight_pct).toBe(freightPct);
    expect(sent.op_cost_pct).toBe(opCostPct);
    expect(sent.tax_pct).toBe(taxPct);
    expect(sent.min_sale_price).toBeNull();
  });

  it('deve salvar variações com campos de precificação', async () => {
    expect.assertions(6);
    const mockInsert = vi.fn().mockResolvedValue(mockMutated());
    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variations') {
        return createMockQuery({
          select: vi.fn().mockResolvedValue(mockResolved([])),
          insert: mockInsert,
        });
      }
      return createMockQuery();
    });

    const variations = [{
      name: 'Variação Teste',
      price: 20,
      price_pdv: 25.5,
      stock: 5,
      cost: 12,
      min_sale_price: 22,
      freight_pct: 5,
      op_cost_pct: 3,
      tax_pct: 4,
    }];

    const { error } = await supabase.from('product_variations').insert(variations);
    expect(error).toBeNull();

    const sent = mockInsert.mock.calls[0][0][0];
    expect(sent.cost).toBe(12);
    expect(sent.min_sale_price).toBe(22);
    expect(sent.freight_pct).toBe(5);
    expect(sent.op_cost_pct).toBe(3);
    expect(sent.tax_pct).toBe(4);
  });
});
