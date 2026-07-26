import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getGateway } from "../_shared/refundGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  orderId: z.string().uuid("orderId inválido"),
});

async function handleRequest(req: Request): Promise<Response> {
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
    const { orderId } = parsed.data;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, payment_id, asaas_payment_id, payment_gateway, payment_method, total_amount, status, user_id")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gatewayName = (order as any).payment_gateway;
    if (!gatewayName) {
      return new Response(
        JSON.stringify({ error: "Pedido sem gateway de pagamento" }),
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
        JSON.stringify({ error: `Gateway "${gatewayName}" não suporta consulta de reembolso` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let paymentId: string;
    try {
      paymentId = gateway.getPaymentId(order as Record<string, unknown>);
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: e?.message ?? "Pedido não possui ID de pagamento" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`[check-order-refund] Consultando gateway ${gatewayName} paymentId=${paymentId}`);

    const gatewayRefunds = await gateway.listRefunds(paymentId);

    if (gatewayRefunds.length === 0) {
      return new Response(
        JSON.stringify({ found: false, message: "Nenhum reembolso encontrado no gateway" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const approvedRefunds = gatewayRefunds.filter((r) => r.status === "approved");
    const pendingRefunds = gatewayRefunds.filter((r) => r.status === "pending");

    const totalApproved = approvedRefunds.reduce((sum, r) => sum + r.amount, 0);
    const totalPending = pendingRefunds.reduce((sum, r) => sum + r.amount, 0);

    // Sync approved refunds to payment_refunds if not already there
    for (const refund of approvedRefunds) {
      const { data: existing } = await supabase
        .from("payment_refunds")
        .select("id")
        .eq("gateway_refund_id", refund.gatewayRefundId)
        .maybeSingle();

      if (!existing) {
        await supabase.from("payment_refunds").insert({
          order_id: orderId,
          payment_id: paymentId,
          amount: refund.amount,
          gateway: gatewayName,
          gateway_refund_id: refund.gatewayRefundId,
          status: "approved",
          performed_by: user.id,
        });
      }
    }

    // Update order refunded_amount if needed
    const { data: allApproved } = await supabase
      .from("payment_refunds")
      .select("amount")
      .eq("order_id", orderId)
      .eq("status", "approved");

    const dbTotalApproved = (allApproved ?? []).reduce((sum, r: any) => sum + Number(r.amount), 0);
    const orderTotal = Number((order as any).total_amount);
    const fullRefundComplete = Math.abs(dbTotalApproved - orderTotal) <= 0.01;

    const orderUpdate: Record<string, unknown> = {
      refunded_amount: dbTotalApproved,
      updated_at: new Date().toISOString(),
    };

    if (fullRefundComplete && order.status !== 'cancelado' && order.status !== 'devolvido') {
      orderUpdate.status = 'reembolsado';
      orderUpdate.cancellation_reason = 'estorno_total';
    }

    await supabase.from("orders").update(orderUpdate).eq("id", orderId);

    const refundSummary = approvedRefunds.map((r) => ({
      gatewayRefundId: r.gatewayRefundId,
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt,
    }));

    return new Response(
      JSON.stringify({
        found: true,
        totalApproved,
        totalPending,
        refunds: refundSummary,
        fullRefundComplete,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[check-order-refund] error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

serve(handleRequest);
