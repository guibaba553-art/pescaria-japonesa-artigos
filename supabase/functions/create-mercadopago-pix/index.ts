import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 30s timeout for the whole function
  const timeoutId = setTimeout(() => {
    console.error("[create-mercadopago-pix] Function timed out after 30s");
  }, 30_000);

  try {
    // ── Authentication ──────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Parse request body ──────────────────────────────────────────────────
    const { orderId } = await req.json();

    if (!orderId || typeof orderId !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing required field: orderId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Validate order ownership ────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, user_id, status, total_amount, payment_id, pix_attempts, delivery_type, shipping_service_id",
      )
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Pedido não encontrado" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (order.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Acesso não autorizado a este pedido" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Check pix_attempts limit ───────────────────────────────────────────
    if ((order.pix_attempts || 0) >= 3) {
      return new Response(
        JSON.stringify({
          error: "Número máximo de regenerações de PIX excedido.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Check for existing active payment ─────────────────────────────────
    if (order.payment_id && order.status === "aguardando_pagamento") {
      return new Response(
        JSON.stringify({
          error: "Este pedido já possui um PIX em processamento.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Delivery/pickup validation ────────────────────────────────────────
    if (
      !order.delivery_type ||
      !["delivery", "pickup"].includes(order.delivery_type)
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Selecione uma forma de entrega antes de finalizar o pedido.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (order.delivery_type === "delivery" && !order.shipping_service_id) {
      return new Response(
        JSON.stringify({
          error: "Selecione um frete para entrega antes de finalizar o pedido.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Mercado Pago configuration ─────────────────────────────────────────
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!accessToken) {
      return new Response(
        JSON.stringify({
          error: "MERCADO_PAGO_ACCESS_TOKEN não configurado",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Valida formato do token — MP aceita TEST-... (sandbox) ou APP_USR-... (produção)
    if (!accessToken.startsWith('TEST-') && !accessToken.startsWith('APP_USR-')) {
      return new Response(
        JSON.stringify({
          error: "MERCADO_PAGO_ACCESS_TOKEN inválido. Deve começar com TEST- ou APP_USR-",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[create-mercadopago-pix] Token MP detectado: ${accessToken.startsWith('TEST-') ? 'sandbox (TEST-)' : 'produção (APP_USR-)'}`,
    );

    // ── Fetch user profile ─────────────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, cpf, phone")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Perfil do usuário não encontrado" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const customerName = profile.full_name || user.email || "Cliente";
    const cpf = (profile.cpf || "").replace(/\D/g, "");

    // Split full name into first/last name for Mercado Pago payer
    const nameParts = customerName.trim().split(/\s+/);
    const firstName = nameParts[0] || customerName;
    const lastName = nameParts.slice(1).join(" ") || firstName;

    // Build description from order ID
    const description = `Pedido #${orderId.slice(0, 8)}`;

    // ── Create PIX payment via Mercado Pago ─────────────────────────────────
    const idempotencyKey = `pix-${orderId}-${Date.now()}`;

    console.log(
      `[create-mercadopago-pix] Criando PIX para pedido ${orderId} — valor R$ ${Number(order.total_amount).toFixed(2)}`,
    );

    const paymentPayload = {
      transaction_amount: Number(order.total_amount),
      description,
      payment_method_id: "pix",
      payer: {
        email: user.email || "",
        first_name: firstName.substring(0, 50),
        last_name: lastName.substring(0, 50),
        identification: {
          type: "CPF",
          number: cpf || "",
        },
      },
    };

    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 20_000);

    let paymentResponse: Response;
    let paymentResult: any;
    try {
      paymentResponse = await fetch(
        "https://api.mercadopago.com/v1/payments",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(paymentPayload),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(fetchTimeout);
    }

    paymentResult = await paymentResponse.json().catch(() => null);

    if (!paymentResponse.ok) {
      const errorMessage = paymentResult?.message ||
        paymentResult?.cause?.[0]?.description ||
        `HTTP ${paymentResponse.status}`;
      console.error(
        "[create-mercadopago-pix] Erro Mercado Pago",
        paymentResponse.status,
        errorMessage,
      );
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const mpPaymentId: string = paymentResult.id;

    // Extract QR Code data from Mercado Pago response
    const transactionData = paymentResult.point_of_interaction?.transaction_data;
    const brCode: string = transactionData?.qr_code || "";
    const brCodeBase64: string = transactionData?.qr_code_base64 || "";
    const pixExpiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // ── Save payment info on order ──────────────────────────────────────────
    await supabase
      .from("orders")
      .update({
        payment_id: String(mpPaymentId),
        payment_gateway: "mercadopago",
        payment_method: "pix",
        qr_code: brCode,
        qr_code_base64: brCodeBase64,
        pix_expiration: pixExpiration,
        pix_attempts: (order.pix_attempts || 0) + 1,
      })
      .eq("id", orderId);

    console.log(
      `[create-mercadopago-pix] PIX criado — MP ID: ${mpPaymentId}`,
    );

    // ── Return success response ─────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: String(mpPaymentId),
          brCode,
          brCodeBase64,
          expiresAt: pixExpiration,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[create-mercadopago-pix] Erro inesperado:", error);
    const msg = error instanceof Error
      ? (error.name === "AbortError"
        ? "O Mercado Pago demorou para responder. Tente novamente."
        : error.message)
      : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

if (!Deno.env.get("DENO_TEST")) {
  serve(handleRequest);
}
