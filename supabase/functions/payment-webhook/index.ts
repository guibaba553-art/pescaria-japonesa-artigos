import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
};

// Validation schema for webhook payload
const webhookPayloadSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
  }).optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get raw request body for signature verification
    const rawBody = await req.text();
    
    // Log headers for debugging
    const signature = req.headers.get('x-signature');
    const requestId = req.headers.get('x-request-id');
    console.log('Webhook headers - signature:', signature ? 'present' : 'missing', 'requestId:', requestId || 'missing');
    
    // Validação estrita de assinatura do webhook
    const webhookSecret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET');
    
    if (!webhookSecret || !signature || !requestId) {
      console.error('Missing webhook validation parameters', {
        hasWebhookSecret: !!webhookSecret,
        hasSignature: !!signature,
        hasRequestId: !!requestId
      });
      return new Response(
        JSON.stringify({ error: 'Missing webhook signature or request ID' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    try {
      // Verify HMAC signature
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(rawBody)
      );
      
      const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      if (signature !== expectedSignature) {
        console.error('Webhook signature validation failed', {
          received: signature,
          expected: expectedSignature
        });
        return new Response(
          JSON.stringify({ error: 'Invalid webhook signature' }),
          { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      console.log('Webhook signature verified successfully');
    } catch (error) {
      console.error('Error validating signature:', error);
      return new Response(
        JSON.stringify({ error: 'Signature validation error' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const payload = JSON.parse(rawBody);
    
    // Validate payload structure
    const validationResult = webhookPayloadSchema.safeParse(payload);
    if (!validationResult.success) {
      console.error('Invalid webhook payload structure:', validationResult.error.message);
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('Webhook received - Type:', payload.type, 'Request ID:', requestId);

    // Mercado Pago envia notificações com este formato
    if (payload.type === 'payment') {
      const paymentId = payload.data?.id;
      
      if (!paymentId) {
        console.error('Payment ID not found in webhook payload');
        return new Response(JSON.stringify({ error: 'Payment ID not found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('Processing payment notification for ID:', paymentId);

      // Buscar detalhes do pagamento no Mercado Pago
      const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });

      const paymentData = await paymentResponse.json();
      // Log sanitized payment info (no sensitive data)
      console.log('Payment status:', paymentData.status, 'Method:', paymentData.payment_method_id);

      // Se o pagamento foi aprovado, atualizar o pedido
      if (paymentData.status === 'approved') {
        console.log('Payment approved, updating order status');

        // Buscar o pedido pelo payment_id
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('id, status, total_amount, shipping_cost, shipping_address, delivery_type, user_id')
          .eq('payment_id', paymentId.toString())
          .maybeSingle();

        if (orderError) {
          console.error('Error finding order:', orderError);
          return new Response(JSON.stringify({ error: 'Order not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!order) {
          console.log('No order found for payment_id:', paymentId);
          return new Response(JSON.stringify({ message: 'No order found' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Idempotência: só processa se o pedido ainda NÃO está em_preparo (ou estado posterior)
        const alreadyProcessed = order.status !== 'aguardando_pagamento';

        // Atualizar status do pedido para em_preparo
        // Funciona para PIX, cartão de crédito e débito
        const { error: updateError } = await supabase
          .from('orders')
          .update({ status: 'em_preparo' })
          .eq('id', order.id);

        if (updateError) {
          console.error('Error updating order:', updateError);
          return new Response(JSON.stringify({ error: 'Failed to update order' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log(`Order ${order.id} updated successfully to em_preparo`);

        // Subtrair estoque após pagamento aprovado
        try {
          const stockResponse = await fetch(`${supabaseUrl}/functions/v1/subtract-stock`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orderId: order.id })
          });

          if (stockResponse.ok) {
            const stockData = await stockResponse.json();
            console.log('Stock subtracted successfully:', stockData.message);
          } else {
            console.error('Failed to subtract stock:', await stockResponse.text());
          }
        } catch (stockError) {
          console.error('Error calling subtract-stock function:', stockError);
        }

        // ----- E-mail de confirmação de compra (1x por pedido) -----
        if (!alreadyProcessed) {
          try {
            // Tenta buscar a NF-e (se já foi emitida)
            const { data: nfe } = await supabase
              .from('nfe_emissions')
              .select('nfe_number, nfe_xml_url, danfe_url, status')
              .eq('order_id', order.id)
              .eq('status', 'success')
              .order('emitted_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            // Buscar nome do cliente e e-mail
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', order.user_id)
              .maybeSingle();

            const { data: { user: userInfo } } = await supabase.auth.admin.getUserById(order.user_id);
            const recipientEmail = userInfo?.email;

            if (recipientEmail) {
              const formatBRL = (n: number) =>
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                  .format(Number(n) || 0);
              const methodLabel: Record<string, string> = {
                pix: 'PIX',
                credit_card: 'Cartão de crédito',
                debit_card: 'Cartão de débito',
                ticket: 'Boleto',
              };
              const pmId = paymentData.payment_method_id || '';
              const paymentMethodLabel =
                methodLabel[paymentData.payment_type_id] ||
                methodLabel[pmId] ||
                (pmId ? pmId.toUpperCase() : 'Online');

              await supabase.functions.invoke('send-transactional-email', {
                body: {
                  templateName: 'order-confirmation',
                  recipientEmail,
                  idempotencyKey: `order-confirmation-${order.id}`,
                  templateData: {
                    customerName: profile?.full_name?.split(' ')[0] ?? null,
                    orderNumber: String(order.id).slice(0, 8).toUpperCase(),
                    totalAmount: formatBRL(Number(order.total_amount)),
                    paymentMethod: paymentMethodLabel,
                    deliveryType: order.delivery_type === 'pickup' ? 'Retirada na loja' : 'Entrega',
                    shippingAddress: order.shipping_address,
                    trackingUrl: 'https://japaspesca.com.br/conta',
                    nfeUrl: nfe?.danfe_url || nfe?.nfe_xml_url || null,
                    nfeNumber: nfe?.nfe_number || null,
                  },
                },
              });
              console.log(`Confirmation email enqueued for order ${order.id} → ${recipientEmail}`);
            } else {
              console.warn(`No email found for user ${order.user_id}, skipping confirmation email`);
            }
          } catch (emailErr) {
            // Nunca falhar o webhook por causa de email
            console.error('Erro ao enviar e-mail de confirmação:', emailErr);
          }
        } else {
          console.log(`Order ${order.id} já estava processado, e-mail não reenviado`);
        }
      } else {
        console.log('Payment not approved, status:', paymentData.status);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in payment-webhook:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});