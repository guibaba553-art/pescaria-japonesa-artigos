import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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

serve(async (req) => {
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
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "MERCADO_PAGO_ACCESS_TOKEN não configurado" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

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

    // Fetch order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, payment_id, total_amount, status, user_id")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order.payment_id) {
      return new Response(
        JSON.stringify({
          error: "Este pedido não possui pagamento online para estornar",
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
    const orderTotal = Number(order.total_amount);
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
    if (refundAmount > remaining + 0.01) {
      return new Response(
        JSON.stringify({
          error: `Valor solicitado (${refundAmount}) excede valor disponível (${remaining})`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[refund-payment] Estornando R$ ${refundAmount} do pagamento ${order.payment_id} (pedido ${orderId})`,
    );

    // Call Mercado Pago refund API
    const isPartial = Math.abs(refundAmount - orderTotal) > 0.01 ||
      alreadyRefunded > 0;
    const idempotencyKey = `refund-${orderId}-${Date.now()}`;

    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${order.payment_id}/refunds`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        // Para estorno total, MP aceita body vazio. Para parcial, exige amount.
        body: isPartial ? JSON.stringify({ amount: refundAmount }) : "{}",
      },
    );

    const mpData = await mpResponse.json();
    console.log(
      `[refund-payment] MP response status=${mpResponse.status}`,
      mpData,
    );

    if (!mpResponse.ok) {
      // Log failed attempt
      await supabase.from("payment_refunds").insert({
        order_id: orderId,
        payment_id: order.payment_id,
        amount: refundAmount,
        status: "rejected",
        reason: reason ?? null,
        error_message: mpData?.message ||
          mpData?.error ||
          `HTTP ${mpResponse.status}`,
        performed_by: user.id,
      });

      return new Response(
        JSON.stringify({
          error: "Mercado Pago rejeitou o estorno",
          details: mpData?.message || mpData?.error || "erro desconhecido",
          mp_status: mpResponse.status,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Success - record refund
    const refundStatus = mpData.status === "approved" ? "approved" : "pending";

    await supabase.from("payment_refunds").insert({
      order_id: orderId,
      payment_id: order.payment_id,
      amount: refundAmount,
      mp_refund_id: String(mpData.id),
      status: refundStatus,
      reason: reason ?? null,
      performed_by: user.id,
    });

    // Optionally send email to customer
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(
        order.user_id as string,
      );
      const recipientEmail = userData?.user?.email;
      if (recipientEmail) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", order.user_id)
          .maybeSingle();

        const customerName = profile?.full_name?.split(" ")[0] || undefined;
        const totalAmount = `R$ ${
          refundAmount.toFixed(2).replace(".", ",")
        }`;
        const orderNumber = orderId.slice(0, 8).toUpperCase();

        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "order-cancelled", // reaproveita template (info de cancelamento/estorno)
            recipientEmail,
            idempotencyKey: `refund-${orderId}-${mpData.id}`,
            templateData: {
              customerName,
              orderNumber,
              totalAmount,
              paymentMethod: "Mercado Pago (estornado)",
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
        refundId: mpData.id,
        amount: refundAmount,
        status: refundStatus,
        message: refundStatus === "approved"
          ? "Estorno aprovado pelo Mercado Pago"
          : "Estorno em processamento",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[refund-payment] error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
