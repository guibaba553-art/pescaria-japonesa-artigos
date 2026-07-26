import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getGateway, type RefundParams } from "../_shared/refundGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  orderId: z.string().uuid("orderId inválido"),
  cancellation_reason: z.string().min(1).max(500),
});

const ALLOWED_STATUSES = ["aguardando_pagamento", "em_preparo", "pronto_retirada"];

function mapAsaasStatus(status: string): string {
  switch (status) {
    case "CONFIRMED":
    case "RECEIVED":
      return "approved";
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
      return "pending";
    case "OVERDUE":
      return "expired";
    case "REFUNDED":
    case "REFUND_REQUESTED":
      return "refunded";
    case "CANCELLED":
    case "DELETED":
      return "cancelled";
    default:
      return status.toLowerCase();
  }
}

async function verifyPaymentStatus(
  order: Record<string, unknown>,
  gatewayName: string,
): Promise<{ status: string; data: Record<string, unknown> }> {
  const paymentId = (order as any).payment_id || (order as any).asaas_payment_id;

  if (gatewayName === "asaas") {
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    if (!apiKey) throw new Error("ASAAS_API_KEY não configurada");

    const env = Deno.env.get("ASAAS_ENVIRONMENT") === "production"
      ? "api.asaas.com"
      : "api-sandbox.asaas.com";

    const response = await fetch(
      `https://${env}/v3/payments/${paymentId}`,
      { headers: { "access_token": apiKey, "User-Agent": "JapasPesca/1.0.0" } },
    );

    if (!response.ok) throw new Error(`Asaas retornou ${response.status}`);

    const data = await response.json();
    return { status: mapAsaasStatus(data?.status || ""), data };
  }

  // Mercado Pago
  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if (!accessToken) {
    throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado");
  }

  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    throw new Error(`Mercado Pago retornou ${response.status}`);
  }

  const data = await response.json();
  return { status: data?.status || "", data };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isAdmin = roles?.some((r) => r.role === "admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem cancelar pedidos" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { orderId, cancellation_reason } = parsed.data;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        "id, user_id, status, total_amount, payment_gateway, payment_id, asaas_payment_id, payment_method",
      )
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_STATUSES.includes(order.status)) {
      return new Response(
        JSON.stringify({ error: `Pedido com status "${order.status}" não pode ser cancelado` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let refunded = false;
    let refundAmount = 0;
    let refundError: string | null = null;

    const gatewayName = (order as any).payment_gateway;
    const paymentId = (order as any).payment_id || (order as any).asaas_payment_id;

    if (gatewayName && paymentId) {
      try {
        const { status: paymentStatus } = await verifyPaymentStatus(
          order as Record<string, unknown>,
          gatewayName,
        );

        if (paymentStatus === "approved") {
          const gateway = getGateway(gatewayName);
          const gwPaymentId = gateway.getPaymentId(order as Record<string, unknown>);
          const orderTotal = Number((order as any).total_amount);

          const idempotencyKey = `cancel-${orderId}-${Date.now()}`;
          const refundParams: RefundParams = {
            paymentId: gwPaymentId,
            amount: orderTotal,
            isFullRefund: true,
            reason: `Cancelamento: ${cancellation_reason}`,
            idempotencyKey,
          };

          const result = await gateway.createRefund(refundParams);

          await supabase.from("payment_refunds").insert({
            order_id: orderId,
            payment_id: gwPaymentId,
            amount: orderTotal,
            gateway: gatewayName,
            gateway_refund_id: result.gatewayRefundId,
            gateway_response: result.rawResponse ?? null,
            status: result.status === "approved" ? "approved" : result.status === "rejected" ? "rejected" : "pending",
            reason: `Cancelamento: ${cancellation_reason}`,
            error_message: result.errorMessage ?? null,
            performed_by: user.id,
          });

          if (result.success) {
            refunded = true;
            refundAmount = orderTotal;
          } else {
            refundError = result.errorMessage ?? "Gateway rejeitou o estorno";
          }
        }
      } catch (err: any) {
        console.error("[cancel-order] Erro ao verificar/estornar:", err.message);
        refundError = err.message;
      }
    }

    // Liberar reservas de estoque
    try {
      await supabase.rpc("release_stock_reservation", { p_order_id: orderId });
    } catch (err) {
      console.error("[cancel-order] Erro ao liberar reserva de estoque:", err);
    }

    // Liberar limites de promoção
    try {
      const { data: items } = await supabase
        .from("order_items")
        .select("product_id, variation_id, quantity")
        .eq("order_id", orderId);

      if (items && items.length > 0) {
        await supabase.rpc("release_promo_limits", {
          p_items: items.map((i: any) => ({
            product_id: i.product_id,
            variation_id: i.variation_id,
            quantity: i.quantity,
          })),
        });
      }
    } catch (err) {
      console.error("[cancel-order] Erro ao liberar limites de promoção:", err);
    }

    // Atualizar status do pedido
    const orderUpdate: Record<string, unknown> = {
      status: refunded ? "reembolsado" : "cancelado",
      cancellation_reason,
      updated_at: new Date().toISOString(),
    };
    if (refunded) {
      orderUpdate.refunded_amount = refundAmount;
    }

    const { error: updateErr } = await supabase
      .from("orders")
      .update(orderUpdate)
      .eq("id", orderId);

    if (updateErr) {
      console.error("[cancel-order] Erro ao cancelar pedido:", updateErr);
      return new Response(JSON.stringify({ error: "Erro ao cancelar pedido" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enviar email de cancelamento
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(
        (order as any).user_id as string,
      );
      const recipientEmail = userData?.user?.email;
      if (recipientEmail) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", (order as any).user_id)
          .maybeSingle();

        const customerName = profile?.full_name?.split(" ")[0] || undefined;
        const orderTotal = Number((order as any).total_amount);
        const orderNumber = orderId.slice(0, 8).toUpperCase();
        const paymentMethod = refunded
          ? `${gatewayName === "mercadopago" ? "Mercado Pago" : gatewayName} (estornado)`
          : (order as any).payment_method || "";

        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "order-cancelled",
            recipientEmail,
            idempotencyKey: `cancel-order-email-${orderId}`,
            templateData: {
              customerName,
              orderNumber,
              totalAmount: `R$ ${orderTotal.toFixed(2).replace(".", ",")}`,
              paymentMethod,
            },
          },
        });
      }
    } catch (emailErr) {
      console.error("[cancel-order] email failed", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        refunded,
        refund_amount: refunded ? refundAmount : undefined,
        error: refundError || undefined,
        message: refunded
          ? "Pedido cancelado e pagamento estornado"
          : "Pedido cancelado sem estorno (pagamento não confirmado)",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cancel-order] error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (!Deno.env.get("DENO_TEST")) {
  serve((req) => handleRequest(req));
}
