// Escada de resolução de e-mail para gateways (spec seção 4, Fluxo C).
// Fonte única server-side — o front-end não envia mais e-mail.

export interface PayerEmailInput {
  /** user.email da sessão autenticada */
  authEmail?: string | null;
  /** !!user.email_confirmed_at */
  authEmailConfirmed?: boolean;
  /** profiles.card_contact_email (digitado em checkout anterior) */
  contactEmail?: string | null;
  /** user.id — compõe o placeholder determinístico */
  userId: string;
}

export function placeholderEmail(userId: string): string {
  return `nao-informado.${userId}@japapesca.com`;
}

function bestRealEmail(input: PayerEmailInput): string | undefined {
  const confirmed = input.authEmailConfirmed && input.authEmail ? input.authEmail.trim() : "";
  if (confirmed) return confirmed;
  const contact = input.contactEmail ? input.contactEmail.trim() : "";
  return contact || undefined;
}

/** Para payloads onde e-mail é OBRIGATÓRIO (MP payer.email, Asaas creditCardHolderInfo). */
export function resolveCardholderEmail(input: PayerEmailInput): string {
  return bestRealEmail(input) ?? placeholderEmail(input.userId);
}

/** Para customer Asaas, onde e-mail é OPCIONAL — ausente deve OMITIR a chave. */
export function resolveOptionalCustomerEmail(input: PayerEmailInput): string | undefined {
  return bestRealEmail(input);
}
