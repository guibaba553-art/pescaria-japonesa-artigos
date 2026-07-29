import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PDV variation queries', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../PDV.tsx'),
    'utf-8'
  );

  it('não deve usar select("*") em product_variations', () => {
    // Find all .from('product_variations') and check if .select('*') follows
    let found = false;
    let fromIdx = 0;
    while (true) {
      const m = /\.from\(['"]product_variations['"]\)/g;
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
  });
});
