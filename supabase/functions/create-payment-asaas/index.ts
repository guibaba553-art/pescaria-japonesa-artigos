import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { findOrCreateCustomer } from '../_shared/asaasCustomer.ts';
import { validateCreditCardFields } from '../_shared/cardValidation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const timeoutId = setTimeout(() => {
    console.error('Function timed out after 60s');
  }, 60_000);

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
    const body = await req.json();

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

    // Basic field validation
    if (!orderId || installmentCount == null || !remoteIp || !customerData) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: orderId, installmentCount, remoteIp, customerData' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!creditCardToken && (!creditCard || !creditCardHolderInfo)) {
      return new Response(
        JSON.stringify({ error: 'Either creditCardToken or creditCard+creditCardHolderInfo must be provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── P09: Zod validation for card fields (only for new cards, not tokenized) ─
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

    // ── Validate order ownership & payment_attempts ────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, status, total_amount, payment_attempts, asaas_payment_id')
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

    // ── P29: Check for duplicate charges ──────────────────────────────────
    if (order.asaas_payment_id && order.status === 'aguardando_pagamento') {
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

    // ── Find or create Asaas customer ───────────────────────────────────────
    const customer = await findOrCreateCustomer(
      supabase,
      user.id,
      customerData,
      asaasApiKey,
      asaasEnv,
    );

    // ── Tokenize card BEFORE payment (if new card and saveCard) ──────────
    // This ensures the card is saved even if the payment attempt fails,
    // allowing the user to retry with the saved card.
    let cardToken = creditCardToken;
    let cardInfo: Record<string, unknown> | undefined;

    // ── P01: Look up UUID in saved_payment_methods → Asaas token ────────
    // cardToken may be a row ID (frontend fallback) or a real Asaas token.
    // Both are UUIDs, so we try lookup by id first. If not found, assume it's
    // a direct Asaas token and use it as-is.
    if (cardToken && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cardToken)) {
      const { data: savedMethod } = await supabase
        .from('saved_payment_methods')
        .select('asaas_credit_card_token')
        .eq('id', cardToken)
        .maybeSingle();

      if (savedMethod?.asaas_credit_card_token) {
        // Found a row by this ID — use the stored Asaas token
        cardToken = savedMethod.asaas_credit_card_token;
      }
      // If not found, cardToken is likely a direct Asaas token — use it as-is
    }

    if (!cardToken && creditCard && creditCardHolderInfo) {
      try {
        const tokenizeResponse = await fetch(
          `${baseUrl}/v3/creditCard/tokenizeCreditCard`,
          {
            method: 'POST',
            headers: asaasHeaders,
            body: JSON.stringify({
              customer: customer.id,
              creditCard: {
                holderName: creditCard.holderName,
                number: creditCard.number,
                expiryMonth: creditCard.expiryMonth,
                expiryYear: creditCard.expiryYear,
                ccv: creditCard.ccv,
              },
              creditCardHolderInfo: {
                name: creditCardHolderInfo.name,
                email: creditCardHolderInfo.email,
                cpfCnpj: creditCardHolderInfo.cpfCnpj,
                postalCode: creditCardHolderInfo.postalCode,
                addressNumber: creditCardHolderInfo.addressNumber,
                addressComplement: creditCardHolderInfo.addressComplement,
                phone: creditCardHolderInfo.phone,
                mobilePhone: creditCardHolderInfo.mobilePhone,
              },
            }),
          },
        );

        if (tokenizeResponse.ok) {
          const tokenizeResult = await tokenizeResponse.json();
          cardToken = tokenizeResult.creditCardToken;

          // Save card to DB only if user opted to save it
          if (saveCard) {
            const last4Digits = creditCard.number.slice(-4);

            await supabase.from('saved_payment_methods').insert({
              user_id: user.id,
              payment_method: 'credit_card',
              asaas_credit_card_token: cardToken,
              card_brand: '',  // será atualizado após confirmação do pagamento
              card_last4: last4Digits,
              cardholder_name: creditCard.holderName,
              card_exp_month: creditCard.expiryMonth,
              card_exp_year: String(Number(creditCard.expiryYear) % 100).padStart(2, '0'),
            });
          }

          cardInfo = {
            brand: '',
            last4: creditCard.number.slice(-4),
            creditCardToken: cardToken,
            cardExpiryMonth: creditCard.expiryMonth,
            cardExpiryYear: creditCard.expiryYear,
          };
        } else {
          const errorText = await tokenizeResponse.text();
          console.error('Tokenização falhou:', errorText);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Pagamento temporariamente indisponível. Tente novamente mais tarde.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      } catch (tokenizeError) {
        console.error('Erro na tokenização:', tokenizeError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Pagamento temporariamente indisponível. Tente novamente mais tarde.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── Build payment payload ───────────────────────────────────────────────
    const today = new Date();
    const dueDate = today.toISOString().split('T')[0];

    const paymentPayload: Record<string, unknown> = {
      customer: customer.id,
      billingType: 'CREDIT_CARD',
      value: Number(order.total_amount),
      dueDate,
      remoteIp,
    };

    // Só envia installmentCount quando ≥2 (Asaas exige installmentValue + installmentCount)
    if (Number(installmentCount) >= 2) {
      const total = Number(order.total_amount);
      const count = Number(installmentCount);
      // P08: Usar Math.floor para evitar centavos fracionados
      const installmentValue = Math.floor(total * 100 / count) / 100;
      paymentPayload.installmentCount = count;
      paymentPayload.installmentValue = installmentValue;
    }

    if (cardToken) {
      // Usa token (cartão salvo ou recém-tokenizado)
      paymentPayload.creditCardToken = cardToken;
    } else {
      // P05: Se não há token, retorna erro em vez de enviar dados brutos do cartão
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Pagamento temporariamente indisponível. Tente novamente mais tarde.',
        }),
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

    // ── Handle declined / error (400) ──────────────────────────────────────
    if (!paymentResponse.ok) {
      const newAttempts = (order.payment_attempts || 0) + 1;
      const attemptsRemaining = Math.max(0, 3 - newAttempts);

      // Increment payment_attempts, do NOT rollback order
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

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          attemptsRemaining,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // ── Handle success ──────────────────────────────────────────────────────
    const asaasPaymentId: string = paymentResult.id;
    const paymentStatus: string = paymentResult.status;

    if (paymentStatus !== 'CONFIRMED') {
      // Payment was created but not confirmed (e.g. pending analysis)
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
        JSON.stringify({
          success: true,
          payment: {
            id: asaasPaymentId,
            status: paymentStatus,
            installments: paymentResult.installmentCount || Number(installmentCount),
            value: Number(order.total_amount),
            netValue: paymentResult.netValue ? Number(paymentResult.netValue) : undefined,
          },
          cardInfo,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Payment CONFIRMED — update order to em_preparo
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

    // ── Post-payment tokenization fallback ──────────────────────────────────
    // Se a tokenização pré-pagamento não foi possível (ex: endpoint não habilitado),
    // tenta tokenizar agora para salvar o cartão para compras futuras
    if (!cardInfo && saveCard && creditCard && creditCardHolderInfo) {
      try {
        const tokenizeResponse = await fetch(
          `${baseUrl}/v3/creditCard/tokenizeCreditCard`,
          {
            method: 'POST',
            headers: asaasHeaders,
            body: JSON.stringify({
              customer: customer.id,
              creditCard: {
                holderName: creditCard.holderName,
                number: creditCard.number,
                expiryMonth: creditCard.expiryMonth,
                expiryYear: creditCard.expiryYear,
                ccv: creditCard.ccv,
              },
              creditCardHolderInfo: {
                name: creditCardHolderInfo.name,
                email: creditCardHolderInfo.email,
                cpfCnpj: creditCardHolderInfo.cpfCnpj,
                postalCode: creditCardHolderInfo.postalCode,
                addressNumber: creditCardHolderInfo.addressNumber,
                addressComplement: creditCardHolderInfo.addressComplement,
                phone: creditCardHolderInfo.phone,
                mobilePhone: creditCardHolderInfo.mobilePhone,
              },
            }),
          },
        );

        if (tokenizeResponse.ok) {
          const tokenizeResult = await tokenizeResponse.json();
          const newToken = tokenizeResult.creditCardToken;

          const cardBrand = paymentResult.creditCardBrandName || paymentResult.creditCard?.brand || '';
          const last4Digits = paymentResult.creditCard?.lastFourDigits || creditCard.number.slice(-4);

          await supabase.from('saved_payment_methods').insert({
            user_id: user.id,
            payment_method: 'credit_card',
            asaas_credit_card_token: newToken,
            card_brand: cardBrand,
            card_last4: last4Digits,
            cardholder_name: creditCard.holderName,
            card_exp_month: creditCard.expiryMonth,
            card_exp_year: String(Number(creditCard.expiryYear) % 100).padStart(2, '0'),
          });

          cardInfo = {
            brand: cardBrand,
            last4: last4Digits,
            creditCardToken: newToken,
            cardExpiryMonth: creditCard.expiryMonth,
            cardExpiryYear: creditCard.expiryYear,
          };
        } else {
          console.error('Fallback tokenization failed:', await tokenizeResponse.text());
        }
      } catch (tokenizeError) {
        console.error('Fallback tokenization error:', tokenizeError);
      }
    }

    // ── Atualiza brand no registro salvo pré-pagamento, se disponível ──────
    if (cardInfo && paymentResult.creditCardBrandName && !cardInfo.brand) {
      try {
        await supabase
          .from('saved_payment_methods')
          .update({ card_brand: paymentResult.creditCardBrandName })
          .eq('asaas_credit_card_token', cardInfo.creditCardToken);
        cardInfo.brand = paymentResult.creditCardBrandName;
      } catch {
        // non-fatal
      }
    }

    // ── Return success response ─────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        payment: {
          id: asaasPaymentId,
          status: paymentStatus,
          installments: paymentResult.installmentCount || Number(installmentCount),
          value: Number(order.total_amount),
          netValue: paymentResult.netValue ? Number(paymentResult.netValue) : undefined,
        },
        cardInfo,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Erro em create-payment-asaas:', error);
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
