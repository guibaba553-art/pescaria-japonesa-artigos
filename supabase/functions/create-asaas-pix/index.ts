import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { findOrCreateCustomer } from '../_shared/asaasCustomer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 30s timeout for the whole function
  const timeoutId = setTimeout(() => {
    console.error('Function timed out after 30s');
  }, 30_000);

  try {
    // ── Authentication ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Parse request body ──────────────────────────────────────────────────
    const { orderId } = await req.json();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: orderId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Validate order ownership ────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, status, total_amount, asaas_payment_id, payment_id, pix_attempts')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Pedido não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (order.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Acesso não autorizado a este pedido' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── P28: Check pix_attempts limit ───────────────────────────────────────
    if ((order.pix_attempts || 0) >= 3) {
      return new Response(
        JSON.stringify({ error: 'Número máximo de regenerações de PIX excedido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── P28: Check for existing active payment ─────────────────────────────
    if (order.asaas_payment_id && order.status === 'aguardando_pagamento') {
      return new Response(
        JSON.stringify({ error: 'Este pedido já possui um PIX em processamento.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Asaas configuration ─────────────────────────────────────────────────
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    const asaasEnv = Deno.env.get('ASAAS_ENVIRONMENT') || 'sandbox';

    if (!asaasApiKey) {
      throw new Error('ASAAS_API_KEY não configurada');
    }

    const baseUrl = asaasEnv === 'production'
      ? 'https://api.asaas.com'
      : 'https://api-sandbox.asaas.com';

    const asaasHeaders: Record<string, string> = {
      'access_token': asaasApiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'JapasPesca/1.0.0',
    };

    // ── Fetch user profile data for Asaas customer ──────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, cpf, phone')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Perfil do usuário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const customerData = {
      name: profile.full_name || user.email || 'Cliente',
      email: user.email || '',
      cpfCnpj: profile.cpf || '',
      phone: profile.phone || '',
    };

    // ── Find or create Asaas customer ───────────────────────────────────────
    const customer = await findOrCreateCustomer(
      supabase,
      user.id,
      customerData,
      asaasApiKey,
      asaasEnv,
    );

    // ── Build PIX payment payload ───────────────────────────────────────────
    // dueDate = tomorrow to give some buffer
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDate = tomorrow.toISOString().split('T')[0];

    const paymentPayload = {
      customer: customer.id,
      billingType: 'PIX',
      value: Number(order.total_amount), // in reais (not cents)
      dueDate,
    };

    // ── Step 1: Create payment (POST /v3/payments) ──────────────────────────
    const paymentResponse = await fetch(`${baseUrl}/v3/payments`, {
      method: 'POST',
      headers: asaasHeaders,
      body: JSON.stringify(paymentPayload),
    });

    const paymentResult = await paymentResponse.json();

    if (!paymentResponse.ok) {
      const errorMessage = paymentResult?.errors?.[0]?.description
        || paymentResult?.error
        || 'Erro ao criar pagamento PIX no Asaas';

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const asaasPaymentId: string = paymentResult.id;

    // ── Step 2: Fetch QR Code (GET /v3/payments/{id}/pixQrCode) ────────────
    const qrCodeResponse = await fetch(
      `${baseUrl}/v3/payments/${asaasPaymentId}/pixQrCode`,
      { headers: asaasHeaders },
    );

    const qrCodeResult = await qrCodeResponse.json();

    if (!qrCodeResponse.ok) {
      const errorMessage = qrCodeResult?.errors?.[0]?.description
        || qrCodeResult?.error
        || 'Erro ao obter QR Code PIX';

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Extract QR code data
    // Asaas PIX QR Code endpoint returns { "encodedImage": "iVBOR...", "payload": "000201...", "expirationDate": "2025-01-01T23:59:59Z" }
    // Docs: https://docs.asaas.com/reference/get-qr-code-for-pix-payments
    const brCode: string = qrCodeResult.payload || qrCodeResult.brCode || '';
    const brCodeBase64: string = qrCodeResult.encodedImage || qrCodeResult.base64 || qrCodeResult.brCodeBase64 || '';
    const expiresAt: string = qrCodeResult.expirationDate || qrCodeResult.expiresAt || '';

    // ── Save payment info on order ──────────────────────────────────────────
    await supabase
      .from('orders')
      .update({
        asaas_payment_id: asaasPaymentId,
        payment_gateway: 'asaas',
        qr_code: brCode,
        qr_code_base64: brCodeBase64,
        pix_expiration: expiresAt || null,
        pix_attempts: (order.pix_attempts || 0) + 1,
      })
      .eq('id', orderId);

    // ── Return success response ─────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: asaasPaymentId,
          brCode,
          brCodeBase64,
          expiresAt,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Erro em create-asaas-pix:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

if (!Deno.env.get("DENO_TEST")) {
  serve(handleRequest);
}
