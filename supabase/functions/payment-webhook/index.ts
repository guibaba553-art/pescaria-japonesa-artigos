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
    
    // Validate webhook signature for security
    const signature = req.headers.get('x-signature');
    const requestId = req.headers.get('x-request-id');
    const webhookSecret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET');
    
    if (!signature || !requestId) {
      console.error('Webhook signature validation failed: Missing headers');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify HMAC signature if webhook secret is configured
    if (webhookSecret) {
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
        console.error('Webhook signature validation failed: Invalid signature');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.log('Webhook signature verified successfully');
    } else {
      console.warn('MERCADO_PAGO_WEBHOOK_SECRET not configured - skipping signature verification');
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
          .select('id, status')
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