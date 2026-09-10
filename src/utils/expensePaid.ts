export interface PaidOverrideInput {
  overrideId?: string | null;
  paidAt?: string | null;
}

export interface PaidToggleResult {
  /** Identifica se a despesa está marcada como paga. */
  isPaid: boolean;
  /** Ação a ser enviada ao Supabase: update quando já existe override, insert quando não. */
  action: "update" | "insert";
  /** ID do override, presente apenas quando action === "update". */
  overrideId?: string;
  /** Próximo valor de paid_at (ISO string) ou null quando for desmarcar. */
  nextPaidAt: string | null;
}

/**
 * Determina o estado de pagamento e a ação necessária ao alternar.
 * Se já existe um override, atualiza o mesmo registro (toggle).
 * Se não existe, insere um novo override apenas com paid_at preenchido.
 */
export function getPaidToggleAction(
  input: PaidOverrideInput,
  nowIso: string = new Date().toISOString(),
): PaidToggleResult {
  const isPaid = !!input.paidAt;
  const nextPaidAt = isPaid ? null : nowIso;

  if (input.overrideId) {
    return {
      isPaid,
      action: "update",
      overrideId: input.overrideId,
      nextPaidAt,
    };
  }

  return {
    isPaid,
    action: "insert",
    nextPaidAt,
  };
}

/** Retorna true se o override possui paid_at preenchido. */
export function isExpensePaid(paidAt?: string | null): boolean {
  return !!paidAt;
}
