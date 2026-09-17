import { describe, expect, it } from 'vitest';
import { code39ModuleCount, code128ModuleCount, fitBarcodeBox } from '../barcodeLayout';

describe('code128ModuleCount', () => {
  it('usa modo C (2 dígitos por símbolo) para código numérico par', () => {
    // start(11) + 3 símbolos de dados(33) + checksum(11) + stop(13) = 68
    expect(code128ModuleCount('204731')).toBe(68);
  });

  it('é bem mais compacto que Code39 para o mesmo código', () => {
    expect(code128ModuleCount('204731')).toBeLessThan(code39ModuleCount('204731'));
  });
});

describe('code39ModuleCount', () => {
  it('conta 16 módulos por caractere incluindo os asteriscos', () => {
    // 8 caracteres (*204731*) * 16 - 1 (sem gap final) = 127
    expect(code39ModuleCount('204731')).toBe(127);
  });
});

describe('fitBarcodeBox', () => {
  it('centraliza o código dentro da largura disponível e mantém quiet zone', () => {
    const box = fitBarcodeBox({ moduleCount: 68, maxWidthMm: 34, quietZoneModules: 10 });
    expect(box.widthMm).toBeLessThanOrEqual(34);
    expect(box.offsetMm).toBeGreaterThanOrEqual(0);
    expect(box.moduleMm).toBeGreaterThan(0);
  });

  it('nunca estoura a largura máxima', () => {
    const box = fitBarcodeBox({ moduleCount: 127, maxWidthMm: 20, quietZoneModules: 10 });
    expect(box.widthMm).toBeLessThanOrEqual(20);
  });

  it('sinaliza quando o módulo fica abaixo do mínimo legível', () => {
    const narrow = fitBarcodeBox({ moduleCount: 127, maxWidthMm: 20, quietZoneModules: 10, minModuleMm: 0.25 });
    const ok = fitBarcodeBox({ moduleCount: 68, maxWidthMm: 34, quietZoneModules: 10, minModuleMm: 0.25 });
    expect(narrow.readable).toBe(false);
    expect(ok.readable).toBe(true);
  });
});
