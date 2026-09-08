/**
 * Geração de código de barras em VETOR (não imagem) para PDFs.
 * Renderizar como PNG e redimensionar deixa as barras cinzas/borradas
 * e ilegíveis no leitor. Aqui extraímos as barras via JsBarcode (SVG)
 * e devolvemos posições normalizadas (0..1) para desenhar retângulos
 * pretos sólidos no jsPDF.
 */
import JsBarcode from 'jsbarcode';

export type BarcodeFormat = 'EAN13' | 'EAN8' | 'CODE128' | 'CODE39';

const onlyDigits = (s: string) => /^\d+$/.test(s);

/** Escolhe o melhor simbolismo para o código informado. */
export function pickBarcodeFormat(code: string): BarcodeFormat {
  const c = (code || '').trim();
  if (onlyDigits(c) && c.length === 13) return 'EAN13';
  if (onlyDigits(c) && c.length === 8) return 'EAN8';
  return 'CODE128';
}

export interface BarcodeBars {
  /** Barras normalizadas: x e largura de 0 a 1 sobre a largura total. */
  bars: { x: number; w: number }[];
}

/**
 * Extrai as barras de um código usando o renderer SVG do JsBarcode.
 * Retorna null se o código for inválido para o formato.
 */
export function getBarcodeBars(code: string, format?: BarcodeFormat): BarcodeBars | null {
  if (typeof document === 'undefined') return null;
  const fmt = format || pickBarcodeFormat(code);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, code, {
      format: fmt,
      displayValue: false,
      margin: 0,
      height: 100,
      width: 1,
    });
  } catch {
    return null;
  }

  const rects = Array.from(svg.querySelectorAll('rect'));
  const bars = rects
    .map((r) => ({
      x: parseFloat(r.getAttribute('x') || '0'),
      w: parseFloat(r.getAttribute('width') || '0'),
      fill: (r.getAttribute('fill') || '').toLowerCase(),
    }))
    // o primeiro rect costuma ser o fundo branco
    .filter((b) => b.w > 0 && b.fill !== '#ffffff' && b.fill !== 'white');

  if (bars.length === 0) return null;

  const total = Math.max(...bars.map((b) => b.x + b.w));
  if (!total || !isFinite(total)) return null;

  return { bars: bars.map((b) => ({ x: b.x / total, w: b.w / total })) };
}
