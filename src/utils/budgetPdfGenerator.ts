import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BudgetItem {
  product: {
    id: string;
    name: string;
    sku?: string | null;
    image_url?: string | null;
    pdv_no_markup?: boolean | null;
  };
  variation?: {
    name: string;
    image_url?: string | null;
  };
  quantity: number;
  /** Preço base = valor à vista (PIX/Dinheiro). Os outros métodos são calculados por markup. */
  unitPrice: number;
}

interface BudgetData {
  saleId: string;
  createdAt: string | Date;
  operatorName?: string | null;
  customerName?: string | null;
  customerCPF?: string | null;
  paymentMethod?: string | null;
  items: BudgetItem[];
  subtotal: number;
  discount: number;
  total: number;
  notes?: string | null;
  /** Quando true, mostra apenas o método de pagamento utilizado (venda finalizada) */
  finalized?: boolean;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'PIX',
  debit: 'Débito',
  credit: 'Crédito',
};

const COMPANY = {
  name: 'JAPA SPESCA',
  subtitle: 'Pescaria Japonesa · Artigos de Pesca',
  address: 'Sinop — MT',
  site: 'japaspesca.com.br',
};

// Paleta alinhada ao design system (index.css)
// primary: hsl(16 100% 56%) ≈ #FF5C1F   |  surface-dark: hsl(210 14% 12%) ≈ #1A1D21
const C = {
  primary: [255, 92, 31] as [number, number, number],
  primaryDark: [230, 76, 18] as [number, number, number],
  ink: [26, 29, 33] as [number, number, number],
  inkSoft: [70, 76, 84] as [number, number, number],
  muted: [140, 146, 155] as [number, number, number],
  line: [232, 234, 238] as [number, number, number],
  surface: [248, 249, 251] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  success: [22, 163, 74] as [number, number, number],
  successSoft: [232, 247, 238] as [number, number, number],
  info: [37, 99, 235] as [number, number, number],
  infoSoft: [232, 240, 254] as [number, number, number],
  warmSoft: [255, 240, 232] as [number, number, number],
};

// Mesmas regras de src/utils/pdvPricing.ts
const MARKUP = { pix: 0, debit: 0.02, credit: 0.03 } as const;
const EXEMPT_KEYWORDS = ['yamalube', 'refil de gas', 'refil de gás'];

const normalize = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const isExempt = (it: BudgetItem) =>
  it.product.pdv_no_markup ||
  EXEMPT_KEYWORDS.some((k) => normalize(it.product.name).includes(normalize(k)));

