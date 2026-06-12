import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AbacatePay public HMAC key for signature verification
const ABACATEPAY_PUBLIC_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

async function verifySignature(rawBody: string, signatureFromHeader: string): Promise<boolean> {
  const key = new TextEncoder().encode(ABACATEPAY_PUBLIC_KEY);
  const body = new TextEncoder().encode(rawBody);

  // Import key for HMAC-SHA256
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Use HMAC-SHA256 via Web Crypto API — MUST await (BUG-001 fix)
  const expectedSigBytes = await crypto.subtle.sign("HMAC", cryptoKey, body);
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(expectedSigBytes)));

  // Timing-safe comparison
  const a = expectedSig;
  const b = signatureFromHeader;

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret from URL query
    const url = new URL(req.url);
    const webhookSecret = url.searchParams.get("webhookSecret");
    const expectedSecret = Deno.env.get("ABACATEPAY_WEBHOOK_SECRET");

    if (expectedSecret && webhookSecret !== expectedSecret) {
      console.error("Invalid webhook secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify HMAC signature
    const signature = req.headers.get("X-Webhook-Signature");
    const rawBody = await req.text();

    if (signature && !(await verifySignature(rawBody, signature))) {
      console.error("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const { event, data } = payload;

    console.log(`Webhook received: ${event}`, { id: payload.id, devMode: payload.devMode });

    // Ignore dev mode events if not in dev mode
    // (both are processed the same way for simplicity)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const orderId = data?.transparent?.externalId || data?.checkout?.externalId || data?.externalId;

    if (!orderId) {
      console.error("No externalId in webhook payload");
      return new Response(JSON.stringify({ error: "No externalId" }), {
        status: 200, // Accept to avoid retries
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // BUG-007: Idempotência — verificar se evento já foi processado
    const eventId = payload.id;
    if (eventId) {
      const { data: existingEvent } = await supabase
        .from("webhook_events")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();

      if (existingEvent) {
        console.log(`Event ${eventId} already processed, skipping`);
        return new Response(JSON.stringify({ success: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get order details
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, status, user_id")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      console.error("Order not found:", orderId);
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 200, // Accept to avoid retries
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (event) {
      case "checkout.completed":
      case "transparent.completed": {
        if (order.status === "aguardando_pagamento") {
          // Update order to processing
          const receiptUrl = data?.transparent?.receiptUrl || data?.receiptUrl;
          const paymentId = data?.transparent?.id || data?.checkout?.id || data?.id || order.payment_id;
          await supabase
            .from("orders")
            .update({
              status: "em_preparo",
              payment_id: paymentId,
              payment_method: data?.checkout?.methods?.[0]?.toLowerCase() || "pix",
              receipt_url: receiptUrl || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", orderId);

          // Release stock reservation and subtract real stock
          try {
            await supabase.rpc("release_stock_reservation", { p_order_id: orderId });
          } catch (_) { /* ignore */ }

          try {
            await supabase.rpc("subtract_stock_for_order", { p_order_id: orderId });
          } catch (err) {
            console.error("Error subtracting stock:", err);
          }

          console.log(`Order ${orderId} paid and processing`);
        }
        break;
      }

      case "checkout.refunded":
      case "transparent.refunded": {
        await supabase
          .from("orders")
          .update({ status: "cancelado", receipt_url: data?.transparent?.receiptUrl || data?.receiptUrl || null, updated_at: new Date().toISOString() })
          .eq("id", orderId);

        // Restore stock
        try {
          await supabase.rpc("release_stock_reservation", { p_order_id: orderId });
        } catch (_) { /* ignore */ }

        console.log(`Order ${orderId} refunded`);
        break;
      }

      case "checkout.disputed":
      case "transparent.disputed": {
        await supabase
          .from("orders")
          .update({ status: "devolucao_solicitada", updated_at: new Date().toISOString() })
          .eq("id", orderId);
        console.log(`Order ${orderId} disputed`);
        break;
      }

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Registrar evento processado (idempotência)
    if (eventId) {
      try {
        await supabase.from("webhook_events").insert({
          event_id: eventId,
          event_type: event,
        });
      } catch (_) { /* ignore duplicate insert race */ }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("abacatepay-webhook error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
