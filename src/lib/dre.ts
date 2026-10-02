// DRE gerencial simplificada para empresa do Simples Nacional (comércio).
//
// (+) Receita Bruta = vendas de mercadorias + fretes cobrados
// (−) Devoluções
// (−) Simples Nacional (alíquota efetiva × receita bruta)
// (=) Receita Líquida
// (−) CMV (quantidade × custo de cada item vendido)
// (=) Lucro Bruto
// (−) Despesas com vendas (taxas de cartão/PIX + frete pago + marketing)
// (−) Despesas administrativas (aluguel, salários, contador, outros)
// (−) Despesas financeiras (financiamento, juros)
// (=) Resultado Líquido
//
// Compra de mercadoria NÃO é despesa: vira estoque e só entra no resultado
// pelo CMV quando é vendida. O DAS pago também não entra de novo, porque o
// imposto já é descontado sobre a receita do período.

export interface DREExpense {
  id: string;
  type: string;
  category: string;
  amount: number;
  expense_date: string;
  end_date: string | null;
}
export interface DREOverride {
  expense_id: string;
  year_month: string;
  amount: number | null;
  skipped: boolean;
}

export const INVENTORY_CATEGORIES = ['mercadoria'];
export const TAX_CATEGORIES = ['impostos', 'imposto', 'simples nacional', 'das'];
export const SALES_CATEGORIES = ['frete', 'marketing', 'publicidade', 'embalagem', 'embalagens'];
export const FINANCIAL_CATEGORIES = ['financiamento', 'juros', 'empréstimo', 'emprestimo', 'tarifas bancárias'];

const norm = (s: string) => (s || '').trim().toLowerCase();
const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

export function expensesInPeriod(
  expenses: DREExpense[],
  overrides: DREOverride[],
  start: string,
  end: string,
): { byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {};
  const add = (c: string, v: number) => { byCategory[c] = (byCategory[c] || 0) + v; };
  const ov = (id: string, ym: string) => overrides.find((o) => o.expense_id === id && o.year_month === ym);

  for (const e of expenses) {
    if (e.type === 'fixed') {
      let [y, m] = start.split('-').map(Number);
      const [ey, em] = end.split('-').map(Number);
      while (y < ey || (y === ey && m <= em)) {
        const ym = `${y}-${String(m).padStart(2, '0')}`;
        const mStart = ymd(y, m, 1);
        const mEnd = ymd(y, m, daysInMonth(y, m));
        const active = e.expense_date <= mEnd && (!e.end_date || e.end_date >= mStart);
        const o = ov(e.id, ym);
        if (active && !o?.skipped) {
          const from = start > mStart ? start : mStart;
          const to = end < mEnd ? end : mEnd;
          const frac = dayDiff(from, to) / daysInMonth(y, m);
          add(e.category, Number(o?.amount ?? e.amount) * frac);
        }
        m++; if (m > 12) { m = 1; y++; }
      }
    } else if (e.expense_date >= start && e.expense_date <= end) {
      const o = ov(e.id, e.expense_date.slice(0, 7));
      if (o?.skipped) continue;
      add(e.category, Number(o?.amount ?? e.amount));
    }
  }
  return { byCategory };
}

export interface DREInput {
  productRevenue: number;
  freightRevenue: number;
  returns: number;
  simplesRate: number; // %
  cmv: number;
  paymentFees: number;
  expensesByCategory: Record<string, number>;
}

export function computeDRE(i: DREInput) {
  const receitaBruta = i.productRevenue + i.freightRevenue;
  const impostos = Math.max(0, receitaBruta - i.returns) * (i.simplesRate / 100);
  const receitaLiquida = receitaBruta - i.returns - impostos;
  const lucroBruto = receitaLiquida - i.cmv;

  let comprasMercadoria = 0, dasPago = 0, freteEtc = 0, adm = 0, fin = 0;
  const admDetail: Record<string, number> = {};
  for (const [cat, v] of Object.entries(i.expensesByCategory)) {
    const c = norm(cat);
    if (INVENTORY_CATEGORIES.includes(c)) comprasMercadoria += v;
    else if (TAX_CATEGORIES.includes(c)) dasPago += v;
    else if (SALES_CATEGORIES.includes(c)) freteEtc += v;
    else if (FINANCIAL_CATEGORIES.includes(c)) fin += v;
    else { adm += v; admDetail[cat] = v; }
  }
  const despesasVendas = i.paymentFees + freteEtc;
  const resultadoLiquido = lucroBruto - despesasVendas - adm - fin;
  const pct = (v: number) => (receitaBruta > 0 ? (v / receitaBruta) * 100 : 0);

  return {
    receitaBruta, productRevenue: i.productRevenue, freightRevenue: i.freightRevenue,
    devolucoes: i.returns, impostos, receitaLiquida, cmv: i.cmv, lucroBruto,
    taxasPagamento: i.paymentFees, freteEtc, despesasVendas,
    despesasAdministrativas: adm, admDetail, despesasFinanceiras: fin,
    resultadoLiquido, comprasMercadoria, dasPago,
    margemBruta: pct(lucroBruto), margemLiquida: pct(resultadoLiquido),
  };
}
export type DREResult = ReturnType<typeof computeDRE>;
