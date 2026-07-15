/**
 * Gateway-agnostic refund abstraction.
 *
 * Each payment gateway implements `PaymentGateway` and registers itself.
 * The `refund-payment` edge function calls `getGateway(name).createRefund(...)`.
 *
 * To add a new gateway:
 *   1. Implement `PaymentGateway`
 *   2. Add it to the `gateways` record below
 * No other code needs to change.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface RefundParams {
  /** Gateway-specific payment/transaction ID */
  paymentId: string;
  /** Amount in BRL (reais), NOT cents */
  amount: number;
  /** Whether this is a full refund of the original payment. Default true. */
  isFullRefund?: boolean;
  /** Optional reason for the refund */
  reason?: string;
  /** Idempotency key to prevent duplicate refunds */
  idempotencyKey: string;
}

export interface RefundResult {
  success: boolean;
  gatewayRefundId: string | null;
  status: "approved" | "pending" | "rejected";
  errorMessage?: string;
  rawResponse?: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly name: string;
  /** Whether this gateway allows partial refunds */
  readonly supportsPartialRefund: boolean;
  /** Extract the correct payment ID from an order record */
  getPaymentId(order: Record<string, unknown>): string;
  /** Execute a refund via the gateway API */
  createRefund(params: RefundParams): Promise<RefundResult>;
}

// ── Registry ───────────────────────────────────────────────────────────────

const gateways: Record<string, PaymentGateway> = {};

export function getGateway(name: string): PaymentGateway {
  const gw = gateways[name];
  if (!gw) {
    throw new Error(`Gateway "${name}" não suporta reembolso pela API`);
  }
  return gw;
}

// ── Asaas ──────────────────────────────────────────────────────────────────

const asaasGateway: PaymentGateway = {
  name: "asaas",
  supportsPartialRefund: true,

  getPaymentId(order: Record<string, unknown>): string {
    // Asaas stores the payment ID in asaas_payment_id column
    const id = (order as any).asaas_payment_id;
    if (!id) throw new Error("Pedido não possui asaas_payment_id");
    return String(id);
  },

  async createRefund(params: RefundParams): Promise<RefundResult> {
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    if (!apiKey) {
      return {
        success: false,
        gatewayRefundId: null,
        status: "rejected",
        errorMessage: "ASAAS_API_KEY não configurada",
      };
    }

    const env = Deno.env.get("ASAAS_ENVIRONMENT") === "production"
      ? "api.asaas.com"
      : "api-sandbox.asaas.com";

    const requestBody: Record<string, unknown> = {
      value: params.amount,
    };
    if (params.reason) {
      requestBody.description = params.reason;
    }

    console.log(
      `[refundGateway:asaas] POST /v3/payments/${params.paymentId}/refund value=${params.amount}`,
    );

    const response = await fetch(
      `https://${env}/v3/payments/${params.paymentId}/refund`,
      {
        method: "POST",
        headers: {
          "access_token": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const rawBody = await response.json().catch(() => null);
    console.log(
      `[refundGateway:asaas] response status=${response.status}`,
      rawBody,
    );

    if (!response.ok) {
      return {
        success: false,
        gatewayRefundId: null,
        status: "rejected",
        errorMessage: rawBody?.errors?.[0]?.description ??
          rawBody?.error ??
          `HTTP ${response.status}`,
        rawResponse: rawBody,
      };
    }

    // Asaas refund response: { id: "ref_xxx", status: "DONE"|"PENDING", ... }
    const refundStatus = rawBody?.status === "DONE" ? "approved" : "pending";

    return {
      success: true,
      gatewayRefundId: String(rawBody?.id ?? ""),
      status: refundStatus,
      rawResponse: rawBody,
    };
  },
};

// ── Mercado Pago ───────────────────────────────────────────────────────────

const mercadopagoGateway: PaymentGateway = {
  name: "mercadopago",
  supportsPartialRefund: true,

  getPaymentId(order: Record<string, unknown>): string {
    const id = (order as any).payment_id;
    if (!id) throw new Error("Pedido não possui payment_id");
    return String(id);
  },

  async createRefund(params: RefundParams): Promise<RefundResult> {
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!accessToken) {
      return {
        success: false,
        gatewayRefundId: null,
        status: "rejected",
        errorMessage: "MERCADO_PAGO_ACCESS_TOKEN não configurado",
      };
    }

    // Mercado Pago: empty body for full refund, { amount } for partial
    const body = params.isFullRefund !== false
      ? "{}"
      : JSON.stringify({ amount: params.amount });

    console.log(
      `[refundGateway:mercadopago] POST /v1/payments/${params.paymentId}/refunds`,
    );

    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${params.paymentId}/refunds`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": params.idempotencyKey,
        },
        body,
      },
    );

    const rawBody = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        success: false,
        gatewayRefundId: null,
        status: "rejected",
        errorMessage: rawBody?.message ??
          rawBody?.error ??
          `HTTP ${response.status}`,
        rawResponse: rawBody,
      };
    }

    const refundStatus = rawBody?.status === "approved" ? "approved" : "pending";

    return {
      success: true,
      gatewayRefundId: String(rawBody?.id ?? ""),
      status: refundStatus,
      rawResponse: rawBody,
    };
  },
};

// ── Register ───────────────────────────────────────────────────────────────

gateways["asaas"] = asaasGateway;
gateways["mercadopago"] = mercadopagoGateway;

export { asaasGateway, mercadopagoGateway };
