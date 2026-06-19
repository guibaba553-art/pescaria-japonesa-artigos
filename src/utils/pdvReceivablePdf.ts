import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getSettlementSchedule } from "@/utils/pdvSettlement";
import { getCardFeeRate } from "@/utils/cardFees";

interface OrderLike {
  id: string;
  created_at: string;
  total_amount: number;
  payment_method?: string | null;
  installments?: number | null;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Gera um PDF "bem visual" listando todas as vendas do PDV cuja liquidação
 * (ou parcela) cai exatamente no dia `receivableDate` (yyyy-MM-dd).
 */
export function generatePdvReceivablePdf(
  receivableDate: string, // yyyy-MM-dd
  pdvOrders: OrderLike[],
) {
  const matches: Array<{
    order: OrderLike;
    parcelIndex: number;
    parcelCount: number;
    parcelAmount: number;
  }> = [];

  for (const o of pdvOrders) {
    const orderDate = parseISO(o.created_at);
    const schedule = getSettlementSchedule(
      orderDate,
      o.payment_method,
      o.total_amount,
      o.installments ?? 1,
    );
    schedule.forEach((p, idx) => {
      if (format(p.date, "yyyy-MM-dd") === receivableDate) {
        matches.push({
          order: o,
          parcelIndex: idx + 1,
          parcelCount: schedule.length,
          parcelAmount: p.amount,
        });
      }
    });
  }

  matches.sort((a, b) => a.order.created_at.localeCompare(b.order.created_at));

  const total = matches.reduce((s, m) => s + m.parcelAmount, 0);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // ===== Cabeçalho =====
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 0, pageWidth, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Entrada de vendas — PDV", margin, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(
    `Liquidação em ${format(parseISO(receivableDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`,
    margin,
    62,
  );
  doc.text(
    `Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`,
    margin,
    78,
  );

  // ===== Cards de resumo =====
  const cardsY = 110;
  const cardW = (pageWidth - margin * 2 - 20) / 2;
  const drawCard = (x: number, label: string, value: string, color: [number, number, number]) => {
    doc.setDrawColor(230);
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(x, cardsY, cardW, 60, 6, 6, "FD");
    doc.setTextColor(107, 114, 128);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(label.toUpperCase(), x + 14, cardsY + 20);
    doc.setTextColor(...color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(value, x + 14, cardsY + 46);
  };
  drawCard(margin, "Valor a receber", fmtBRL(total), [16, 185, 129]);
  drawCard(margin + cardW + 20, "Vendas / parcelas", String(matches.length), [37, 99, 235]);

  // ===== Tabela =====
  autoTable(doc, {
    startY: cardsY + 80,
    head: [["#", "Data da venda", "Pagamento", "Parcela", "Total da venda", "Valor a receber"]],
    body: matches.map((m, i) => [
      String(i + 1),
      format(parseISO(m.order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      m.order.payment_method || "—",
      m.parcelCount > 1 ? `${m.parcelIndex}/${m.parcelCount}` : "à vista",
      fmtBRL(Number(m.order.total_amount)),
      fmtBRL(m.parcelAmount),
    ]),
    foot: [["", "", "", "", "TOTAL", fmtBRL(total)]],
    theme: "striped",
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [16, 185, 129],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 10,
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 24, 39],
      fontStyle: "bold",
      fontSize: 11,
    },
    bodyStyles: { fontSize: 9, textColor: [31, 41, 55] },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { halign: "center", cellWidth: 30 },
      3: { halign: "center" },
      4: { halign: "right" },
      5: { halign: "right", fontStyle: "bold", textColor: [16, 185, 129] },
    },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${doc.getNumberOfPages()} • Japa Pesca`,
        pageWidth / 2,
        pageHeight - 16,
        { align: "center" },
      );
    },
  });

  doc.save(`entrada-pdv-${receivableDate}.pdf`);
}
