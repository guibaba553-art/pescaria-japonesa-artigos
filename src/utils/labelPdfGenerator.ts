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
  /** Preço (no crédito) a exibir na etiqueta. Opcional. */
  price?: number | null;
}

export interface LabelPdfOptions {
  /** Nome da loja exibido no topo de cada etiqueta. */
  storeName?: string;
  /** Filename ao baixar. */
  fileName?: string;
  /**
   * Quantos quadrados (etiquetas) pular no início da PRIMEIRA folha,
   * deixando-os em branco. Útil quando a folha já foi parcialmente usada.
   * Ex.: skipSlots=3 começa a imprimir no 4º quadrado.
   */
  skipSlots?: number;
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

/** Quebra texto em até N linhas com largura máxima por linha. */
function wrapLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const tentative = current ? current + ' ' + w : w;
    if (tentative.length <= maxCharsPerLine) {
      current = tentative;
    } else {
      if (current) lines.push(current);
      // palavra maior que a linha — quebra dura
      if (w.length > maxCharsPerLine) {
        let rest = w;
        while (rest.length > maxCharsPerLine) {
          lines.push(rest.slice(0, maxCharsPerLine));
          rest = rest.slice(maxCharsPerLine);
        }
        current = rest;
      } else {
        current = w;
      }
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines);
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
  const expanded: { code: string; description: string; price?: number | null }[] = [];
  for (const it of items) {
    const qty = Math.max(0, Math.floor(it.quantity || 0));
    for (let i = 0; i < qty; i++) {
      expanded.push({ code: it.code, description: it.description, price: it.price });
    }
  }

  const fmtPrice = (v: number) =>
    `R$ ${v.toFixed(2).replace('.', ',')}`;

  if (expanded.length === 0) {
    throw new Error('Nenhuma etiqueta para imprimir');
  }

  // Layout: A4 com margens fornecidas pelo usuário
  // Margens: superior 1,3cm | inferior 1,0cm | laterais 0,5cm
  // Etiqueta: 3,8cm largura × 2,1cm altura — 5 colunas × 13 linhas (65 etiquetas)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cols = 5;
  const rows = 13;
  const labelW = 38; // 3,8cm
  const labelH = 21; // 2,1cm
  const marginX = 5;     // 0,5cm laterais
  const marginTop = 13;  // 1,3cm superior
  // espaço horizontal restante distribuído como gap entre colunas
  const gapX = (210 - marginX * 2 - labelW * cols) / (cols - 1);
  // espaço vertical restante (considerando inferior de 1,0cm) distribuído entre linhas
  const marginBottom = 10; // 1,0cm
  const gapY = (297 - marginTop - marginBottom - labelH * rows) / (rows - 1);
  const marginY = marginTop;
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

        // Deslocamento fino para alinhar com a etiqueta física
        const offX = -0.5; // esquerda
        const offY = 1.5;  // baixo

        // Barcode (no topo, menor)
        const dataUrl = barcodeCache.get(item.code);
        if (dataUrl) {
          doc.addImage(dataUrl, 'PNG', x + 2 + offX, y + 1.5 + offY, cellW - 4, 6);
        }

        // Código numérico embaixo do barcode
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.text(item.code, x + cellW / 2 + offX, y + 10 + offY, { align: 'center' });

        // Descrição (até 2 linhas, sem reticências)
        doc.setFontSize(5.5);
        const descLines = wrapLines(item.description, 32, 2);
        descLines.forEach((line, i) => {
          doc.text(line, x + 1.5 + offX, y + 13.5 + offY + i * 2.4);
        });

        // Preço (crédito) — em destaque, à direita
        if (item.price != null && !isNaN(Number(item.price))) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(fmtPrice(Number(item.price)), x + cellW - 1.5 + offX, y + cellH - 1 + offY, {
            align: 'right',
          });
          doc.setFont('helvetica', 'normal');
        }

        // Nome da loja (rodapé)
        doc.setFontSize(4.5);
        doc.text(storeName, x + 1.5 + offX, y + cellH - 1 + offY);
      }
      if (idx >= expanded.length) break;
    }
  }

  doc.save(fileName);
}