const priceFor = (it: BudgetItem, method: 'pix' | 'debit' | 'credit') => {
  const markup = isExempt(it) ? 0 : MARKUP[method];
  return Number((it.unitPrice * (1 + markup)).toFixed(2));
};

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function loadImageAsDataURL(
  url: string,
): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const data = reader.result as string;
        const img = new Image();
        img.onload = () => resolve({ data, w: img.width, h: img.height });
        img.onerror = () => resolve(null);
        img.src = data;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateBudgetPdf(data: BudgetData): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ============== CABEÇALHO ==============
  // Fundo escuro elegante
  doc.setFillColor(...C.ink);
  doc.rect(0, 0, pageW, 30, 'F');

  // Faixa fina laranja (acento minimalista estilo Apple)
  doc.setFillColor(...C.primary);
  doc.rect(0, 30, pageW, 1.2, 'F');

  // Marca
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(COMPANY.name, margin, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(200, 205, 212);
  doc.text(COMPANY.subtitle, margin, 19.5);
  doc.text(`${COMPANY.address}  ·  ${COMPANY.site}`, margin, 24);

  // Título do documento à direita
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('ORÇAMENTO', pageW - margin, 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(200, 205, 212);
  doc.text(`Nº ${data.saleId.slice(0, 8).toUpperCase()}`, pageW - margin, 19.5, {
    align: 'right',
  });

  const created = new Date(data.createdAt);
  const dateStr =
    created.toLocaleDateString('pt-BR') +
    ' · ' +
    created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  doc.text(dateStr, pageW - margin, 24, { align: 'right' });

  // ============== CARD DE INFO DO CLIENTE ==============
  let y = 40;
  const infoH = 22;
  doc.setFillColor(...C.surface);
  doc.roundedRect(margin, y, pageW - margin * 2, infoH, 2.5, 2.5, 'F');

  const labelY = y + 7;
  const valueY = y + 13;

  const drawField = (x: number, label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(label.toUpperCase(), x, labelY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.ink);
    doc.text(value || '—', x, valueY);
  };

  const colW = (pageW - margin * 2 - 8) / 3;
  drawField(margin + 5, 'Cliente', data.customerName || 'CONSUMIDOR');
  drawField(margin + 5 + colW, 'CPF/CNPJ', data.customerCPF || '—');
  drawField(margin + 5 + colW * 2, 'Vendedor', data.operatorName || '—');

  y += infoH + 8;

  // ============== CACHE DE IMAGENS ==============
  const imageCache = new Map<string, { data: string; w: number; h: number } | null>();
  const urls = data.items
    .map((it) => it.variation?.image_url || it.product.image_url || '')
    .filter(Boolean) as string[];
  await Promise.all(
    Array.from(new Set(urls)).map(async (u) =>
      imageCache.set(u, await loadImageAsDataURL(u)),
    ),
  );

  // ============== TABELA DE ITENS ==============
  const rowH = 20;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        { content: '', rowSpan: 2 },
        { content: 'Cód.', rowSpan: 2 },
        { content: 'Produto', rowSpan: 2 },
        { content: 'Qtd', rowSpan: 2, styles: { halign: 'center' } },
        {
          content: 'Preço unitário',
          colSpan: 3,
          styles: { halign: 'center', fillColor: C.ink },
        },
        { content: 'Total à vista', rowSpan: 2, styles: { halign: 'right' } },
      ],
      [
        { content: 'PIX / Dinheiro', styles: { halign: 'right', fillColor: C.ink } },
        { content: 'Débito', styles: { halign: 'right', fillColor: C.ink } },
        { content: 'Crédito', styles: { halign: 'right', fillColor: C.ink } },
      ],
    ],
    body: data.items.map((it, idx) => {
      const desc = it.variation
        ? `${it.product.name}\n${it.variation.name}`
        : it.product.name;
      const pPix = priceFor(it, 'pix');
      const pDeb = priceFor(it, 'debit');
      const pCre = priceFor(it, 'credit');
      return [
        '',
        it.product.sku || String(idx + 1),
        desc,
        it.quantity.toString(),
        brl(pPix),
        brl(pDeb),
        brl(pCre),
        brl(pPix * it.quantity),
      ];
    }),
    theme: 'plain',
    headStyles: {
      fillColor: C.ink,
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
      valign: 'middle',
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
    },
    bodyStyles: {
      fontSize: 9,
      minCellHeight: rowH,
      valign: 'middle',
      textColor: C.ink as any,
      lineColor: C.line as any,
      lineWidth: { top: 0, right: 0, bottom: 0.2, left: 0 },
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
    },
    alternateRowStyles: { fillColor: [252, 252, 253] as any },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 18, textColor: C.muted as any, fontSize: 8 },
      2: { cellWidth: 'auto', fontStyle: 'bold' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 20, halign: 'right', textColor: C.inkSoft as any },
      6: { cellWidth: 20, halign: 'right', textColor: C.inkSoft as any },
      7: { cellWidth: 24, halign: 'right', fontStyle: 'bold', textColor: C.primary as any },
    },
    didDrawCell: (cellData) => {
      if (cellData.section === 'body' && cellData.column.index === 0) {
        const item = data.items[cellData.row.index];
        const url = item.variation?.image_url || item.product.image_url;
        if (!url) return;
        const img = imageCache.get(url);
        if (!img) return;

        const maxSize = 15;
        const ratio = img.w / img.h;
        let drawW = maxSize,
          drawH = maxSize;
        if (ratio > 1) drawH = maxSize / ratio;
        else drawW = maxSize * ratio;

        const cx = cellData.cell.x + cellData.cell.width / 2;
        const cy = cellData.cell.y + cellData.cell.height / 2;
        try {
          doc.addImage(img.data, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
        } catch {
          /* ignore */
        }
      }
    },
  });

  // ============== TOTAIS ==============
  const finalY = (doc as any).lastAutoTable.finalY || y + 50;
  let ty = finalY + 10;

  const totalQty = data.items.reduce((s, it) => s + it.quantity, 0);
  const subPix = data.items.reduce((s, it) => s + priceFor(it, 'pix') * it.quantity, 0);
  const subDeb = data.items.reduce((s, it) => s + priceFor(it, 'debit') * it.quantity, 0);
  const subCre = data.items.reduce((s, it) => s + priceFor(it, 'credit') * it.quantity, 0);

  const totPix = Math.max(0, subPix - data.discount);
  const totDeb = Math.max(0, subDeb - data.discount);
  const totCre = Math.max(0, subCre - data.discount);

  // Resumo lateral esquerdo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.muted);
  doc.text('RESUMO', margin, ty);
  doc.setFontSize(9.5);
  doc.setTextColor(...C.ink);
  doc.setFont('helvetica', 'bold');
  doc.text(`${totalQty} ${totalQty === 1 ? 'item' : 'itens'}`, margin, ty + 6);
  if (data.discount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.setFontSize(8.5);
    doc.text(`Desconto aplicado: − ${brl(data.discount)}`, margin, ty + 12);
  }

  // Três cards de totais — design clean estilo Apple
  const boxW = 54;
  const boxH = 26;
  const gap = 4;
  const totalsW = boxW * 3 + gap * 2;
  const startX = pageW - margin - totalsW;

  const drawTotalCard = (
    x: number,
    label: string,
    value: number,
    accent: [number, number, number],
    bg: [number, number, number],
    highlight = false,
  ) => {
    // Card de fundo suave
    doc.setFillColor(...bg);
    doc.roundedRect(x, ty - 4, boxW, boxH, 3, 3, 'F');

    // Acento lateral fino
    doc.setFillColor(...accent);
    doc.roundedRect(x, ty - 4, 1.5, boxH, 0.7, 0.7, 'F');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...accent);
    doc.text(label.toUpperCase(), x + 5, ty + 1);

    // Valor
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(highlight ? 14 : 12);
    doc.setTextColor(...C.ink);
    doc.text(brl(value), x + 5, ty + 11);

    if (highlight) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.muted);
      doc.text('VALOR À VISTA', x + 5, ty + 16);
    }
  };

  drawTotalCard(startX, 'PIX / Dinheiro', totPix, C.success, C.successSoft, true);
  drawTotalCard(startX + boxW + gap, 'Débito', totDeb, C.info, C.infoSoft);
  drawTotalCard(startX + (boxW + gap) * 2, 'Crédito', totCre, C.primary, C.warmSoft);

  ty += boxH + 6;

  // Aviso parcelamento
  doc.setTextColor(...C.muted);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(
    'Valores no crédito podem ser parcelados — consulte condições no atendimento.',
    pageW - margin,
    ty,
    { align: 'right' },
  );
  ty += 8;

  // ============== OBSERVAÇÕES ==============
  if (data.notes) {
    doc.setFillColor(...C.surface);
    const notesLines = doc.splitTextToSize(data.notes, pageW - margin * 2 - 10);
    const notesH = 10 + notesLines.length * 4.5;
    doc.roundedRect(margin, ty, pageW - margin * 2, notesH, 2.5, 2.5, 'F');

    doc.setTextColor(...C.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('OBSERVAÇÕES', margin + 5, ty + 6);

    doc.setTextColor(...C.ink);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(notesLines, margin + 5, ty + 11);
    ty += notesH + 6;
  }

  // ============== RODAPÉ ==============
  doc.setDrawColor(...C.line);
  doc.setLineWidth(0.2);
  doc.line(margin, pageH - 16, pageW - margin, pageH - 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text('Este orçamento não tem valor fiscal · Validade: 7 dias', margin, pageH - 10);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.ink);
  doc.text(COMPANY.name, pageW - margin, pageH - 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  doc.text(COMPANY.site, pageW - margin, pageH - 6, { align: 'right' });

  doc.save(`orcamento-${data.saleId.slice(0, 8)}.pdf`);
}
