import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    
    console.log('Webhook received:', JSON.stringify(payload, null, 2));

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
      console.log('Payment data from Mercado Pago:', JSON.stringify(paymentData, null, 2));

      // Se o pagamento foi aprovado, atualizar o pedido
      if (paymentData.status === 'approved') {
        console.log('Payment approved, updating order status');
        console.log('Payment method:', paymentData.payment_method_id, 'Type:', paymentData.payment_type_id);

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

        console.log(`Order ${order.id} updated successfully to em_preparo for payment method: ${paymentData.payment_method_id}`);
      } else {
        console.log('Payment not approved, status:', paymentData.status);
        
        // Log de pagamentos rejeitados para debug
        if (paymentData.status === 'rejected') {
          console.log('Payment rejected, reason:', paymentData.status_detail);
        }
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