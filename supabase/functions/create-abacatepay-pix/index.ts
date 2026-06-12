import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ABACATEPAY_API = "https://api.abacatepay.com/v2";

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse input
    const { orderId, amount: rawAmount, description, customerName, customerTaxId, customerEmail, customerCellphone } = await req.json();
    const amount = Number(rawAmount);

    if (!orderId || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid input: orderId and positive amount required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify order ownership
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("user_id, total_amount, payment_id, status, pix_attempts")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── P28: Check pix_attempts limit ───────────────────────────────────────
    if ((order.pix_attempts || 0) >= 3) {
      return new Response(
        JSON.stringify({ error: 'Número máximo de regenerações de PIX excedido.' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── P28: Check for existing active payment ─────────────────────────────
    if (order.payment_id && order.status === 'aguardando_pagamento') {
      return new Response(
        JSON.stringify({ error: 'Este pedido já possui um PIX em processamento.' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get AbacatePay API key
    const apiKey = Deno.env.get("ABACATEPAY_API_KEY");
    if (!apiKey) {
      throw new Error("ABACATEPAY_API_KEY not configured");
    }

    // Call AbacatePay transparent PIX API
    // customer é opcional para PIX, mas se enviado, TODOS os campos são obrigatórios
    const customerPayload = customerName && customerTaxId
      ? {
          name: customerName,
          taxId: customerTaxId,
          ...(customerEmail && { email: customerEmail }),
          ...(customerCellphone && { cellphone: customerCellphone }),
        }
      : undefined;

    const body: Record<string, unknown> = {
      method: "PIX",
      data: {
        amount, // in cents
        expiresIn: 1800, // 30 minutos (BUG-005 fix)
        externalId: orderId,
        ...(description && { description }),
        ...(customerPayload && { customer: customerPayload }),
        metadata: {
          orderId,
          userId: user.id,
        },
      },
    };

    const resp = await fetch(`${ABACATEPAY_API}/transparents/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const respData = await resp.json();

    if (!resp.ok || !respData.success) {
      console.error("AbacatePay error", resp.status, respData);
      return new Response(
        JSON.stringify({
          error: "Erro ao gerar PIX",
          details: respData.error || "Erro desconhecido",
        }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Save payment info on order (use our own 30 min window, ignore gateway's expiresAt)
    const charge = respData.data;
    const pixExpiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await supabase
      .from("orders")
      .update({
        payment_id: charge.id,
        payment_method: "pix",
        qr_code: charge.brCode || null,
        qr_code_base64: charge.brCodeBase64 || null,
        pix_expiration: pixExpiration,
        platform_fee: charge.platformFee || null, // BUG-004 fix
        pix_attempts: (order.pix_attempts || 0) + 1,
      })
      .eq("id", orderId);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: charge.id,
          brCode: charge.brCode,
          brCodeBase64: charge.brCodeBase64,
          expiresAt: pixExpiration,
          amount: charge.amount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-abacatepay-pix error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (!Deno.env.get("DENO_TEST")) {
  serve(handleRequest);
}
