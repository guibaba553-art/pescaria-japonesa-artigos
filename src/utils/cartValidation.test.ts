import { describe, it, expect, vi } from 'vitest';
import {
  resolveCartInventory,
  validateCartVariations,
  resolveVariationIdForOrderItem,
  type CartItemForValidation,
} from './cartValidation';

/**
 * Mock mínimo do client supabase: cria um from('product_variations').select('id').in('id', ids)
 * que devolve apenas os ids contidos em `existingIds`.
 */
function makeSupabaseMock(existingIds: string[], opts?: { error?: { message: string } }) {
  const inMock = vi.fn((_col: string, ids: string[]) => {
    if (opts?.error) {
      return Promise.resolve({ data: null, error: opts.error });
    }
    const data = ids.filter(id => existingIds.includes(id)).map(id => ({ id }));
    return Promise.resolve({ data, error: null });
  });
  const selectMock = vi.fn(() => ({ in: inMock }));
  const fromMock = vi.fn((_table: string) => ({ select: selectMock }));
  return { from: fromMock, _mocks: { fromMock, selectMock, inMock } };
}

function makeSupabaseInventoryMock({
  products,
  variations,
}: {
  products: Array<{ id: string; stock: number }>;
  variations: Array<{ id: string; product_id: string; stock: number; sku?: string | null; name?: string | null; price?: number | null }>;
}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        in: vi.fn((_column: string, ids: string[]) => {
          if (table === 'products') {
            return Promise.resolve({
              data: products.filter(product => ids.includes(product.id)),
              error: null,
            });
          }

          if (table === 'product_variations') {
            return Promise.resolve({
              data: variations.filter(variation => ids.includes(variation.product_id)),
              error: null,
            });
          }

          return Promise.resolve({ data: [], error: null });
        }),
      })),
    })),
  };
}

describe('validateCartVariations', () => {
  it('retorna conjunto vazio quando o carrinho não tem variações', async () => {
    const supa = makeSupabaseMock([]);
    const cart: CartItemForValidation[] = [
      { product: { id: 'p1' }, quantity: 1 },
      { product: { id: 'p2' }, variation: null, quantity: 2 },
    ];
    const res = await validateCartVariations(supa as any, cart);
    expect(res.missing).toEqual([]);
    expect(res.validVariationIds.size).toBe(0);
    // Não deve nem chamar o banco
    expect(supa._mocks.fromMock).not.toHaveBeenCalled();
  });

  it('marca todas as variações como válidas quando ainda existem', async () => {
    const supa = makeSupabaseMock(['v1', 'v2']);
    const cart: CartItemForValidation[] = [
      { product: { id: 'p1' }, variation: { id: 'v1' }, quantity: 1 },
      { product: { id: 'p2' }, variation: { id: 'v2' }, quantity: 3 },
    ];
    const res = await validateCartVariations(supa as any, cart);
    expect(res.missing).toEqual([]);
    expect(Array.from(res.validVariationIds).sort()).toEqual(['v1', 'v2']);
  });

  it('detecta variação removida (cenário: admin deletou) e a lista em missing', async () => {
    // Banco só tem v1; v2 foi deletada
    const supa = makeSupabaseMock(['v1']);
    const cart: CartItemForValidation[] = [
      { product: { id: 'p1' }, variation: { id: 'v1' }, quantity: 1 },
      { product: { id: 'p2' }, variation: { id: 'v2' }, quantity: 1 },
    ];
    const res = await validateCartVariations(supa as any, cart);
    expect(res.missing).toEqual(['v2']);
    expect(res.validVariationIds.has('v1')).toBe(true);
    expect(res.validVariationIds.has('v2')).toBe(false);
  });

  it('detecta variação recriada com novo id (id antigo no carrinho não existe mais)', async () => {
    // Carrinho tem o id antigo "v-old"; o admin deletou e recriou como "v-new"
    const supa = makeSupabaseMock(['v-new']);
    const cart: CartItemForValidation[] = [
      { product: { id: 'p1' }, variation: { id: 'v-old' }, quantity: 2 },
    ];
    const res = await validateCartVariations(supa as any, cart);
    expect(res.missing).toEqual(['v-old']);
    expect(res.validVariationIds.size).toBe(0);
  });

  it('deduplica ids antes de consultar o banco', async () => {
    const supa = makeSupabaseMock(['v1']);
    const cart: CartItemForValidation[] = [
      { product: { id: 'p1' }, variation: { id: 'v1' }, quantity: 1 },
      { product: { id: 'p1' }, variation: { id: 'v1' }, quantity: 1 },
    ];
    await validateCartVariations(supa as any, cart);
    expect(supa._mocks.inMock).toHaveBeenCalledTimes(1);
    const calledWith = supa._mocks.inMock.mock.calls[0][1];
    expect(calledWith).toEqual(['v1']);
  });

  it('propaga erro do banco', async () => {
    const supa = makeSupabaseMock([], { error: { message: 'db down' } });
    const cart: CartItemForValidation[] = [
      { product: { id: 'p1' }, variation: { id: 'v1' }, quantity: 1 },
    ];
    await expect(validateCartVariations(supa as any, cart)).rejects.toMatchObject({ message: 'db down' });
  });
});

