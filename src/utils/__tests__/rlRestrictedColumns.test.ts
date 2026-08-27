import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const RESTRICTED_COLUMNS = [
  'cost',
  'price_pdv',
  'price_pdv_pix',
  'price_pdv_cash',
  'price_pdv_debit',
  'price_pdv_credit',
  'price_cash_percent',
  'price_pix_percent',
  'price_debit_percent',
  'price_credit_percent',
  'supplier_id',
  'created_by',
  'freight_pct',
  'op_cost_pct',
  'tax_pct',
  'cost_group_id',
  'pdv_no_markup',
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(path.join(dir, e.name))
      : /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.tsx')
        ? [path.join(dir, e.name)]
        : []
  );
}

describe('RLS restricted column access', () => {
  const srcFiles = walk(path.resolve(__dirname, '../../'));

  it('nenhum select público lê colunas restritas de products/product_variations', () => {
    const offenders: string[] = [];
    for (const file of srcFiles) {
      const source = fs.readFileSync(file, 'utf-8');
      for (const col of RESTRICTED_COLUMNS) {
        const tableRe = new RegExp(
          `\\.from\\(['"]products['"]\\)[\\s\\S]{0,400}?\\.select\\([^)]*\\b${col}\\b|` +
          `\\.from\\(['"]product_variations['"]\\)[\\s\\S]{0,400}?\\.select\\([^)]*\\b${col}\\b`
        );
        if (tableRe.test(source)) {
          offenders.push(`${path.relative(path.resolve(__dirname, '../..'), file)}: ${col}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('nenhum join products(...)/product_variations(...) embute coluna cost', () => {
    const offenders: string[] = [];
    for (const file of srcFiles) {
      const source = fs.readFileSync(file, 'utf-8');
      if (/products\([^)]*\bcost\b|product_variations\([^)]*\bcost\b/.test(source)) {
        offenders.push(path.relative(path.resolve(__dirname, '../..'), file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
