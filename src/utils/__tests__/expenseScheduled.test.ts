import { describe, it, expect } from "vitest";
import {
  getExpenseStatus,
  shouldPromoteToPaid,
  getScheduleToggleAction,
  todayIso,
} from "@/utils/expenseScheduled";

describe("expenseScheduled", () => {
  it("retorna pending sem agendamento nem pagamento", () => {
    expect(getExpenseStatus({}, "2026-09-10")).toBe("pending");
  });

  it("retorna scheduled quando a data ainda não chegou", () => {
    expect(getExpenseStatus({ scheduledAt: "2026-09-20" }, "2026-09-10")).toBe("scheduled");
  });

  it("vira paid quando chega o dia agendado", () => {
    expect(getExpenseStatus({ scheduledAt: "2026-09-10" }, "2026-09-10")).toBe("paid");
    expect(getExpenseStatus({ scheduledAt: "2026-09-01" }, "2026-09-10")).toBe("paid");
  });

  it("paid_at tem prioridade", () => {
    expect(getExpenseStatus({ paidAt: "2026-09-05T10:00:00Z", scheduledAt: "2026-09-30" }, "2026-09-10")).toBe("paid");
  });

  it("promove agendamento vencido", () => {
    expect(shouldPromoteToPaid({ scheduledAt: "2026-09-09" }, "2026-09-10")).toBe(true);
    expect(shouldPromoteToPaid({ scheduledAt: "2026-09-11" }, "2026-09-10")).toBe(false);
    expect(shouldPromoteToPaid({ paidAt: "x", scheduledAt: "2026-09-01" }, "2026-09-10")).toBe(false);
  });

  it("alterna agendamento", () => {
    expect(getScheduleToggleAction({ overrideId: "a", scheduledAt: null, date: "2026-09-20" })).toEqual({
      action: "update",
      overrideId: "a",
      nextScheduledAt: "2026-09-20",
    });
    expect(getScheduleToggleAction({ overrideId: "a", scheduledAt: "2026-09-20", date: "2026-09-20" })).toEqual({
      action: "update",
      overrideId: "a",
      nextScheduledAt: null,
    });
    expect(getScheduleToggleAction({ date: "2026-09-20" })).toEqual({
      action: "insert",
      nextScheduledAt: null === null ? "2026-09-20" : null,
    });
  });

  it("todayIso usa data local", () => {
    expect(todayIso(new Date(2026, 8, 3))).toBe("2026-09-03");
  });
});
