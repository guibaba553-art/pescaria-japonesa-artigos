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
  /** mantido por compatibilidade; orçamento mostra os 3 valores */
  paymentMethod?: string | null;
  items: BudgetItem[];
  subtotal: number;
  discount: number;
  total: number;
  notes?: string | null;
}

const COMPANY = {
  name: 'JAPA SPESCA',
  subtitle: 'Pescaria Japonesa - Artigos de Pesca',
  address: 'Sinop - MT',
  site: 'japaspesca.com.br',
};

// Mesmas regras de src/utils/pdvPricing.ts
const MARKUP = { pix: 0, debit: 0.02, credit: 0.03 } as const;
const EXEMPT_KEYWORDS = ['yamalube', 'refil de gas', 'refil de gás'];

function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isExempt(it: BudgetItem): boolean {
  if (it.product.pdv_no_markup) return true;
  const n = normalize(it.product.name);
  return EXEMPT_KEYWORDS.some((k) => n.includes(normalize(k)));
}

function priceFor(it: BudgetItem, method: 'pix' | 'debit' | 'credit'): number {
  const markup = isExempt(it) ? 0 : MARKUP[method];
  return Number((it.unitPrice * (1 + markup)).toFixed(2));
}

async function loadImageAsDataURL(url: string): Promise<{ data: string; w: number; h: number } | null> {
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
  const margin = 12;

  // === Cabeçalho ===
  doc.setFillColor(255, 102, 0);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(COMPANY.name, margin, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(COMPANY.subtitle, margin, 16);
  doc.text(`${COMPANY.address}  ·  ${COMPANY.site}`, margin, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ORÇAMENTO', pageW - margin, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Nº ${data.saleId.slice(0, 8).toUpperCase()}`, pageW - margin, 18, { align: 'right' });

  // === Bloco de info ===
  doc.setTextColor(40, 40, 40);
  let y = 30;
  const created = new Date(data.createdAt);
  const dateStr =
    created.toLocaleDateString('pt-BR') +
    ' ' +
    created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.customerName || 'CONSUMIDOR', margin + 20, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Data/Hora:', pageW - margin - 50, y);
  doc.setFont('helvetica', 'normal');
  doc.text(dateStr, pageW - margin, y, { align: 'right' });

  y += 6;
  if (data.customerCPF) {
    doc.setFont('helvetica', 'bold');
    doc.text('CPF:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.customerCPF, margin + 20, y);
    y += 6;
  }
  if (data.operatorName) {
    doc.setFont('helvetica', 'bold');
    doc.text('Vendedor:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.operatorName, margin + 20, y);
    y += 6;
  }

  // === Cache de imagens ===
  const imageCache = new Map<string, { data: string; w: number; h: number } | null>();
  const urls = data.items
    .map((it) => it.variation?.image_url || it.product.image_url || '')
    .filter(Boolean) as string[];
  await Promise.all(
    Array.from(new Set(urls)).map(async (u) => imageCache.set(u, await loadImageAsDataURL(u))),
  );

  // === Tabela de itens com 3 preços ===
  const rowH = 18;
  autoTable(doc, {
    startY: y + 4,
    margin: { left: margin, right: margin },
    head: [
      [
        { content: 'Foto', rowSpan: 2 },
        { content: 'Cód.', rowSpan: 2 },
        { content: 'Produto', rowSpan: 2 },
        { content: 'Qtd', rowSpan: 2 },
        { content: 'Preço unitário', colSpan: 3, styles: { halign: 'center' } },
        { content: 'Total à vista', rowSpan: 2, styles: { halign: 'right' } },
      ],
      [
        { content: 'PIX/Dinheiro', styles: { halign: 'right' } },
        { content: 'Débito', styles: { halign: 'right' } },
        { content: 'Crédito', styles: { halign: 'right' } },
      ],
    ],
    body: data.items.map((it, idx) => {
      const desc = it.variation ? `${it.product.name}\n${it.variation.name}` : it.product.name;
      const pPix = priceFor(it, 'pix');
      const pDeb = priceFor(it, 'debit');
      const pCre = priceFor(it, 'credit');
      return [
        '',
        it.product.sku || String(idx + 1),
        desc,
        it.quantity.toString(),
        `R$ ${pPix.toFixed(2)}`,
        `R$ ${pDeb.toFixed(2)}`,
        `R$ ${pCre.toFixed(2)}`,
        `R$ ${(pPix * it.quantity).toFixed(2)}`,
      ];
    }),
    headStyles: { fillColor: [40, 40, 40], textColor: 255, fontSize: 9, halign: 'left', valign: 'middle' },
    bodyStyles: { fontSize: 9, minCellHeight: rowH, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 16 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
    didDrawCell: (cellData) => {
      if (cellData.section === 'body' && cellData.column.index === 0) {
        const item = data.items[cellData.row.index];
        const url = item.variation?.image_url || item.product.image_url;
        if (!url) return;
        const img = imageCache.get(url);
        if (!img) return;

        const maxSize = 14;
        const ratio = img.w / img.h;
        let drawW = maxSize, drawH = maxSize;
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

  // === Totais por forma de pagamento ===
  const finalY = (doc as any).lastAutoTable.finalY || y + 50;
  let ty = finalY + 8;

  const totalQty = data.items.reduce((s, it) => s + it.quantity, 0);
  const subPix = data.items.reduce((s, it) => s + priceFor(it, 'pix') * it.quantity, 0);
  const subDeb = data.items.reduce((s, it) => s + priceFor(it, 'debit') * it.quantity, 0);
  const subCre = data.items.reduce((s, it) => s + priceFor(it, 'credit') * it.quantity, 0);

  // Aplica desconto proporcionalmente (subtrai valor fixo de cada total)
  const totPix = Math.max(0, subPix - data.discount);
  const totDeb = Math.max(0, subDeb - data.discount);
  const totCre = Math.max(0, subCre - data.discount);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Quantidade total de itens: ${totalQty}`, margin, ty);
  if (data.discount > 0) {
    doc.text(`Desconto aplicado: − R$ ${data.discount.toFixed(2)}`, margin, ty + 5);
  }

  // Três caixas de total lado a lado, alinhadas à direita
  const boxW = 56;
  const boxH = 18;
  const gap = 3;
  const totalsW = boxW * 3 + gap * 2;
  const startX = pageW - margin - totalsW;

  const drawTotal = (
    x: number,
    label: string,
    value: number,
    fill: [number, number, number],
    highlight = false,
  ) => {
    doc.setFillColor(...fill);
    doc.rect(x, ty, boxW, boxH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label, x + boxW / 2, ty + 6, { align: 'center' });
    doc.setFontSize(highlight ? 14 : 12);
    doc.text(`R$ ${value.toFixed(2)}`, x + boxW / 2, ty + 14, { align: 'center' });
  };

  drawTotal(startX, 'PIX / DINHEIRO', totPix, [22, 163, 74], true); // verde — destaque
  drawTotal(startX + boxW + gap, 'DÉBITO', totDeb, [59, 130, 246]); // azul
  drawTotal(startX + (boxW + gap) * 2, 'CRÉDITO', totCre, [255, 102, 0]); // laranja

  ty += boxH + 6;

  // Aviso de parcelamento no crédito
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(
    'Valores no crédito podem ser parcelados — consulte condições no atendimento.',
    pageW - margin,
    ty,
    { align: 'right' },
  );
  ty += 8;

  // === Observações ===
  if (data.notes) {
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Observações:', margin, ty);
    ty += 5;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(data.notes, pageW - margin * 2);
    doc.text(lines, margin, ty);
    ty += lines.length * 5;
  }

  // === Rodapé ===
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, pageH - 18, pageW - margin, pageH - 18);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Este orçamento não tem valor fiscal. Validade: 7 dias.', margin, pageH - 12);
  doc.text(COMPANY.site, pageW - margin, pageH - 12, { align: 'right' });

  doc.save(`orcamento-${data.saleId.slice(0, 8)}.pdf`);
}
