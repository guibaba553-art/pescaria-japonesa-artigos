import * as pdfjsLib from 'pdfjs-dist';
// Worker servido pela própria lib (sem precisar copiar para /public)
// @ts-ignore - import com ?url do Vite
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;

export interface ExtractedStockLine {
  raw: string;
  name: string;
  quantity: number;
  /** Possível EAN/SKU detectado na linha (13 ou 8 dígitos) */
  code?: string;
}

/**
 * Lê todas as páginas do PDF e devolve linhas reconstruídas a partir
 * dos itens de texto, agrupando por coordenada Y aproximada.
 */
async function extractRawLines(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;
  const allLines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Agrupa por linha (Y arredondado)
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const str = (item.str || '').trim();
      if (!str) continue;
      const arr = rows.get(y) || [];
      arr.push({ x, str });
      rows.set(y, arr);
    }

    // Ordena por Y desc (PDF começa de baixo) e monta a linha pela ordem X
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x).map((p) => p.str);
      const line = parts.join(' ').replace(/\s+/g, ' ').trim();
      if (line) allLines.push(line);
    }
  }
  return allLines;
}

/**
 * Tenta extrair (nome, quantidade) de cada linha.
 * Heurísticas:
 *  - Última coluna numérica inteira => quantidade
 *  - Códigos EAN (13 dígitos) ou SKU (8) detectados separadamente
 *  - Ignora linhas claramente de cabeçalho/rodapé
 */
export async function extractStockFromPdf(file: File): Promise<ExtractedStockLine[]> {
  const lines = await extractRawLines(file);
  const out: ExtractedStockLine[] = [];

  const headerPattern = /^(produto|descri|item|qtd|quant|estoque|c[oó]digo|total|p[aá]gina|pag\.)/i;

  for (const line of lines) {
    if (line.length < 4) continue;
    if (headerPattern.test(line)) continue;

    // Procura possível código EAN/SKU
    const codeMatch = line.match(/\b(\d{13}|\d{12}|\d{8})\b/);
    const code = codeMatch?.[1];

    // Procura todos os números na linha; assume que a quantidade é o ÚLTIMO
    // número inteiro "pequeno" (até 6 dígitos). Ignora valores monetários (com , ou .)
    const numbers = [...line.matchAll(/(?:^|\s)(\d{1,6})(?=\s|$)/g)].map((m) => ({
      value: parseInt(m[1], 10),
      index: m.index ?? 0,
      raw: m[1],
    }));

    if (numbers.length === 0) continue;

    // Remove o código de barras da lista de candidatos a quantidade
    const candidates = numbers.filter((n) => n.raw !== code);
    if (candidates.length === 0) continue;

    const qty = candidates[candidates.length - 1];
    if (qty.value <= 0 || qty.value > 99999) continue;

    // Nome = tudo antes da quantidade, removendo o código se estiver no meio
    let name = line.slice(0, qty.index).trim();
    if (code) name = name.replace(code, '').replace(/\s+/g, ' ').trim();
    // Remove pontuação solta e numeração de linha do tipo "1)" no começo
    name = name.replace(/^\d+[\)\.\-]\s*/, '').trim();

    if (name.length < 2) continue;

    out.push({ raw: line, name, quantity: qty.value, code });
  }

  return out;
}
