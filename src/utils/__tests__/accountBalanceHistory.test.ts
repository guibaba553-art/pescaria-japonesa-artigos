import { describe, it, expect } from "vitest";
import {
  buildAccountBalanceSeries,
  buildAccumulatedDailyBalances,
  getAccountBalanceAt,
  type BalanceMovement,
  type AccountOpening,
} from "@/utils/accountBalanceHistory";

const openings: AccountOpening[] = [
  { account: "stone", start_date: "2026-09-01", opening_amount: 100 },
  { account: "cash", start_date: "2026-09-01", opening_amount: 50 },
];

const movements: BalanceMovement[] = [
  { date: "2026-09-01", account: "stone", amount: 200 },
  { date: "2026-09-01", account: "stone", amount: -80 },
  { date: "2026-09-02", account: "cash", amount: -20 },
  { date: "2026-09-03", account: "stone", amount: 30 },
];

describe("histórico de saldo por conta", () => {
  it("soma o saldo do dia anterior no dia seguinte, conta por conta", () => {
    const series = buildAccountBalanceSeries({
      openings,
      movements,
      from: "2026-09-01",
      to: "2026-09-03",
    });

    const stone = series.stone;
    expect(stone[0]).toMatchObject({ date: "2026-09-01", opening: 100, income: 200, outcome: 80, closing: 220 });
    expect(stone[1]).toMatchObject({ date: "2026-09-02", opening: 220, closing: 220 });
    expect(stone[2]).toMatchObject({ date: "2026-09-03", opening: 220, income: 30, closing: 250 });

    const cash = series.cash;
    expect(cash[1]).toMatchObject({ opening: 50, outcome: 20, closing: 30 });
    expect(cash[2].closing).toBe(30);
  });

  it("cada conta tem saldo independente", () => {
    const at = getAccountBalanceAt({ openings, movements, date: "2026-09-03" });
    expect(at.stone).toBe(250);
    expect(at.cash).toBe(30);
    expect(at.asaas).toBe(0);
    expect(at.mercadopago).toBe(0);
  });

  it("ignora movimentos antes da data do saldo inicial", () => {
    const at = getAccountBalanceAt({
      openings: [{ account: "stone", start_date: "2026-09-02", opening_amount: 10 }],
      movements,
      date: "2026-09-03",
    });
    expect(at.stone).toBe(40);
  });

  it("sem saldo inicial cadastrado, começa em zero", () => {
    const at = getAccountBalanceAt({ openings: [], movements, date: "2026-09-01" });
    expect(at.stone).toBe(120);
  });

  it("inicia o saldo acumulado no saldo real de hoje e soma o caixa dos próximos dias", () => {
    const balances = buildAccumulatedDailyBalances({
      dailyCash: [
        { date: "2026-09-21", cash: 500 },
        { date: "2026-09-22", cash: 100 },
        { date: "2026-09-23", cash: -50 },
        { date: "2026-09-24", cash: 200 },
      ],
      startDate: "2026-09-22",
      startBalance: 5562.86,
    });

    expect(balances.get("2026-09-21")).toBeUndefined();
    expect(balances.get("2026-09-22")).toBe(5562.86);
    expect(balances.get("2026-09-23")).toBe(5512.86);
    expect(balances.get("2026-09-24")).toBe(5712.86);
  });
});
