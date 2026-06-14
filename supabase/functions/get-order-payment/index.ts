import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Authentication ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Autenticação necessária', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Parse request body ──────────────────────────────────────────────────
    let body: { orderId?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Corpo da requisição inválido', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!body.orderId || typeof body.orderId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'orderId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { orderId } = body;

    // ── Fetch order with payment fields ─────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        user_id,
        status,
        total_amount,
        payment_method,
        payment_gateway,
        payment_attempts,
        last_payment_attempt_at,
        qr_code,
        qr_code_base64,
        pix_expiration,
        card_brand,
        card_last_digits
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Pedido não encontrado', success: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Order ownership validation (or admin/employee) ──────────────────────
    if (order.user_id !== user.id) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const isAdminOrEmployee = roles?.some((r) => r.role === 'admin' || r.role === 'employee');

      if (!isAdminOrEmployee) {
        return new Response(
          JSON.stringify({ error: 'Acesso não autorizado a este pedido', success: false }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── Derive response fields ──────────────────────────────────────────────

    // pixExpired: true if pix_expiration is in the past
    const now = new Date();
    const pixExpirationDate = order.pix_expiration ? new Date(order.pix_expiration) : null;
    const pixExpired = pixExpirationDate ? now >= pixExpirationDate : false;

    // attemptsRemaining = 3 - payment_attempts, min 0
    const paymentAttempts = order.payment_attempts ?? 0;
    const attemptsRemaining = Math.max(0, 3 - paymentAttempts);

    // payment_method stores 'pix', 'credit_card', 'debit_card', etc.
    const paymentMethod = order.payment_method || 'pix';

    // Build response data — always return the full shape (null for irrelevant fields)
    const data: Record<string, unknown> = {
      status: order.status,
      totalAmount: Number(order.total_amount),
      paymentMethod,
      paymentGateway: order.payment_gateway || null,
      // PIX fields
      qrCode: order.qr_code || null,
      qrCodeBase64: order.qr_code_base64 || null,
      pixExpiration: order.pix_expiration || null,
      pixExpired,
      // Card / attempt fields
      paymentAttempts,
      attemptsRemaining,
      lastAttemptAt: order.last_payment_attempt_at || null,
      cardBrand: order.card_brand || null,
      cardLastDigits: order.card_last_digits || null,
    };

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Erro em get-order-payment:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
