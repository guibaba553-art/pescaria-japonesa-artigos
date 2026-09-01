// Detalha, transação por transação, o que compõe a liquidação do PDV em um dia.
// Usado na tela financeira (conferência com o extrato da maquininha) e no PDF.
import { format, parseISO } from "date-fns";
import { getSettlementSchedule } from "@/utils/pdvSettlement";
import { getCardFeeRate } from "@/utils/cardFees";

export interface ReceivableOrderLike {
  id: string;
  created_at: string;
  total_amount: number;
  payment_method?: string | null;
  installments?: number | null;
}

export interface ReceivableLine {
  orderId: string;
  saleDate: string; // ISO da venda
  paymentMethod: string;
  parcelIndex: number;
  parcelCount: number;
  gross: number;
  feeRate: number;
  fee: number;
  net: number;
}

export interface ReceivableBreakdown {
  date: string; // yyyy-MM-dd
  lines: ReceivableLine[];
  totalGross: number;
  totalFee: number;
  totalNet: number;
}

/** Retorna todas as parcelas/vendas do PDV que liquidam exatamente em `date`. */
export function getPdvReceivableBreakdown(
  date: string,
  orders: ReceivableOrderLike[],
): ReceivableBreakdown {
  const lines: ReceivableLine[] = [];

  for (const o of orders) {
    const schedule = getSettlementSchedule(
      parseISO(o.created_at),
      o.payment_method,
      Number(o.total_amount || 0),
      o.installments ?? 1,
    );
    const feeRate = getCardFeeRate(o.payment_method, o.installments ?? 1);
    schedule.forEach((p, idx) => {
      if (format(p.date, "yyyy-MM-dd") !== date) return;
      const fee = p.amount * feeRate;
      lines.push({
        orderId: o.id,
        saleDate: o.created_at,
        paymentMethod: o.payment_method || "—",
        parcelIndex: idx + 1,
        parcelCount: schedule.length,
        gross: p.amount,
        feeRate,
        fee,
        net: p.amount - fee,
      });
    });
  }

  lines.sort((a, b) => {
    const d = a.saleDate.localeCompare(b.saleDate);
    return d !== 0 ? d : a.parcelIndex - b.parcelIndex;
  });

  return {
    date,
    lines,
    totalGross: lines.reduce((s, l) => s + l.gross, 0),
    totalFee: lines.reduce((s, l) => s + l.fee, 0),
    totalNet: lines.reduce((s, l) => s + l.net, 0),
  };
}
