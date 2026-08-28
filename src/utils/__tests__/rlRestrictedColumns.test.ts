import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Colunas SEM GRANT para anon/authenticated em `products`, espelhando
 * supabase/migrations/20260728192001_restrict_public_column_access.sql
 * (diff com a lista pública em src/utils/productColumns.ts).
 */
const PRODUCT_RESTRICTED_COLUMNS = [
  'cost',
  'cost_group_id',
  'created_by',
  'freight_pct',
  'min_stock',
  'op_cost_pct',
  'pdv_no_markup',
  'price_cash_percent',
  'price_credit_percent',
  'price_debit_percent',
  'price_pdv',
  'price_pdv_cash',
  'price_pdv_credit',
  'price_pdv_debit',
  'price_pdv_pix',
  'price_pix_percent',
  'sale_price_pdv',
  'supplier_id',
  'tax_pct',
];

/** Colunas SEM GRANT para anon/authenticated em `product_variations`. */
const VARIATION_RESTRICTED_COLUMNS = [
  'cost',
  'cost_group_id',
  'freight_pct',
  'op_cost_pct',
  'price_pdv',
  'sale_price_pdv',
  'tax_pct',
];

/**
 * Wildcards select('*') pré-existentes no base, já corrigidos nas camadas
 * seguintes do stack (02-hook-variacoes e 04-paginas). A invariante abaixo
 * garante que nenhum select('*') NOVO apareça em products/product_variations.
 */
const WILDCARD_LEGACY_FILES = [
  'hooks/useProductVariations.tsx',
  'pages/PDV.tsx',
  'pages/ProductDetails.tsx',
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
  const rel = (file: string) => path.relative(path.resolve(__dirname, '../..'), file);

  it('nenhum select público lê colunas restritas de products/product_variations', () => {
    const offenders: string[] = [];
    for (const file of srcFiles) {
      const source = fs.readFileSync(file, 'utf-8');
      for (const col of PRODUCT_RESTRICTED_COLUMNS) {
        if (new RegExp(`\\.from\\(['"]products['"]\\)[\\s\\S]{0,400}?\\.select\\([^)]*\\b${col}\\b`).test(source)) {
          offenders.push(`${rel(file)}: products.${col}`);
        }
      }
      for (const col of VARIATION_RESTRICTED_COLUMNS) {
        if (new RegExp(`\\.from\\(['"]product_variations['"]\\)[\\s\\S]{0,400}?\\.select\\([^)]*\\b${col}\\b`).test(source)) {
          offenders.push(`${rel(file)}: product_variations.${col}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('nenhum select("*") em products/product_variations (wildcard leria colunas sem GRANT)', () => {
    const wildcardRe =
      /\.from\(\s*['"]products['"]\s*\)[\s\S]{0,400}?\.select\(\s*['"]\*['"]\s*\)|\.from\(\s*['"]product_variations['"]\s*\)[\s\S]{0,400}?\.select\(\s*['"]\*['"]\s*\)/;
    const offenders: string[] = [];
    for (const file of srcFiles) {
      const source = fs.readFileSync(file, 'utf-8');
      const relPath = rel(file);
      if (wildcardRe.test(source) && !WILDCARD_LEGACY_FILES.includes(relPath)) {
        offenders.push(relPath);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('nenhum join products(...)/product_variations(...) embute coluna cost', () => {
    const offenders: string[] = [];
    for (const file of srcFiles) {
      const source = fs.readFileSync(file, 'utf-8');
      if (/products\([^)]*\bcost\b|product_variations\([^)]*\bcost\b/.test(source)) {
        offenders.push(rel(file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
