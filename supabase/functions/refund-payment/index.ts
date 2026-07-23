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
  amount: z.number().positive().optional(), // se omitido, estorna total
  reason: z.string().max(500).optional(),
});

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

    // Validate user (admin only)
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );
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
        JSON.stringify({ error: "Apenas administradores podem estornar" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate body
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { orderId, amount, reason } = parsed.data;

    // Fetch order with payment fields
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        "id, payment_id, asaas_payment_id, payment_gateway, payment_method, total_amount, status, user_id",
      )
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve gateway
    const gatewayName = (order as any).payment_gateway;
    if (!gatewayName) {
      return new Response(
        JSON.stringify({
          error: "Este pedido não possui gateway de pagamento online",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let gateway;
    try {
      gateway = getGateway(gatewayName);
    } catch {
      return new Response(
        JSON.stringify({
          error: `Gateway "${gatewayName}" não suporta reembolso pela API`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Resolve payment ID from the order
    let paymentId: string;
    try {
      paymentId = gateway.getPaymentId(order as Record<string, unknown>);
    } catch (e: any) {
      return new Response(
        JSON.stringify({
          error: e?.message ?? "Pedido não possui ID de pagamento no gateway",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if already fully refunded
    const { data: existingRefunds } = await supabase
      .from("payment_refunds")
      .select("amount, status")
      .eq("order_id", orderId)
      .eq("status", "approved");

    const alreadyRefunded = (existingRefunds ?? []).reduce(
      (sum, r) => sum + Number(r.amount),
      0,
    );
    const orderTotal = Number((order as any).total_amount);
    const remaining = orderTotal - alreadyRefunded;

    if (remaining <= 0.01) {
      return new Response(
        JSON.stringify({
          error: "Pedido já totalmente estornado",
          alreadyRefunded,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const refundAmount = amount ?? remaining;

    // Validate partial refund support
    const isFullRefund = Math.abs(refundAmount - orderTotal) <= 0.01 &&
      alreadyRefunded <= 0.01;
    if (!isFullRefund && !gateway.supportsPartialRefund) {
      return new Response(
        JSON.stringify({
          error:
            `Gateway "${gatewayName}" não suporta reembolso parcial. O valor total do pedido (R$ ${orderTotal.toFixed(2)}) deve ser estornado.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (refundAmount > remaining + 0.01) {
      return new Response(
        JSON.stringify({
          error:
            `Valor solicitado (${refundAmount}) excede valor disponível (${remaining})`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[refund-payment] Estornando R$ ${refundAmount} via ${gatewayName} (paymentId=${paymentId}, pedido=${orderId})`,
    );

    // Execute refund via gateway abstraction
    const idempotencyKey = `refund-${orderId}-${Date.now()}`;
    const refundParams: RefundParams = {
      paymentId,
      amount: refundAmount,
      isFullRefund,
      reason,
      idempotencyKey,
    };

    const result = await gateway.createRefund(refundParams);

    // Record refund in payment_refunds
    const refundRecord = {
      order_id: orderId,
      payment_id: paymentId,
      amount: refundAmount,
      gateway: gatewayName,
      gateway_refund_id: result.gatewayRefundId,
      gateway_response: result.rawResponse ?? null,
      status: result.status === "approved" ? "approved" : result.status === "rejected" ? "rejected" : "pending",
      reason: reason ?? null,
      error_message: result.errorMessage ?? null,
      performed_by: user.id,
    };

    await supabase.from("payment_refunds").insert(refundRecord);

    const newRefundedTotal = alreadyRefunded + refundAmount;
    const fullRefundComplete = Math.abs(newRefundedTotal - orderTotal) <= 0.01;

    const orderUpdate: Record<string, unknown> = {
      refunded_amount: newRefundedTotal,
      updated_at: new Date().toISOString(),
    };

    if (fullRefundComplete && order.status !== 'cancelado' && order.status !== 'devolvido') {
      orderUpdate.status = 'cancelado';
      orderUpdate.cancellation_reason = 'estorno_total';
    }

    await supabase.from("orders").update(orderUpdate).eq("id", orderId);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Gateway rejeitou o estorno",
          details: result.errorMessage ?? "erro desconhecido",
          gateway: gatewayName,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Success — optionally send email to customer
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
        const totalAmount = `R$ ${
          refundAmount.toFixed(2).replace(".", ",")
        }`;
        const orderNumber = orderId.slice(0, 8).toUpperCase();

        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "order-cancelled",
            recipientEmail,
            idempotencyKey: `refund-email-${orderId}-${result.gatewayRefundId}`,
            templateData: {
              customerName,
              orderNumber,
              totalAmount,
              paymentMethod: gatewayName === "mercadopago"
                ? "Mercado Pago (estornado)"
                : `${gatewayName} (estornado)`,
            },
          },
        });
      }
    } catch (emailErr) {
      console.error("[refund-payment] email failed", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        refundId: result.gatewayRefundId,
        gateway: gatewayName,
        amount: refundAmount,
        status: result.status,
        message: result.status === "approved"
          ? "Estorno aprovado pelo gateway"
          : "Estorno em processamento",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[refund-payment] error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

serve(handleRequest);
