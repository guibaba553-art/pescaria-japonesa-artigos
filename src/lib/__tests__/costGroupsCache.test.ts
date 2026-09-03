import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadCostGroups, resetCostGroupsCache } from '@/lib/costGroupsCache';

function makeClient(rows: any[], spy: { calls: number }) {
  return {
    from: () => {
      spy.calls++;
      return {
        select: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      };
    },
  };
}

describe('loadCostGroups', () => {
  beforeEach(() => resetCostGroupsCache());

  it('busca os grupos apenas uma vez, mesmo com várias chamadas', async () => {
    const spy = { calls: 0 };
    const client = makeClient([{ id: '1', name: 'A', cost: 10 }], spy);

    const [a, b, c] = await Promise.all([
      loadCostGroups(client),
      loadCostGroups(client),
      loadCostGroups(client),
    ]);
    await loadCostGroups(client);

    expect(spy.calls).toBe(1);
    expect(a).toEqual(b);
    expect(c).toHaveLength(1);
  });

  it('retorna lista vazia em caso de erro e não guarda no cache', async () => {
    const failing = {
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'x' } }) }),
      }),
    };
    expect(await loadCostGroups(failing)).toEqual([]);

    const spy = { calls: 0 };
    expect(await loadCostGroups(makeClient([{ id: '2', name: 'B', cost: 5 }], spy))).toHaveLength(1);
    expect(spy.calls).toBe(1);
  });
});
