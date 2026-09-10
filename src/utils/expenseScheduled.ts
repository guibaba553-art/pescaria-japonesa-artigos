export type ExpenseStatus = "pending" | "scheduled" | "paid";

export interface ScheduleState {
  paidAt?: string | null;
  scheduledAt?: string | null; // yyyy-MM-dd
}

/** Data local (yyyy-MM-dd) sem depender de fuso UTC. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Status atual de uma despesa.
 * Um agendamento cuja data já chegou é considerado pago.
 */
export function getExpenseStatus(state: ScheduleState, today: string = todayIso()): ExpenseStatus {
  if (state.paidAt) return "paid";
  if (state.scheduledAt) {
    return state.scheduledAt <= today ? "paid" : "scheduled";
  }
  return "pending";
}

/** True quando o agendamento venceu e deve virar pagamento efetivo. */
export function shouldPromoteToPaid(state: ScheduleState, today: string = todayIso()): boolean {
  return !state.paidAt && !!state.scheduledAt && state.scheduledAt <= today;
}

export interface ScheduleToggleResult {
  action: "update" | "insert";
  overrideId?: string;
  nextScheduledAt: string | null;
}

/** Alterna o agendamento: define a data informada ou limpa quando já agendado. */
export function getScheduleToggleAction(
  input: { overrideId?: string | null; scheduledAt?: string | null; date: string },
): ScheduleToggleResult {
  const nextScheduledAt = input.scheduledAt ? null : input.date;
  if (input.overrideId) {
    return { action: "update", overrideId: input.overrideId, nextScheduledAt };
  }
  return { action: "insert", nextScheduledAt };
}
