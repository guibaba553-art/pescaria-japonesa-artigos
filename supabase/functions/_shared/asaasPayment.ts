// Shared Asaas credit card payment processor
// Used by create-payment-asaas and retry-payment-asaas

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { findOrCreateCustomer } from './asaasCustomer.ts';
import { validateCreditCardFields } from './cardValidation.ts';
import { handlePaymentConfirmed } from './stockHandler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export interface PaymentBody {
  orderId: string;
  installmentCount: number;
  saveCard?: boolean;
  remoteIp: string;
  customerData: Record<string, unknown>;
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    addressComplement?: string;
    phone: string;
    mobilePhone?: string;
  };
  creditCardToken?: string;
}

export interface PaymentConfig {
  /** Check for existing asaas_payment_id (P29) — true for first attempt, false for retry */
  checkDuplicateCharge: boolean;
  /** Enforce 10-minute window since last payment attempt — true for retry */
  checkTimeWindow: boolean;
  /** Always send installmentCount + installmentValue — true for retry */
  forceInstallmentFields: boolean;
}

export async function processAsaasCreditCardPayment(
  req: Request,
  body: PaymentBody,
  config: PaymentConfig,
): Promise<Response> {
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
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid authentication' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Parse and validate body ─────────────────────────────────────────────
  const {
    orderId,
    installmentCount,
    saveCard,
    remoteIp,
    customerData,
    creditCard,
    creditCardHolderInfo,
    creditCardToken,
  } = body;

  if (!orderId || installmentCount == null || !remoteIp || !customerData) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: orderId, installmentCount, remoteIp, customerData' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (installmentCount < 1) {
    return new Response(
      JSON.stringify({ error: 'Número de parcelas inválido.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!creditCardToken && (!creditCard || !creditCardHolderInfo)) {
    return new Response(
      JSON.stringify({ error: 'Either creditCardToken or creditCard+creditCardHolderInfo must be provided' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── P09: Zod card validation (only for new cards, skip if tokenized) ────
  if (creditCard && !creditCardToken) {
    const cardErrors = validateCreditCardFields({
      cardNumber: creditCard.number,
      holderName: creditCard.holderName,
      expiryMonth: creditCard.expiryMonth,
      expiryYear: creditCard.expiryYear,
      ccv: creditCard.ccv,
    });
    if (cardErrors.length > 0) {
      return new Response(
        JSON.stringify({ error: cardErrors.join('. ') }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  // ── Order validation ────────────────────────────────────────────────────
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, status, total_amount, payment_attempts, last_payment_attempt_at, asaas_payment_id, delivery_type, shipping_service_id')
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

  if (order.payment_attempts >= 3) {
    return new Response(
      JSON.stringify({ error: 'Número máximo de tentativas de pagamento excedido.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── P29: Duplicate charge check (only for first attempt) ────────────────
  if (config.checkDuplicateCharge && order.asaas_payment_id && order.status === 'aguardando_pagamento') {
    return new Response(
      JSON.stringify({ error: 'Este pedido já possui uma cobrança em processamento.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (order.status !== 'aguardando_pagamento') {
    return new Response(
      JSON.stringify({ error: 'Este pedido já foi pago.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Delivery/pickup validation ────────────────────────────────────────
  if (!order.delivery_type || !['delivery', 'pickup'].includes(order.delivery_type)) {
    return new Response(
      JSON.stringify({ error: 'Selecione uma forma de entrega antes de finalizar o pedido.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (order.delivery_type === 'delivery' && !order.shipping_service_id) {
    return new Response(
      JSON.stringify({ error: 'Selecione um frete para entrega antes de finalizar o pedido.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Time window (only for retry) ────────────────────────────────────────
  if (config.checkTimeWindow && order.last_payment_attempt_at) {
    const lastAttempt = new Date(order.last_payment_attempt_at).getTime();
    const now = Date.now();
    const diffMinutes = (now - lastAttempt) / 1000 / 60;
    if (diffMinutes > 10) {
      return new Response(
        JSON.stringify({ error: 'Tempo limite para retentar o pagamento expirou. Faça um novo pedido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  // ── Asaas setup ─────────────────────────────────────────────────────────
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

  // ── Customer ────────────────────────────────────────────────────────────
  const customer = await findOrCreateCustomer(supabase, user.id, customerData, asaasApiKey, asaasEnv);

  // ── P01: Look up UUID in saved_payment_methods → Asaas token ────────────
  let cardToken = creditCardToken;
  if (cardToken && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cardToken)) {
    const { data: savedMethod } = await supabase
      .from('saved_payment_methods')
      .select('asaas_credit_card_token')
      .eq('id', cardToken)
      .maybeSingle();
    if (savedMethod?.asaas_credit_card_token) {
      cardToken = savedMethod.asaas_credit_card_token;
    }
  }

  // ── Build payment payload ───────────────────────────────────────────────
  const dueDate = new Date().toISOString().split('T')[0];
  const paymentPayload: Record<string, unknown> = {
    customer: customer.id,
    billingType: 'CREDIT_CARD',
    value: Number(order.total_amount),
    dueDate,
    remoteIp,
  };

  // Installment fields: create sends only when ≥2; retry always sends
  if (config.forceInstallmentFields || Number(installmentCount) >= 2) {
    const total = Number(order.total_amount);
    const count = Number(installmentCount);
    const installmentValue = Math.floor(total * 100 / count) / 100;
    paymentPayload.installmentCount = count;
    paymentPayload.installmentValue = installmentValue;
  }

  if (cardToken) {
    paymentPayload.creditCardToken = cardToken;
  } else if (creditCard && creditCardHolderInfo) {
    // New card — send raw data. Tokenization happens after approval.
    paymentPayload.creditCard = {
      holderName: creditCard.holderName,
      number: creditCard.number,
      expiryMonth: creditCard.expiryMonth,
      expiryYear: creditCard.expiryYear,
      ccv: creditCard.ccv,
    };
    paymentPayload.creditCardHolderInfo = {
      name: creditCardHolderInfo.name,
      email: creditCardHolderInfo.email,
      cpfCnpj: creditCardHolderInfo.cpfCnpj,
      postalCode: creditCardHolderInfo.postalCode,
      addressNumber: creditCardHolderInfo.addressNumber,
      addressComplement: creditCardHolderInfo.addressComplement,
      phone: creditCardHolderInfo.phone,
      mobilePhone: creditCardHolderInfo.mobilePhone,
    };
  } else {
    return new Response(
      JSON.stringify({ success: false, error: 'Dados do cartão não fornecidos.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Call Asaas API ──────────────────────────────────────────────────────
  const paymentResponse = await fetch(`${baseUrl}/v3/payments`, {
    method: 'POST',
    headers: asaasHeaders,
    body: JSON.stringify(paymentPayload),
  });

  const paymentResult = await paymentResponse.json();

  // ── Handle declined / error ─────────────────────────────────────────────
  if (!paymentResponse.ok) {
    const newAttempts = (order.payment_attempts || 0) + 1;
    await supabase
      .from('orders')
      .update({
        payment_attempts: newAttempts,
        last_payment_attempt_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    const errorMessage = paymentResult?.errors?.[0]?.description
      || paymentResult?.error
      || 'Cartão recusado. Verifique os dados e tente novamente.';

    console.error('Asaas payment error:', paymentResponse.status, JSON.stringify(paymentResult));

    const responseBody: Record<string, unknown> = {
      success: false,
      error: errorMessage,
      attemptsRemaining: Math.max(0, 3 - newAttempts),
    };
    if (newAttempts >= 3) {
      responseBody.maxAttemptsReached = true;
    }

    return new Response(JSON.stringify(responseBody), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Handle success ──────────────────────────────────────────────────────
  const asaasPaymentId: string = paymentResult.id;
  const paymentStatus: string = paymentResult.status;

  const paymentData = {
    id: asaasPaymentId,
    status: paymentStatus,
    installments: paymentResult.installmentCount || Number(installmentCount),
    value: Number(order.total_amount),
    netValue: paymentResult.netValue ? Number(paymentResult.netValue) : undefined,
  };

  // ── Non-CONFIRMED (pending analysis, etc.) ─────────────────────────────
  if (paymentStatus !== 'CONFIRMED') {
    await supabase
      .from('orders')
      .update({
        asaas_payment_id: asaasPaymentId,
        payment_gateway: 'asaas',
        payment_attempts: (order.payment_attempts || 0) + 1,
        last_payment_attempt_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    return new Response(
      JSON.stringify({ success: true, payment: paymentData }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Payment CONFIRMED ───────────────────────────────────────────────────
  await supabase
    .from('orders')
    .update({
      status: 'em_preparo',
      asaas_payment_id: asaasPaymentId,
      payment_gateway: 'asaas',
      payment_attempts: (order.payment_attempts || 0) + 1,
      last_payment_attempt_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  // Decrementar estoque via shared handler
  await handlePaymentConfirmed(supabase, supabaseUrl, supabaseKey, orderId);

  // ── Extract token from Asaas response and save if requested ─────────────
  const paymentCard = paymentResult.creditCard as Record<string, unknown> | undefined;
  const paymentCardToken = paymentCard?.creditCardToken as string | undefined;
  const paymentCardBrand = paymentResult.creditCardBrandName
    || (paymentCard?.creditCardBrand as string)
    || (paymentCard?.brand as string)
    || '';
  const paymentLast4 = (paymentCard?.creditCardNumber as string)?.slice(-4)
    || (paymentCard?.lastFourDigits as string)
    || creditCard?.number?.slice(-4)
    || '';

  let cardInfo: Record<string, unknown> | undefined;

  if (paymentCardToken && saveCard && !cardToken && creditCard) {
    // New card — save for future purchases
    try {
      await supabase.from('saved_payment_methods').insert({
        user_id: user.id,
        payment_method: 'credit_card',
        asaas_credit_card_token: paymentCardToken,
        card_brand: paymentCardBrand,
        card_last4: paymentLast4,
        cardholder_name: creditCard.holderName,
        card_exp_month: creditCard.expiryMonth,
        card_exp_year: String(Number(creditCard.expiryYear) % 100).padStart(2, '0'),
      });
    } catch (e) {
      console.error('Erro ao salvar cartão tokenizado:', e);
    }
  }

  if (paymentCardToken) {
    cardInfo = {
      brand: paymentCardBrand,
      last4: paymentLast4,
      creditCardToken: paymentCardToken,
      cardExpiryMonth: creditCard?.expiryMonth || '',
      cardExpiryYear: creditCard?.expiryYear || '',
    };
  }

  // ── Return success ────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({ success: true, payment: paymentData, cardInfo }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
