// Calcula a data em que o valor de uma venda do PDV entra no caixa,
// conforme o método de pagamento:
//   - PIX, Dinheiro: mesmo dia (inclui fim de semana e feriado)
//   - Débito: D+1 (pula fim de semana e feriado)
//   - Crédito: mesmo dia do mês seguinte (pula fim de semana e feriado)
import { addDays, addMonths } from "date-fns";

// ---------- Feriados nacionais BR ----------
// Calcula a Páscoa (Meeus/Jones/Butcher) e deriva feriados móveis.
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const holidayCache = new Map<number, Set<string>>();

function getHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const set = new Set<string>();
  // Fixos nacionais
  set.add(`${year}-01-01`); // Confraternização
  set.add(`${year}-04-21`); // Tiradentes
  set.add(`${year}-05-01`); // Trabalho
  set.add(`${year}-09-07`); // Independência
  set.add(`${year}-10-12`); // N. S. Aparecida
  set.add(`${year}-11-02`); // Finados
  set.add(`${year}-11-15`); // Proclamação
  set.add(`${year}-12-25`); // Natal
  // Móveis
  const easter = easterSunday(year);
  set.add(ymd(addDays(easter, -48))); // Carnaval seg
  set.add(ymd(addDays(easter, -47))); // Carnaval ter
  set.add(ymd(addDays(easter, -2))); // Sexta-feira Santa
  set.add(ymd(addDays(easter, 60))); // Corpus Christi
  holidayCache.set(year, set);
  return set;
}

export function isBusinessDay(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !getHolidays(d.getFullYear()).has(ymd(d));
}

function nextBusinessDay(d: Date): Date {
  let cur = d;
  while (!isBusinessDay(cur)) cur = addDays(cur, 1);
  return cur;
}

export type SettlementMethod = "cash" | "pix" | "debit" | "credit" | "other";

export function normalizePaymentMethod(raw?: string | null): SettlementMethod {
  const s = (raw || "").toLowerCase().trim();
  if (!s) return "other";
  if (s.includes("pix")) return "pix";
  if (s.includes("dinheiro") || s === "cash" || s.includes("especie") || s.includes("espécie")) return "cash";
  if (s.includes("debit") || s.includes("débit")) return "debit";
  if (s.includes("credit") || s.includes("créd")) return "credit";
  return "other";
}

/**
 * Retorna a data prevista de entrada no caixa para a venda.
 * - pix/dinheiro/outros: mesmo dia
 * - débito: D+1 útil
 * - crédito: mesmo dia do mês seguinte, próximo dia útil
 */
export function getSettlementDate(orderDate: Date, paymentMethod?: string | null): Date {
  const method = normalizePaymentMethod(paymentMethod);
  const base = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());
  switch (method) {
    case "credit":
      return nextBusinessDay(addMonths(base, 1));
    case "debit":
      return nextBusinessDay(addDays(base, 1));
    case "pix":
    case "cash":
    case "other":
    default:
      return base;
  }
}

/**
 * Retorna a agenda de recebimentos (uma entrada por parcela).
 * - Crédito Nx: N parcelas, uma por mês a partir de orderDate + 1 mês,
 *   cada uma em dia útil. Valor = total / N (última parcela ajusta centavos).
 * - Demais métodos: 1 única entrada na data de settlement padrão.
 */
export function getSettlementSchedule(
  orderDate: Date,
  paymentMethod: string | null | undefined,
  total: number,
  installments: number = 1,
): Array<{ date: Date; amount: number }> {
  const method = normalizePaymentMethod(paymentMethod);
  const base = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());
  const n = Math.max(1, Math.floor(installments || 1));

  if (method !== "credit" || n <= 1) {
    return [{ date: getSettlementDate(orderDate, paymentMethod), amount: total }];
  }

  const cents = Math.round(total * 100);
  const per = Math.floor(cents / n);
  const remainder = cents - per * n;
  const schedule: Array<{ date: Date; amount: number }> = [];
  for (let i = 1; i <= n; i++) {
    const d = nextBusinessDay(addMonths(base, i));
    const parcelCents = per + (i === n ? remainder : 0);
    schedule.push({ date: d, amount: parcelCents / 100 });
  }
  return schedule;
}

