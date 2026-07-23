import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { findOrCreateCustomer } from '../_shared/asaasCustomer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // ── Fetch order with payment fields ─────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, status, total_amount, payment_gateway, asaas_payment_id, payment_id, qr_code, qr_code_base64, pix_expiration, pix_attempts')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Pedido não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Order ownership validation ──────────────────────────────────────────
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

    // ── P28: Check for existing active payment before generating new one ───
    // Only applies when creating a completely new PIX (path 4)
    // For existing payments (paths 1-3), the decision tree handles status

    // Capture non-null values for closure usage
    const currentUser = user;
    const currentOrder = order;

    // ── Asaas configuration (shared by Asaas paths) ─────────────────────────
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    const asaasEnv = Deno.env.get('ASAAS_ENVIRONMENT') || 'sandbox';

    if (!asaasApiKey) {
      throw new Error('ASAAS_API_KEY não configurada');
    }

    const asaasBaseUrl = asaasEnv === 'production'
      ? 'https://api.asaas.com'
      : 'https://api-sandbox.asaas.com';

    const asaasHeaders: Record<string, string> = {
      'access_token': asaasApiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'JapasPesca/1.0.0',
    };

    // ── Helper: create new Asaas PIX payment ────────────────────────────────
    async function createAsaasPix(): Promise<{
      id: string;
      brCode: string;
      brCodeBase64: string;
      expiresAt: string;
    }> {
      // Fetch user profile for Asaas customer
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, cpf, phone')
        .eq('id', currentUser.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Perfil do usuário não encontrado');
      }

      const customerData = {
        name: profile.full_name || currentUser.email || 'Cliente',
        email: currentUser.email || '',
        cpfCnpj: profile.cpf || '',
        phone: profile.phone || '',
      };

      const customer = await findOrCreateCustomer(
        supabase,
        currentUser.id,
        customerData,
        asaasApiKey,
        asaasEnv,
      );

      // dueDate = tomorrow to give some buffer
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueDate = tomorrow.toISOString().split('T')[0];

      const paymentPayload = {
        customer: customer.id,
        billingType: 'PIX',
        value: Math.round(Number(currentOrder.total_amount) * 100) / 100,
        dueDate,
      };

      const paymentResponse = await fetch(`${asaasBaseUrl}/v3/payments`, {
        method: 'POST',
        headers: asaasHeaders,
        body: JSON.stringify(paymentPayload),
      });

      const paymentResult = await paymentResponse.json();

      if (!paymentResponse.ok) {
        const errorMessage = paymentResult?.errors?.[0]?.description
          || paymentResult?.error
          || 'Erro ao criar pagamento PIX no Asaas';
        throw new Error(errorMessage);
      }

      const asaasPaymentId: string = paymentResult.id;

      // Fetch QR Code
      const qrCodeResponse = await fetch(
        `${asaasBaseUrl}/v3/payments/${asaasPaymentId}/pixQrCode`,
        { headers: asaasHeaders },
      );

      const qrCodeResult = await qrCodeResponse.json();

      if (!qrCodeResponse.ok) {
        const errorMessage = qrCodeResult?.errors?.[0]?.description
          || qrCodeResult?.error
          || 'Erro ao obter QR Code PIX';
        throw new Error(errorMessage);
      }

      const brCode: string = qrCodeResult.payload || qrCodeResult.brCode || '';
      const brCodeBase64: string = qrCodeResult.encodedImage || qrCodeResult.base64 || qrCodeResult.brCodeBase64 || '';
      // Override Asaas expiration with our own 30 min window
      const pixExpiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      // Update order with new payment data
      await supabase
        .from('orders')
        .update({
          asaas_payment_id: asaasPaymentId,
          payment_gateway: 'asaas',
          qr_code: brCode,
          qr_code_base64: brCodeBase64,
          pix_expiration: pixExpiration,
          pix_attempts: (currentOrder.pix_attempts || 0) + 1,
        })
        .eq('id', orderId);

      return { id: asaasPaymentId, brCode, brCodeBase64, expiresAt: pixExpiration };
    }

    // ── Helper: create new Mercado Pago PIX payment ─────────────────────────
    async function createMercadopagoPix(): Promise<{
      id: string;
      brCode: string;
      brCodeBase64: string;
      expiresAt: string;
    }> {
      const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
      if (!accessToken) {
        throw new Error('MERCADO_PAGO_ACCESS_TOKEN não configurada');
      }

      // Fetch user profile for customer info
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, cpf')
        .eq('id', currentUser.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Perfil do usuário não encontrado');
      }

      const idempotencyKey = crypto.randomUUID();

      const paymentPayload = {
        transaction_amount: Math.round(Number(currentOrder.total_amount) * 100) / 100,
        description: `Pedido ${orderId}`,
        payment_method_id: 'pix',
        payer: {
          email: currentUser.email || '',
          first_name: (profile.full_name || 'Cliente').split(' ')[0],
          last_name: (profile.full_name || 'Cliente').split(' ').slice(1).join(' ') || 'Cliente',
          identification: {
            type: 'CPF',
            number: profile.cpf || '',
          },
        },
      };

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(paymentPayload),
      });

      const paymentResult = await response.json();

      if (!response.ok) {
        console.error('Mercado Pago error', response.status, paymentResult);
        throw new Error(paymentResult?.message || 'Erro ao gerar PIX no Mercado Pago');
      }

      const mpPaymentId: string = paymentResult.id;
      const brCode: string = paymentResult.point_of_interaction?.transaction_data?.qr_code || '';
      const brCodeBase64: string = paymentResult.point_of_interaction?.transaction_data?.qr_code_base64 || '';
      const pixExpiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      // Update order with new payment data
      await supabase
        .from('orders')
        .update({
          payment_id: String(mpPaymentId),
          payment_gateway: 'mercadopago',
          qr_code: brCode,
          qr_code_base64: brCodeBase64,
          pix_expiration: pixExpiration,
          pix_attempts: (currentOrder.pix_attempts || 0) + 1,
        })
        .eq('id', orderId);

      return {
        id: String(mpPaymentId),
        brCode,
        brCodeBase64,
        expiresAt: pixExpiration,
      };
    }

    // ────────────────────────────────────────────────────────────────────────
    // Decision tree
    // ────────────────────────────────────────────────────────────────────────
    const gateway = order.payment_gateway;

    if (gateway === 'asaas' && order.asaas_payment_id) {
      // Path 2: Existing Asaas payment
      const statusResponse = await fetch(
        `${asaasBaseUrl}/v3/payments/${order.asaas_payment_id}`,
        { headers: asaasHeaders },
      );

      if (!statusResponse.ok) {
        return new Response(
          JSON.stringify({ error: 'Erro ao consultar status do pagamento no Asaas' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const statusData = await statusResponse.json();
      const paymentStatus: string = statusData?.status || '';

      // 2b. Already paid
      if (paymentStatus === 'CONFIRMED' || paymentStatus === 'RECEIVED') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: order.asaas_payment_id,
              brCode: order.qr_code,
              brCodeBase64: order.qr_code_base64,
              expiresAt: order.pix_expiration,
              refreshed: false,
            },
            message: 'already paid',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // 2c. Still pending — re-query same QR code (no cost)
      if (paymentStatus === 'PENDING' || paymentStatus === 'AWAITING_RISK_ANALYSIS') {
        const qrCodeResponse = await fetch(
          `${asaasBaseUrl}/v3/payments/${order.asaas_payment_id}/pixQrCode`,
          { headers: asaasHeaders },
        );

        if (!qrCodeResponse.ok) {
          return new Response(
            JSON.stringify({ error: 'Erro ao re-consultar QR Code PIX' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        const qrCodeResult = await qrCodeResponse.json();

        const brCode: string = qrCodeResult.payload || qrCodeResult.brCode || '';
        const brCodeBase64: string = qrCodeResult.encodedImage || qrCodeResult.base64 || qrCodeResult.brCodeBase64 || '';
        // Override Asaas expiration with our own 30 min window
        const pixExpiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        // Update stored QR data (might have refreshed expiry)
        if (brCode || brCodeBase64) {
          await supabase
            .from('orders')
            .update({
              qr_code: brCode || order.qr_code,
              qr_code_base64: brCodeBase64 || order.qr_code_base64,
              pix_expiration: pixExpiration,
            })
            .eq('id', orderId);
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: order.asaas_payment_id,
              brCode: brCode || order.qr_code,
              brCodeBase64: brCodeBase64 || order.qr_code_base64,
              expiresAt: pixExpiration,
              refreshed: false,
            },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // 2d. Expired / overdue / cancelled — create new PIX payment
      // Statuses: OVERDUE, CANCELLED, DELETED, REFUNDED, etc.
      const newPayment = await createAsaasPix();

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: newPayment.id,
            brCode: newPayment.brCode,
            brCodeBase64: newPayment.brCodeBase64,
            expiresAt: newPayment.expiresAt,
            refreshed: true,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (gateway === 'mercadopago' && order.payment_id) {
      // Path 3: Existing Mercado Pago payment — create new PIX
      const newPayment = await createMercadopagoPix();

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: newPayment.id,
            brCode: newPayment.brCode,
            brCodeBase64: newPayment.brCodeBase64,
            expiresAt: newPayment.expiresAt,
            refreshed: true,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Path 4: No payment exists — create new Asaas PIX
    const newPayment = await createAsaasPix();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: newPayment.id,
          brCode: newPayment.brCode,
          brCodeBase64: newPayment.brCodeBase64,
          expiresAt: newPayment.expiresAt,
          refreshed: true,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Erro em refresh-pix:', error);
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
});