describe('resolveVariationIdForOrderItem', () => {
  it('mantém variation_id quando a variação é válida', () => {
    const valid = new Set(['v1']);
    const id = resolveVariationIdForOrderItem(
      { product: { id: 'p1' }, variation: { id: 'v1' }, quantity: 1 },
      valid,
    );
    expect(id).toBe('v1');
  });

  it('retorna null quando a variação não está no conjunto válido', () => {
    const valid = new Set<string>();
    const id = resolveVariationIdForOrderItem(
      { product: { id: 'p1' }, variation: { id: 'v-old' }, quantity: 1 },
      valid,
    );
    expect(id).toBeNull();
  });

  it('retorna null quando o item não tem variação', () => {
    const id = resolveVariationIdForOrderItem(
      { product: { id: 'p1' }, quantity: 1 },
      new Set(['v1']),
    );
    expect(id).toBeNull();
  });
});

/**
 * Teste de integração simulando o fluxo do PDV:
 * 1) Carrinho montado com v-old
 * 2) Admin deleta v-old e recria como v-new
 * 3) PDV valida antes de inserir order_items
 * 4) Item com variação ausente é redirecionado para variation_id=null,
 *    evitando a violação de FK "order_items_variation_id_fkey"
 */
describe('Integração: deleção/recriação de variação no PDV', () => {
  it('não tenta inserir variation_id inválido em order_items', async () => {
    // Estado do banco DEPOIS da recriação
    const supa = makeSupabaseMock(['v-new', 'v2']);

    const cart: CartItemForValidation[] = [
      // Item carregado antes da recriação — ainda referencia v-old (não existe mais)
      { product: { id: 'p1' }, variation: { id: 'v-old' }, quantity: 1 },
      // Item com variação que continua existindo
      { product: { id: 'p2' }, variation: { id: 'v2' }, quantity: 2 },
      // Item sem variação
      { product: { id: 'p3' }, quantity: 5 },
    ];

    const { validVariationIds, missing } = await validateCartVariations(supa as any, cart);

    // O fluxo do PDV detecta missing > 0 e aborta a venda com mensagem clara,
    // mas se mesmo assim resolvermos os ids para inserção, nenhum FK inválido sai.
    const resolved = cart.map(item => ({
      product_id: item.product.id,
      variation_id: resolveVariationIdForOrderItem(item, validVariationIds),
    }));

    expect(missing).toEqual(['v-old']);
    expect(resolved).toEqual([
      { product_id: 'p1', variation_id: null },   // variação morta -> null (sem FK violation)
      { product_id: 'p2', variation_id: 'v2' },   // mantém
      { product_id: 'p3', variation_id: null },   // nunca teve
    ]);
    // Garante que nenhum id resolvido aponta para algo que não está no banco
    for (const r of resolved) {
      if (r.variation_id !== null) {
        expect(validVariationIds.has(r.variation_id)).toBe(true);
      }
    }
  });

  it('reconcilia variação recriada e usa o estoque novo na finalização', async () => {
    const supa = makeSupabaseInventoryMock({
      products: [{ id: 'p1', stock: 0 }],
      variations: [{ id: 'v-new', product_id: 'p1', stock: 2, sku: 'ABC', name: 'Azul', price: 10 }],
    });

    const cart: CartItemForValidation[] = [
      {
        product: { id: 'p1', stock: 0, name: 'Camiseta' },
        variation: { id: 'v-old', sku: 'ABC', name: 'Azul', price: 10, stock: 0 },
        quantity: 1,
      },
    ];

    const result = await resolveCartInventory(supa as any, cart);

    expect(result.missing).toEqual(['v-old']);
    expect(result.reconciledVariationIds.get('v-old')).toBe('v-new');
    expect(result.resolvedItems).toEqual([
      {
        resolvedVariationId: 'v-new',
        availableStock: 2,
        wasReconciled: true,
        usedProductFallback: false,
      },
    ]);
  });

  it('só cai para o produto principal quando não consegue achar a variação substituta', async () => {
    const supa = makeSupabaseInventoryMock({
      products: [{ id: 'p1', stock: 7 }],
      variations: [],
    });

    const cart: CartItemForValidation[] = [
      {
        product: { id: 'p1', stock: 7, name: 'Linha' },
        variation: { id: 'v-old', sku: 'SEM-MATCH', name: '0.30mm', price: 12, stock: 0 },
        quantity: 1,
      },
    ];

    const result = await resolveCartInventory(supa as any, cart);

    expect(result.resolvedItems).toEqual([
      {
        resolvedVariationId: null,
        availableStock: 7,
        wasReconciled: false,
        usedProductFallback: true,
      },
    ]);
  });
});
