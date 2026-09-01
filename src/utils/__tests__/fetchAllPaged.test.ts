import { describe, it, expect } from 'vitest';
import { fetchAllPaged } from '@/utils/fetchAllPaged';

function makeSource(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  return (from: number, to: number) =>
    Promise.resolve({ data: rows.slice(from, to + 1), error: null });
}

describe('fetchAllPaged', () => {
  it('traz todas as linhas mesmo acima do limite de 1000', async () => {
    const rows = await fetchAllPaged(makeSource(2917), 1000);
    expect(rows).toHaveLength(2917);
    expect((rows[2916] as { id: number }).id).toBe(2916);
  });

  it('para quando a página vem incompleta', async () => {
    const rows = await fetchAllPaged(makeSource(150), 1000);
    expect(rows).toHaveLength(150);
  });

  it('retorna vazio em caso de erro', async () => {
    const rows = await fetchAllPaged(
      () => Promise.resolve({ data: null, error: { message: 'x' } }),
      1000,
    );
    expect(rows).toEqual([]);
  });
});
