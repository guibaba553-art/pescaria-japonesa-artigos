import { describe, it, expect } from "vitest";
import { getPaidToggleAction, isExpensePaid } from "../expensePaid";

describe("expensePaid", () => {
  describe("isExpensePaid", () => {
    it("retorna true quando paid_at está preenchido", () => {
      expect(isExpensePaid("2026-09-10T14:00:00Z")).toBe(true);
    });

    it("retorna false quando paid_at é nulo ou indefinido", () => {
      expect(isExpensePaid(null)).toBe(false);
      expect(isExpensePaid(undefined)).toBe(false);
      expect(isExpensePaid("")).toBe(false);
    });
  });

  describe("getPaidToggleAction", () => {
    const now = "2026-09-10T14:00:00.000Z";

    it("insere novo override quando não existe (marcar como pago)", () => {
      const result = getPaidToggleAction({}, now);
      expect(result.isPaid).toBe(false);
      expect(result.action).toBe("insert");
      expect(result.nextPaidAt).toBe(now);
      expect(result.overrideId).toBeUndefined();
    });

    it("atualiza override existente para pago", () => {
      const result = getPaidToggleAction({ overrideId: "ov-1" }, now);
      expect(result.isPaid).toBe(false);
      expect(result.action).toBe("update");
      expect(result.overrideId).toBe("ov-1");
      expect(result.nextPaidAt).toBe(now);
    });

    it("desmarca override existente como não pago", () => {
      const result = getPaidToggleAction({ overrideId: "ov-1", paidAt: "2026-09-09T10:00:00Z" }, now);
      expect(result.isPaid).toBe(true);
      expect(result.action).toBe("update");
      expect(result.overrideId).toBe("ov-1");
      expect(result.nextPaidAt).toBeNull();
    });

    it("desmarca inserção imaginária (não deve acontecer na UI, mas é seguro)", () => {
      const result = getPaidToggleAction({ paidAt: "2026-09-09T10:00:00Z" }, now);
      expect(result.isPaid).toBe(true);
      expect(result.action).toBe("insert");
      expect(result.nextPaidAt).toBeNull();
    });
  });
});
