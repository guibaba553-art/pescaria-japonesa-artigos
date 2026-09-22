// Histórico de saldo por conta: o saldo de cada dia parte do saldo do dia
// anterior (nunca zera na virada do dia) e cada conta — Stone, Mercado Pago,
// Asaas e Dinheiro — tem seu próprio saldo, independente das outras.
import { addDays, format, parseISO } from "date-fns";
import type { IncomeAccount } from "@/utils/incomeAccounts";

export const BALANCE_ACCOUNTS: IncomeAccount[] = ["stone", "mercadopago", "asaas", "cash"];

/** Movimento de um dia em uma conta: positivo é entrada, negativo é saída. */
export interface BalanceMovement {
  date: string; // yyyy-MM-dd
  account: IncomeAccount;
  amount: number;
}

/** Saldo inicial informado pelo usuário para uma conta. */
export interface AccountOpening {
  account: IncomeAccount | string;
  start_date: string; // yyyy-MM-dd
  opening_amount: number;
}

export interface BalanceDay {
  date: string;
  opening: number;
  income: number;
  outcome: number;
  closing: number;
}

export type AccountBalanceSeries = Record<IncomeAccount, BalanceDay[]>;
export type AccountBalanceTotals = Record<IncomeAccount, number>;

export interface DailyCash {
  date: string;
  cash: number;
}

const openingFor = (openings: AccountOpening[], account: IncomeAccount) =>
  openings.find(o => o.account === account);

/** Movimentos válidos de uma conta: a partir da data do saldo inicial e até `to`. */
function relevantMovements(
  movements: BalanceMovement[],
  account: IncomeAccount,
  openStart: string | null,
  to: string,
) {
  return movements.filter(
    m => m.account === account && m.date <= to && (!openStart || m.date >= openStart),
  );
}

export function buildAccountBalanceSeries({
  openings,
  movements,
  from,
  to,
}: {
  openings: AccountOpening[];
  movements: BalanceMovement[];
  from: string;
  to: string;
}): AccountBalanceSeries {
  const series = {} as AccountBalanceSeries;

  for (const account of BALANCE_ACCOUNTS) {
    const opening = openingFor(openings, account);
    const openStart = opening?.start_date ?? null;
    const list = relevantMovements(movements, account, openStart, to);

    // Saldo acumulado antes do primeiro dia exibido.
    let running = Number(opening?.opening_amount ?? 0);
    for (const m of list) {
      if (m.date < from) running += m.amount;
    }

    const days: BalanceDay[] = [];
    let cursor = parseISO(from);
    const end = parseISO(to);
    while (cursor <= end) {
      const key = format(cursor, "yyyy-MM-dd");
      const ofDay = list.filter(m => m.date === key);
      const income = ofDay.filter(m => m.amount > 0).reduce((s, m) => s + m.amount, 0);
      const outcome = ofDay.filter(m => m.amount < 0).reduce((s, m) => s - m.amount, 0);
      const openingOfDay = running;
      running = openingOfDay + income - outcome;
      days.push({ date: key, opening: openingOfDay, income, outcome, closing: running });
      cursor = addDays(cursor, 1);
    }

    series[account] = days;
  }

  return series;
}

/** Saldo acumulado de cada conta até (e incluindo) `date`. */
export function getAccountBalanceAt({
  openings,
  movements,
  date,
}: {
  openings: AccountOpening[];
  movements: BalanceMovement[];
  date: string;
}): AccountBalanceTotals {
  const totals = {} as AccountBalanceTotals;
  for (const account of BALANCE_ACCOUNTS) {
    const opening = openingFor(openings, account);
    const list = relevantMovements(movements, account, opening?.start_date ?? null, date);
    totals[account] = list.reduce((s, m) => s + m.amount, Number(opening?.opening_amount ?? 0));
  }
  return totals;
}

/**
 * Projeta o saldo geral a partir de um valor real informado para a data inicial.
 * O caixa da própria data inicial já está contido nesse valor e não é somado novamente.
 */
export function buildAccumulatedDailyBalances({
  dailyCash,
  startDate,
  startBalance,
}: {
  dailyCash: DailyCash[];
  startDate: string;
  startBalance: number;
}) {
  const balances = new Map<string, number>();
  let running = startBalance;

  for (const day of [...dailyCash].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.date < startDate) continue;
    if (day.date > startDate) running += day.cash;
    balances.set(day.date, running);
  }

  return balances;
}
