import { describe, it, expect } from 'vitest';
import { pickBarcodeFormat, getBarcodeBars } from '../barcodeVector';

describe('pickBarcodeFormat', () => {
  it('usa EAN13 para 13 dígitos', () => {
    expect(pickBarcodeFormat('6973646419144')).toBe('EAN13');
  });
  it('usa EAN8 para 8 dígitos', () => {
    expect(pickBarcodeFormat('12345670')).toBe('EAN8');
  });
  it('usa CODE128 para alfanumérico', () => {
    expect(pickBarcodeFormat('SKU-123')).toBe('CODE128');
  });
});

describe('getBarcodeBars', () => {
  it('retorna barras normalizadas entre 0 e 1', () => {
    const res = getBarcodeBars('6973646419144');
    expect(res).not.toBeNull();
    expect(res!.bars.length).toBeGreaterThan(20);
    for (const b of res!.bars) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(1.0001);
    }
  });
});
