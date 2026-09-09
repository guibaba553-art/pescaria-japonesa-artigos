import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const rows: any[] = [
  { id: 'p1', name: 'Varas', slug: 'varas', description: null, icon: null, display_order: 1, parent_id: null, is_primary: true },
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

describe('useCategories', () => {
  beforeEach(() => {
    rows.length = 1;
  });

  it('reload() busca dados novos em vez de usar o cache', async () => {
    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.categories.length).toBe(1));

    rows.push({
      id: 's1', name: 'Evolution', slug: 'varas-evolution', description: null,
      icon: null, display_order: 0, parent_id: 'p1', is_primary: false,
    });

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.getSubcategoriesOf('p1')).toHaveLength(1);
  });
});
