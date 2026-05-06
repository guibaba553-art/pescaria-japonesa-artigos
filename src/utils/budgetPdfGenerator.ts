import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BudgetItem {
  product: {
    id: string;
    name: string;
    sku?: string | null;
    image_url?: string | null;
  };
  variation?: {
    name: string;
    image_url?: string | null;
  };
  quantity: number;
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
}

const COMPANY = {
  name: 'JAPA SPESCA',
  subtitle: 'Pescaria Japonesa - Artigos de Pesca',
  address: 'Sinop - MT',
  site: 'japaspesca.com.br',
};

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

function paymentLabel(m?: string | null): string {
  switch (m) {
    case 'cash': return 'Dinheiro';
    case 'credit': return 'Cartão de Crédito';
    case 'debit': return 'Cartão de Débito';
    case 'pix': return 'PIX';
    default: return '—';
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

  doc.setTextColor(255, 255, 255);
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
  const dateStr = created.toLocaleDateString('pt-BR') + ' ' + created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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

  // === Pré-carregar imagens (com cache) ===
  const imageCache = new Map<string, { data: string; w: number; h: number } | null>();
  const imageUrls = data.items.map(it => it.variation?.image_url || it.product.image_url || '').filter(Boolean) as string[];
  await Promise.all(
    Array.from(new Set(imageUrls)).map(async (url) => {
      imageCache.set(url, await loadImageAsDataURL(url));
    })
  );

  // === Tabela de itens ===
  const rowH = 18; // mm — espaço para imagem
  autoTable(doc, {
    startY: y + 4,
    margin: { left: margin, right: margin },
    head: [['Foto', 'Cód.', 'Produto', 'Qtd', 'Unit.', 'Total']],
    body: data.items.map((it, idx) => {
      const desc = it.variation
        ? `${it.product.name}\n${it.variation.name}`
        : it.product.name;
      return [
        '', // imagem desenhada manualmente
        it.product.sku || String(idx + 1),
        desc,
        it.quantity.toString(),
        `R$ ${it.unitPrice.toFixed(2)}`,
        `R$ ${(it.unitPrice * it.quantity).toFixed(2)}`,
      ];
    }),
    headStyles: {
      fillColor: [40, 40, 40],
      textColor: 255,
      fontSize: 9,
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 9,
      minCellHeight: rowH,
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 18 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    didDrawCell: (cellData) => {
      if (cellData.section === 'body' && cellData.column.index === 0) {
        const item = data.items[cellData.row.index];
        const url = item.variation?.image_url || item.product.image_url;
        if (!url) return;
        const img = imageCache.get(url);
        if (!img) return;

        const maxSize = 14; // mm
        const ratio = img.w / img.h;
        let drawW = maxSize, drawH = maxSize;
        if (ratio > 1) drawH = maxSize / ratio;
        else drawW = maxSize * ratio;

        const cx = cellData.cell.x + cellData.cell.width / 2;
        const cy = cellData.cell.y + cellData.cell.height / 2;
        try {
          doc.addImage(img.data, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
        } catch (e) {
          // ignora imagens com formato não suportado
        }
      }
    },
  });

  // === Totais ===
  const finalY = (doc as any).lastAutoTable.finalY || y + 50;
  let ty = finalY + 6;
  const totalQty = data.items.reduce((s, it) => s + it.quantity, 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Quantidade total de itens: ${totalQty}`, margin, ty);

  const rightX = pageW - margin;
  doc.text('Subtotal:', rightX - 35, ty);
  doc.text(`R$ ${data.subtotal.toFixed(2)}`, rightX, ty, { align: 'right' });
  ty += 6;

  if (data.discount > 0) {
    doc.text('Desconto:', rightX - 35, ty);
    doc.text(`− R$ ${data.discount.toFixed(2)}`, rightX, ty, { align: 'right' });
    ty += 6;
  }

  // Caixa do total
  doc.setFillColor(255, 102, 0);
  doc.rect(rightX - 60, ty - 1, 60, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', rightX - 56, ty + 6);
  doc.text(`R$ ${data.total.toFixed(2)}`, rightX - 3, ty + 6, { align: 'right' });
  ty += 14;

  // === Forma de pagamento / observações ===
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Forma de Pagamento:', margin, ty);
  doc.setFont('helvetica', 'normal');
  doc.text(paymentLabel(data.paymentMethod), margin + 42, ty);
  ty += 6;

  if (data.notes) {
    doc.setFont('helvetica', 'bold');
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
