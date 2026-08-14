import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const mockRpc = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const currentDir = dirname(fileURLToPath(import.meta.url));

describe('useProductVariations data fetching', () => {
  it('deve usar RPC get_product_variations_by_product em vez de select', async () => {
    const { useProductVariations } = await import('../useProductVariations');
    
    expect(useProductVariations).toBeDefined();
    expect(typeof useProductVariations).toBe('function');
  });

  it('não deve usar select(*) em product_variations', () => {
    const source = readFileSync(
      resolve(currentDir, '../useProductVariations.tsx'),
      'utf-8'
    );
    expect(source).not.toMatch(/\.from\(['"]product_variations['"]\)\s*\.\s*select\(['"]\*['"]\)/);
  });
});
