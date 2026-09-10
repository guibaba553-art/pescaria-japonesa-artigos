// Agrupa as entradas de um dia por "conta" (Stone, Mercado Pago, Asaas, Dinheiro),
// mantendo o mesmo detalhamento linha-a-linha da entrada de vendas geral.
import { format, parseISO } from "date-fns";
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

/** Linhas das vendas do site que entraram no dia (sem parcelamento/taxa estimada). */
export function getSiteReceivableLines(date: string, siteOrders: AccountOrderLike[]): ReceivableLine[] {
  return siteOrders
    .filter(o => format(parseISO(o.created_at), "yyyy-MM-dd") === date)
    .map(o => {
      const gross = Number(o.total_amount || 0);
      return {
        orderId: o.id,
        saleDate: o.created_at,
        paymentMethod: o.payment_method || "—",
        parcelIndex: 1,
        parcelCount: 1,
        gross,
        feeRate: 0,
        fee: 0,
        net: gross,
      } as ReceivableLine;
    })
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate));
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
