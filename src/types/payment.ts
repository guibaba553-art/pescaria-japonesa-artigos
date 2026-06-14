/**
 * Centralized payment types shared across the application.
 * Unifies duplicated interfaces from CheckoutEntrega.tsx, MyPaymentMethods.tsx,
 * and CreditCardForm.tsx.
 */

export interface SavedMethod {
  id: string;
  payment_method: string;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: string | null;
  card_exp_year: string | null;
  cardholder_name: string | null;
  is_default: boolean;
  asaas_credit_card_token: string | null;
  last_used_at: string | null;
}

export interface PaymentOrder {
  id: string;
  user_id: string;
  status: string;
  total_amount: number;
  payment_attempts: number;
  pix_attempts: number;
  asaas_payment_id: string | null;
  payment_id: string | null;
  qr_code: string | null;
  qr_code_base64: string | null;
  pix_expiration: string | null;
  payment_gateway: string | null;
}
