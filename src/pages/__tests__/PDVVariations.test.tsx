import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PDV variation queries', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../PDV.tsx'),
    'utf-8'
  );

  it.each(['product_variations', 'products'])(
    'não deve usar select("*") em %s',
    (table) => {
      // Find all .from('<table>') and check if .select('*') follows
      let found = false;
      let fromIdx = 0;
      while (true) {
        const m = new RegExp(`\\.from\\(['"]${table}['"]\\)`, 'g');
        m.lastIndex = fromIdx;
        const fromMatch = m.exec(source);
        if (!fromMatch) break;
        fromIdx = fromMatch.index + 1;
        const rest = source.slice(fromMatch.index, fromMatch.index + 500);
        if (/\.select\(['"]\*['"]\)/.test(rest) && !/\.select\(['"]id,/.test(rest)) {
          found = true;
          break;
        }
      }
      expect(found).toBe(false);
    }
  );

  it('usa a RPC get_product_admin no fallback de código de barras', () => {
    expect(source).toContain("rpc('get_product_admin', { p_id: productId })");
    expect(source).not.toContain("(supabase.rpc as any)");
  });
});
