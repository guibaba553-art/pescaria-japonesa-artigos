import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('DREReport product cost access', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../DREReport.tsx'),
    'utf-8'
  );

  it('não deve acessar products(cost) via join', () => {
    expect(source).not.toMatch(/products\s*\(\s*cost\s*\)/);
  });
});
