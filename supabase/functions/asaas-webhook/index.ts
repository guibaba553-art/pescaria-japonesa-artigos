import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { handlePaymentConfirmed } from "../_shared/stockHandler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

interface AsaasWebhookPayload {
  event: string;
  payment: {
    id: string;
    externalReference?: string;
    billingType: string;
    value: number;
    netValue: number;
    installmentCount?: number;
    creditCardBrand?: string;
    creditCardNumber?: string;
    creditCardToken?: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    // ── Validate auth token ──────────────────────────────────────────────
    const authToken = req.headers.get("asaas-access-token");
    const expectedToken = Deno.env.get("ASAAS_WEBHOOK_AUTH_TOKEN");

    if (!expectedToken || !authToken || authToken !== expectedToken) {
      console.error("Invalid asaas-access-token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse body ───────────────────────────────────────────────────────
    const rawBody = await req.text();
    const payload: AsaasWebhookPayload = JSON.parse(rawBody);

    const { event, payment } = payload;

    if (!event || !payment?.id) {
      console.error("Missing event or payment.id in webhook payload");
      return new Response(
        JSON.stringify({ error: "Invalid webhook payload" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`Asaas webhook received: ${event}`, { paymentId: payment.id });

    // ── Atomic idempotency check (P04 + P10) ─────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // event_id = payment.id + event type to prevent processing same event twice
    const eventId = `${payment.id}_${event}`;

    // INSERT ... ON CONFLICT DO NOTHING — atomic check+insert (P04)
    // This is done BEFORE processing to ensure idempotency (P10)
    const { error: insertError } = await supabase
      .from("webhook_events")
      .insert({
        event_id: eventId,
        event_type: event,
      });

    if (insertError) {
      // If unique violation (23505), the event was already processed
      if (insertError.code === '23505') {
        console.log(`Event ${eventId} already processed, skipping (unique violation)`);
        return new Response(
          JSON.stringify({ success: true, duplicate: true }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      // For other errors, log but continue processing
      console.error(`Error inserting webhook event ${eventId}:`, insertError);
    }

    // ── Find order ───────────────────────────────────────────────────────
    // Look up by asaas_payment_id OR externalReference
    let order;

    if (payment.externalReference) {
      const { data: byRef } = await supabase
        .from("orders")
        .select("id, status, user_id, total_amount, payment_attempts")
        .eq("id", payment.externalReference)
        .maybeSingle();

      if (byRef) {
        // Verify this order actually has this asaas payment id (or any)
        const { data: verify } = await supabase
          .from("orders")
          .select("id")
          .eq("id", byRef.id)
          .or(`asaas_payment_id.eq.${payment.id},payment_id.eq.${payment.id}`)
          .maybeSingle();

        if (verify) {
          order = byRef;
        }
      }
    }

    // If not found by externalReference, try by payment id
    if (!order) {
      const { data: byPayment } = await supabase
        .from("orders")
        .select("id, status, user_id, total_amount, payment_attempts")
        .eq("asaas_payment_id", payment.id)
        .maybeSingle();

      if (byPayment) {
        order = byPayment;
      }
    }

    if (!order) {
      console.error("Order not found for payment:", payment.id, "externalReference:", payment.externalReference);
      // Accept the webhook anyway to avoid retries — order may have been created later
      return new Response(
        JSON.stringify({ success: true, message: "Order not found, accepted" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const orderId = order.id;
    console.log(`Processing ${event} for order ${orderId}`);

    // ── Event processing ─────────────────────────────────────────────────
    switch (event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_APPROVED_BY_RISK_ANALYSIS": {
        // Only process if order is still awaiting payment
        if (order.status !== "aguardando_pagamento") {
          console.log(`Order ${orderId} already processed (status: ${order.status}), skipping`);
          break;
        }

        await supabase
          .from("orders")
          .update({
            status: "em_preparo",
            payment_method: payment.billingType === "PIX" ? "pix" : "credit_card",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        console.log(`Order ${orderId} updated to em_preparo`);

        // ── Post-payment actions (fire-and-forget) ───────────────────────
        await executePostPaymentActions(supabase, supabaseUrl, supabaseKey, orderId, payment);

        break;
      }

      case "PAYMENT_RECEIVED": {
        // For PIX: payment goes directly to RECEIVED without CONFIRMED —
        // transition the order to em_preparo and run post-payment actions.
        // For card: order was already transitioned by CONFIRMED, just record
        // the received timestamp (~30 days later for reconciliation).
        const now = new Date().toISOString();

        if (order.status === "aguardando_pagamento") {
          // PIX flow: payment received immediately — transition order
          await supabase
            .from("orders")
            .update({
              status: "em_preparo",
              payment_method: "pix",
              updated_at: now,
            })
            .eq("id", orderId);

          console.log(`Order ${orderId} updated to em_preparo (PIX received)`);

          // Execute post-payment actions
          await executePostPaymentActions(supabase, supabaseUrl, supabaseKey, orderId, payment);
        }

        // Update payment_received_at for financial reconciliation
        await supabase
          .from("orders")
          .update({ payment_received_at: now })
          .eq("id", orderId);

        console.log(`Order ${orderId} payment_received_at updated`);

        break;
      }

      case "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED": {
        const now = new Date().toISOString();

        await supabase
          .from("orders")
          .update({
            payment_attempts: ((order as any).payment_attempts ?? 0) + 1,
            last_payment_attempt_at: now,
            updated_at: now,
          })
          .eq("id", orderId);

        console.log(`Order ${orderId} card capture refused, payment_attempts incremented`);

        break;
      }

      case "PAYMENT_REFUNDED": {
        const now = new Date().toISOString();

        const { data: refunds } = await supabase
          .from("payment_refunds")
          .select("amount")
          .eq("order_id", orderId)
          .eq("status", "approved");

        const totalRefunded = (refunds ?? []).reduce(
          (sum: number, r: any) => sum + Number(r.amount),
          0,
        );

        const { data: orderData } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("id", orderId)
          .maybeSingle();

        const orderTotal = Number(orderData?.total_amount ?? order.total_amount);
        const isFullRefund = Math.abs(totalRefunded - orderTotal) <= 0.01;

        const orderUpdate: Record<string, unknown> = {
          refunded_amount: totalRefunded,
          updated_at: now,
        };
        if (isFullRefund && order.status !== 'cancelado' && order.status !== 'devolvido') {
          orderUpdate.status = 'cancelado';
          orderUpdate.cancellation_reason = 'estorno_total';
        }

        await supabase
          .from("orders")
          .update(orderUpdate)
          .eq("id", orderId);

        // Restore stock reservation
        try {
          await supabase.rpc("release_stock_reservation", { p_order_id: orderId });
        } catch (_) {
          /* non-fatal */
        }

        console.log(`Order ${orderId} refunded: R$ ${totalRefunded} / R$ ${orderTotal}`);

        break;
      }

      case "PAYMENT_OVERDUE": {
        console.log(`Payment ${payment.id} overdue for order ${orderId} — logging only`);
        break;
      }

      case "PAYMENT_DELETED": {
        console.log(`Payment ${payment.id} deleted for order ${orderId} — logging only`);
        break;
      }

      case "PAYMENT_AWAITING_RISK_ANALYSIS": {
        console.log(`Payment ${payment.id} awaiting risk analysis for order ${orderId} — logging only`);
        break;
      }

      case "PAYMENT_REPROVED_BY_RISK_ANALYSIS": {
        const now = new Date().toISOString();

        await supabase
          .from("orders")
          .update({
            payment_attempts: ((order as any).payment_attempts ?? 0) + 1,
            last_payment_attempt_at: now,
            updated_at: now,
          })
          .eq("id", orderId);

        console.log(`Order ${orderId} risk analysis reproved, payment_attempts incremented`);

        break;
      }

      default: {
        console.log(`Unhandled Asaas event: ${event} for payment ${payment.id}`);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("asaas-webhook error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Execute all post-payment actions after a payment is confirmed:
 * 1. Release stock reservation + subtract real stock (via shared handler)
 * 2. Send transactional email for payment confirmation
 *
 * Errors are logged but never bubble up — the webhook must respond 200 quickly.
 */
async function executePostPaymentActions(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  orderId: string,
  payment: AsaasWebhookPayload["payment"],
): Promise<void> {
  // 1. Release stock reservation + subtract real stock via shared handler
  await handlePaymentConfirmed(supabase, supabaseUrl, supabaseKey, orderId);

  // 2. Send transactional email for payment confirmation
  try {
    const { data: order } = await supabase
      .from("orders")
      .select("user_id, total_amount")
      .eq("id", orderId)
      .single();

    if (order?.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", order.user_id)
        .maybeSingle();

      const { data: { user: userInfo } } = await supabase.auth.admin.getUserById(order.user_id);
      const recipientEmail = userInfo?.email;

      if (recipientEmail) {
        const formatBRL = (n: number) =>
          new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(Number(n) || 0);

        const methodLabel: Record<string, string> = {
          PIX: "PIX",
          CREDIT_CARD: "Cartão de crédito",
          BOLETO: "Boleto",
          DEBIT_CARD: "Cartão de débito",
        };

        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "order-confirmation",
            recipientEmail,
            idempotencyKey: `order-confirmation-${orderId}-${payment.id}`,
            templateData: {
              customerName: profile?.full_name?.split(" ")[0] ?? null,
              orderNumber: String(orderId).slice(0, 8).toUpperCase(),
              totalAmount: formatBRL(Number(order.total_amount)),
              paymentMethod: methodLabel[payment.billingType] || payment.billingType,
              deliveryType: "Entrega",
              trackingUrl: "https://japaspesca.com.br/conta",
              nfeUrl: null,
              nfeNumber: null,
            },
          },
        });

        console.log(`[asaas-webhook] Confirmation email sent for order ${orderId} → ${recipientEmail}`);
      } else {
        console.warn(`[asaas-webhook] No email found for user ${order.user_id}, skipping confirmation email`);
      }
    }
  } catch (err) {
    console.error(`[asaas-webhook] Error sending confirmation email for order ${orderId}:`, err);
  }
}
