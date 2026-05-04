/**
 * Gerador de PDF de etiquetas no formato A4 com 5 colunas × 13 linhas (65 etiquetas/página).
 * Cada etiqueta contém:
 *  - Nome da loja (cabeçalho)
 *  - Código de barras Code39 (com asteriscos)
 *  - Descrição/nome do produto (curto)
 */

import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';

export interface LabelItem {
  /** Código que vai virar barcode (SKU/EAN). */
  code: string;
  /** Texto curto descritivo (nome do produto / variação). */
  description: string;
  /** Quantas vezes essa etiqueta deve ser impressa. */
  quantity: number;
}

export interface LabelPdfOptions {
  /** Nome da loja exibido no topo de cada etiqueta. */
  storeName?: string;
  /** Filename ao baixar. */
  fileName?: string;
}

/** Gera código de barras Code39 (com asteriscos) como dataURL PNG. */
function barcodeDataUrl(code: string): string {
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, code, {
      format: 'CODE39',
      displayValue: false,
      margin: 0,
      height: 25,
      width: 1,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

/** Trunca texto pra caber na largura da etiqueta (aprox.). */
function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/**
 * Gera o PDF e dispara download.
 */
export async function generateLabelsPdf(
  items: LabelItem[],
  opts: LabelPdfOptions = {}
): Promise<void> {
  const storeName = (opts.storeName || 'JAPAS PESCA E CONVENIÊNCIA').toUpperCase();
  const fileName = opts.fileName || `etiquetas_${new Date().toISOString().slice(0, 10)}.pdf`;

  // Expande lista de acordo com a quantidade
  const expanded: { code: string; description: string }[] = [];
  for (const it of items) {
    const qty = Math.max(0, Math.floor(it.quantity || 0));
    for (let i = 0; i < qty; i++) {
      expanded.push({ code: it.code, description: it.description });
    }
  }

  if (expanded.length === 0) {
    throw new Error('Nenhuma etiqueta para imprimir');
  }

  // Layout: A4 em mm — padrão Pimaco/Avery 5×13 (etiqueta 38.1×21.2mm)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cols = 5;
  const rows = 13;
  const labelW = 38.1;
  const labelH = 21.2;
  const gapX = 2.5;
  const gapY = 0;
  const marginX = (210 - (labelW * cols + gapX * (cols - 1))) / 2; // ~4.7mm
  const marginY = (297 - (labelH * rows + gapY * (rows - 1))) / 2; // ~10.3mm
  const cellW = labelW;
  const cellH = labelH;

  // Pré-gera os barcodes únicos pra evitar reprocesso
  const barcodeCache = new Map<string, string>();
  const uniqueCodes = Array.from(new Set(expanded.map((e) => e.code).filter(Boolean)));
  for (const c of uniqueCodes) {
    barcodeCache.set(c, barcodeDataUrl(c));
  }

  let idx = 0;
  while (idx < expanded.length) {
    if (idx > 0) doc.addPage();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (idx >= expanded.length) break;
        const item = expanded[idx++];
        const x = marginX + c * (cellW + gapX);
        const y = marginY + r * (cellH + gapY);

        // Barcode (no topo, menor)
        const dataUrl = barcodeCache.get(item.code);
        if (dataUrl) {
          doc.addImage(dataUrl, 'PNG', x + 2, y + 1.5, cellW - 4, 6);
        }

        // Código numérico embaixo do barcode
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.text(item.code, x + cellW / 2, y + 10, { align: 'center' });

        // Descrição
        doc.setFontSize(5.5);
        doc.text(truncate(item.description, 30), x + 1.5, y + 13.5);

        // Nome da loja (rodapé)
        doc.setFontSize(4.5);
        doc.text(storeName, x + 1.5, y + cellH - 1);
      }
      if (idx >= expanded.length) break;
    }
  }

  doc.save(fileName);
}
