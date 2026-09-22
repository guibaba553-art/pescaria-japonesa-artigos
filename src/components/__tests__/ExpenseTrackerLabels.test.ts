import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("rótulos financeiros", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../ExpenseTracker.tsx"),
    "utf-8",
  );

  it("chama o total diário de Caixa", () => {
    expect(source).toContain(">Caixa</div>");
    expect(source).not.toContain(">Saldo</div>");
  });

  it("mostra também o Saldo acumulado na agenda", () => {
    expect(source).toContain(">Saldo</div>");
    expect(source).toContain("accumulatedBalances.get(r.key)");
  });
});