import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';
import { PARTNER_SHIPPING_OPTION } from '@/lib/partnerDelivery';

export interface PartnerLabelOrder {
  id: string;
  created_at?: string | null;
  delivery_type?: string | null;
  shipping_service_id?: number | null;
  shipping_cost?: number | null;
  total_amount?: number | null;
  shipping_recipient_name?: string | null;
  shipping_recipient_phone?: string | null;
  shipping_street?: string | null;
  shipping_number?: string | null;
  shipping_complement?: string | null;
  shipping_neighborhood?: string | null;
  shipping_city?: string | null;
  shipping_uf?: string | null;
  shipping_cep?: string | null;
  shipping_address?: string | null;
  order_items?: Array<{ quantity: number }>;
}

export const STORE_SENDER = {
  name: 'JAPAS Pesca',
  line1: 'Av. das Itaúbas, 2281',
  line2: 'Jardim Paraíso — Sinop/MT',
  cep: '78556-100',
};

export function isPartnerShippingOrder(o: PartnerLabelOrder): boolean {
  return o.delivery_type === 'delivery' && !o.shipping_service_id;
}

const fmtCep = (c?: string | null) => {
  const d = (c || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};
const fmtPhone = (p?: string | null) => {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
};

export function buildPartnerLabelData(o: PartnerLabelOrder) {
  const street = [o.shipping_street, o.shipping_number].filter(Boolean).join(', ');
  const line1 = street
    ? [street, o.shipping_complement].filter(Boolean).join(' — ')
    : o.shipping_address || '';
  const cityUf = [o.shipping_city, o.shipping_uf].filter(Boolean).join('/');
  const line2 = [o.shipping_neighborhood, cityUf].filter(Boolean).join(' — ');
  return {
    orderId: o.id,
    orderCode: o.id.slice(0, 8).toUpperCase(),
    date: o.created_at ? new Date(o.created_at) : new Date(),
    carrier: PARTNER_SHIPPING_OPTION.nome,
    service: PARTNER_SHIPPING_OPTION.servico,
    freight: Number(o.shipping_cost ?? PARTNER_SHIPPING_OPTION.valor),
    total: Number(o.total_amount ?? 0),
    itemCount: (o.order_items || []).reduce((s, i) => s + (i.quantity || 0), 0),
    recipient: {
      name: o.shipping_recipient_name || '',
      phone: fmtPhone(o.shipping_recipient_phone),
      line1,
      line2,
      cep: fmtCep(o.shipping_cep),
    },
    sender: STORE_SENDER,
  };
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Etiqueta 100 x 150 mm (padrão de impressora térmica). */
export function generatePartnerLabelPdf(o: PartnerLabelOrder): jsPDF {
  const d = buildPartnerLabelData(o);
  const doc = new jsPDF({ unit: 'mm', format: [100, 150] });
  const M = 5;
  const W = 100 - M * 2;
  let y = M;

  doc.setLineWidth(0.4);
  doc.rect(M, M, W, 140);

  // Cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(d.carrier.toUpperCase(), 50, y + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${d.service} — Frete ${brl(d.freight)}`, 50, y + 11.5, { align: 'center' });
  y += 14;
  doc.line(M, y, M + W, y);

  // Pedido + código de barras
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`PEDIDO #${d.orderCode}`, M + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(d.date.toLocaleDateString('pt-BR'), M + W - 3, y + 5, { align: 'right' });
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, d.orderId, { format: 'CODE128', displayValue: false, margin: 0, height: 60, width: 2 });
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', M + 4, y + 7, W - 8, 13);
  } catch { /* sem código de barras */ }
  y += 23;
  doc.line(M, y, M + W, y);

  // Destinatário
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DESTINATÁRIO', M + 3, y + 5);
  doc.setFontSize(13);
  const nameLines = doc.splitTextToSize(d.recipient.name || '—', W - 6);
  doc.text(nameLines, M + 3, y + 11);
  let ry = y + 11 + nameLines.length * 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  for (const t of [d.recipient.line1, d.recipient.line2]) {
    const ls = doc.splitTextToSize(t, W - 6);
    doc.text(ls, M + 3, ry);
    ry += ls.length * 5;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`CEP ${d.recipient.cep}`, M + 3, ry + 2);
  ry += 8;
  if (d.recipient.phone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Tel: ${d.recipient.phone}`, M + 3, ry);
    ry += 5;
  }
  y = Math.max(ry + 2, y + 50);
  doc.line(M, y, M + W, y);

  // Conteúdo
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Itens: ${d.itemCount}   •   Valor do pedido: ${brl(d.total)}`, M + 3, y + 6);
  doc.text('Recebido por: ______________________________', M + 3, y + 14);
  doc.text('Data: ____/____/______   Doc.: ______________', M + 3, y + 21);
  y += 25;
  doc.line(M, y, M + W, y);

  // Remetente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('REMETENTE', M + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(d.sender.name, M + 3, y + 10);
  doc.text(d.sender.line1, M + 3, y + 14);
  doc.text(`${d.sender.line2} — CEP ${d.sender.cep}`, M + 3, y + 18);

  return doc;
}
