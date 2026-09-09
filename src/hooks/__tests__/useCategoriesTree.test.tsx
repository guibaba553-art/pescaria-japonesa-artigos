import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const rows: any[] = [
  { id: 'p1', name: 'Varas', slug: 'varas', description: null, icon: null, display_order: 1, parent_id: null, is_primary: true },
  { id: 's1', name: 'Evolution', slug: 'varas-evolution', description: null, icon: null, display_order: 0, parent_id: 'p1', is_primary: false },
  { id: 's2', name: 'Evolution 1.80m', slug: 'varas-evolution-180', description: null, icon: null, display_order: 0, parent_id: 's1', is_primary: false },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [...rows], error: null }),
      }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

import { useCategories } from '../useCategories';

describe('useCategories - hierarquia', () => {
  it('getDescendantsOf retorna subcategorias e sub-subcategorias com profundidade', async () => {
    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.categories.length).toBe(3));

    const tree = result.current.getDescendantsOf('p1');
    expect(tree.map((c) => [c.name, c.depth])).toEqual([
      ['Evolution', 1],
      ['Evolution 1.80m', 2],
    ]);
  });
});
