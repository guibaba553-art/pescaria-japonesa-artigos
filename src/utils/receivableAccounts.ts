// Agrupa as entradas de um dia por "conta" (Stone, Mercado Pago, Asaas, Dinheiro),
// mantendo o mesmo detalhamento linha-a-linha da entrada de vendas geral.
import { addMonths, format, parseISO } from "date-fns";
import { getPdvReceivableBreakdown, type ReceivableLine } from "@/utils/pdvReceivableBreakdown";
import { classifyIncomeAccount, INCOME_ACCOUNT_LABEL, type IncomeAccount } from "@/utils/incomeAccounts";

export interface AccountOrderLike {
  id: string;
  created_at: string;
  total_amount: number;
  payment_method?: string | null;
  payment_gateway?: string | null;
  installments?: number | null;
}

export interface AccountReceivable {
  account: IncomeAccount;
  label: string;
  date: string;
  lines: ReceivableLine[];
  totalGross: number;
  totalFee: number;
  totalNet: number;
}

/** Cores (RGB) por conta — usadas no PDF e espelhadas na UI. */
export const ACCOUNT_PDF_COLOR: Record<IncomeAccount, [number, number, number]> = {
  stone: [16, 185, 129], // verde
  asaas: [30, 58, 138], // azul escuro
  mercadopago: [56, 189, 248], // azul claro
  cash: [6, 78, 59], // verde escuro
};

const totals = (lines: ReceivableLine[]) => ({
  totalGross: lines.reduce((s, l) => s + l.gross, 0),
  totalFee: lines.reduce((s, l) => s + l.fee, 0),
  totalNet: lines.reduce((s, l) => s + l.net, 0),
});

/**
 * Parcelas de uma venda do site: a 1ª entra na data da venda e as demais
 * no mesmo dia dos meses seguintes (padrão Asaas/Mercado Pago).
 * Centavos que sobram na divisão vão para a última parcela.
 */
function siteInstallments(o: AccountOrderLike): { date: Date; amount: number }[] {
  const total = Number(o.total_amount || 0);
  const n = Math.max(1, Math.floor(Number(o.installments) || 1));
  const saleDate = parseISO(o.created_at);
  const baseCents = Math.floor((total * 100) / n);
  const rest = Math.round(total * 100) - baseCents * n;
  return Array.from({ length: n }, (_, i) => ({
    date: addMonths(saleDate, i),
    amount: (baseCents + (i === n - 1 ? rest : 0)) / 100,
  }));
}

/** Linhas das vendas do site que entram no dia (com parcelamento, sem taxa estimada). */
export function getSiteReceivableLines(date: string, siteOrders: AccountOrderLike[]): ReceivableLine[] {
  const lines: ReceivableLine[] = [];
  for (const o of siteOrders) {
    const parcels = siteInstallments(o);
    parcels.forEach((p, idx) => {
      if (format(p.date, "yyyy-MM-dd") !== date) return;
      lines.push({
        orderId: o.id,
        saleDate: o.created_at,
        paymentMethod: o.payment_method || "—",
        parcelIndex: idx + 1,
        parcelCount: parcels.length,
        gross: p.amount,
        feeRate: 0,
        fee: 0,
        net: p.amount,
      });
    });
  }
  return lines.sort((a, b) => {
    const d = a.saleDate.localeCompare(b.saleDate);
    return d !== 0 ? d : a.parcelIndex - b.parcelIndex;
  });
}

/**
 * Divide a entrada do dia em uma "entrada de vendas" por conta.
 * Só retorna contas que tiveram movimento.
 */
export function buildAccountReceivables(
  date: string,
  pdvOrders: AccountOrderLike[],
  siteOrders: AccountOrderLike[],
): AccountReceivable[] {
  const byAccount = new Map<IncomeAccount, ReceivableLine[]>();
  const push = (account: IncomeAccount, line: ReceivableLine) => {
    const cur = byAccount.get(account) ?? [];
    cur.push(line);
    byAccount.set(account, cur);
  };

  const pdvIndex = new Map(pdvOrders.map(o => [o.id, o]));
  for (const line of getPdvReceivableBreakdown(date, pdvOrders).lines) {
    const order = pdvIndex.get(line.orderId);
    push(classifyIncomeAccount({ source: "pdv", payment_method: line.paymentMethod ?? order?.payment_method }), line);
  }

  const siteIndex = new Map(siteOrders.map(o => [o.id, o]));
  for (const line of getSiteReceivableLines(date, siteOrders)) {
    const order = siteIndex.get(line.orderId);
    push(
      classifyIncomeAccount({
        source: "site",
        payment_method: order?.payment_method,
        payment_gateway: order?.payment_gateway,
      }),
      line,
    );
  }

  const order: IncomeAccount[] = ["stone", "mercadopago", "asaas", "cash"];
  return order
    .filter(a => (byAccount.get(a)?.length ?? 0) > 0)
    .map(a => {
      const lines = byAccount.get(a)!;
      return { account: a, label: INCOME_ACCOUNT_LABEL[a], date, lines, ...totals(lines) };
    });
}
