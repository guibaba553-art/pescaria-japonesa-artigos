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

export interface GatewayRefundInfo {
  /** Gateway's refund ID */
  gatewayRefundId: string;
  /** Amount in BRL */
  amount: number;
  /** Status: approved, pending, rejected */
  status: "approved" | "pending" | "rejected";
  /** ISO date string when refund was created */
  createdAt: string;
}

export interface PaymentGateway {
  readonly name: string;
  /** Whether this gateway allows partial refunds */
  readonly supportsPartialRefund: boolean;
  /** Extract the correct payment ID from an order record */
  getPaymentId(order: Record<string, unknown>): string;
  /** Execute a refund via the gateway API */
  createRefund(params: RefundParams): Promise<RefundResult>;
  /** List refunds for a payment via the gateway API */
  listRefunds(paymentId: string): Promise<GatewayRefundInfo[]>;
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

function asaasEnv(): string {
  return Deno.env.get("ASAAS_ENVIRONMENT") === "production"
    ? "api.asaas.com"
    : "api-sandbox.asaas.com";
}

function asaasApiKey(): string | undefined {
  return Deno.env.get("ASAAS_API_KEY");
}

async function asaasFetchPayment(paymentId: string): Promise<Record<string, unknown> | null> {
  const apiKey = asaasApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://${asaasEnv()}/v3/payments/${paymentId}`,
      { method: "GET", headers: { "access_token": apiKey, "Content-Type": "application/json" } },
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

const asaasGateway: PaymentGateway = {
  name: "asaas",
  supportsPartialRefund: true,

  getPaymentId(order: Record<string, unknown>): string {
    const id = (order as any).asaas_payment_id;
    if (!id) throw new Error("Pedido não possui asaas_payment_id");
    return String(id);
  },

  async createRefund(params: RefundParams): Promise<RefundResult> {
    const apiKey = asaasApiKey();
    if (!apiKey) {
      return {
        success: false,
        gatewayRefundId: null,
        status: "rejected",
        errorMessage: "ASAAS_API_KEY não configurada",
      };
    }

    const env = asaasEnv();
    const requestBody: Record<string, unknown> = { value: params.amount };
    if (params.reason) requestBody.description = params.reason;

    // Detecta se é crédito: busca o pagamento para obter billingType e installment
    const payment = await asaasFetchPayment(params.paymentId);
    const billingType = (payment as any)?.billingType as string | undefined;
    const installmentId = (payment as any)?.installment as string | undefined;

    const isCreditCard = billingType === "CREDIT_CARD" && !!installmentId;

    let endpoint: string;
    if (isCreditCard) {
      endpoint = `https://${env}/v3/installments/${installmentId}/refund`;
      console.log(
        `[refundGateway:asaas] POST /v3/installments/${installmentId}/refund (cartão crédito) value=${params.amount}`,
      );
    } else {
      endpoint = `https://${env}/v3/payments/${params.paymentId}/refund`;
      console.log(
        `[refundGateway:asaas] POST /v3/payments/${params.paymentId}/refund value=${params.amount}`,
      );
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "access_token": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

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

    // Para crédito (installment), o refund vem dentro de rawBody.refunds[] ou no status do installment
    // Para PIX/boleto, o id do refund é o próprio payment id e status é o status do payment
    let gatewayRefundId: string;
    let refundStatus: "approved" | "pending" | "rejected";

    if (isCreditCard) {
      const refunds = rawBody?.refunds as any[] | undefined;
      const latestRefund = refunds?.[refunds.length - 1];
      gatewayRefundId = String(latestRefund?.id ?? installmentId ?? "");
      refundStatus = latestRefund?.status === "DONE" ? "approved" : "pending";
    } else {
      gatewayRefundId = String(rawBody?.id ?? "");
      refundStatus = rawBody?.status === "DONE" ? "approved" : "pending";
    }

    return {
      success: true,
      gatewayRefundId,
      status: refundStatus,
      rawResponse: rawBody,
    };
  },

  async listRefunds(paymentId: string): Promise<GatewayRefundInfo[]> {
    const apiKey = asaasApiKey();
    if (!apiKey) return [];

    const env = asaasEnv();
    const refunds: GatewayRefundInfo[] = [];

    try {
      // Buscar refunds do payment (funciona para PIX/boleto)
      const payResponse = await fetch(
        `https://${env}/v3/payments/${paymentId}/refunds`,
        {
          method: "GET",
          headers: { "access_token": apiKey, "Content-Type": "application/json" },
        },
      );

      const payBody = await payResponse.json().catch(() => null);
      console.log(
        `[refundGateway:asaas] GET /v3/payments/${paymentId}/refunds status=${payResponse.status}`,
      );

      if (payResponse.ok) {
        const payRefunds = (payBody?.data ?? []) as any[];
        for (const r of payRefunds) {
          refunds.push({
            gatewayRefundId: String(r.id ?? ""),
            amount: Number(r.value ?? 0),
            status: r.status === "DONE" ? "approved" : r.status === "CANCELLED" ? "rejected" : "pending",
            createdAt: r.dateCreated ?? r.createdDate ?? "",
          });
        }
      }

      // Se for crédito, buscar também refunds do installment
      const payment = await asaasFetchPayment(paymentId);
      const installmentId = (payment as any)?.installment as string | undefined;

      if (installmentId) {
        const insResponse = await fetch(
          `https://${env}/v3/installments/${installmentId}/refunds`,
          {
            method: "GET",
            headers: { "access_token": apiKey, "Content-Type": "application/json" },
          },
        );

        const insBody = await insResponse.json().catch(() => null);
        console.log(
          `[refundGateway:asaas] GET /v3/installments/${installmentId}/refunds status=${insResponse.status}`,
        );

        if (insResponse.ok) {
          const insRefunds = (insBody?.data ?? []) as any[];
          for (const r of insRefunds) {
            refunds.push({
              gatewayRefundId: String(r.id ?? ""),
              amount: Number(r.value ?? 0),
              status: r.status === "DONE" ? "approved" : r.status === "CANCELLED" ? "rejected" : "pending",
              createdAt: r.dateCreated ?? r.createdDate ?? "",
            });
          }
        }
      }
    } catch (e) {
      console.error(`[refundGateway:asaas] listRefunds error`, e);
    }

    return refunds;
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

  async listRefunds(paymentId: string): Promise<GatewayRefundInfo[]> {
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!accessToken) return [];

    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const rawBody = await response.json().catch(() => null);
      console.log(
        `[refundGateway:mercadopago] GET /v1/payments/${paymentId}/refunds status=${response.status}`,
        rawBody,
      );

      if (!response.ok) return [];

      const refunds = (Array.isArray(rawBody) ? rawBody : rawBody?.results ?? []) as any[];
      return refunds.map((r: any) => ({
        gatewayRefundId: String(r.id ?? ""),
        amount: Number(r.amount ?? 0),
        status: (r.status === "approved") ? "approved" : (r.status === "rejected" || r.status === "cancelled") ? "rejected" : "pending",
        createdAt: r.date_created ?? "",
      }));
    } catch (e) {
      console.error(`[refundGateway:mercadopago] listRefunds error`, e);
      return [];
    }
  },
};

// ── Register ───────────────────────────────────────────────────────────────

gateways["asaas"] = asaasGateway;
gateways["mercadopago"] = mercadopagoGateway;

export { asaasGateway, mercadopagoGateway };
