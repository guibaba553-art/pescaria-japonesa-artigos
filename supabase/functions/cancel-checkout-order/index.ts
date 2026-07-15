import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { orderId } = await req.json();
    if (!orderId || typeof orderId !== 'string') {
      return new Response(JSON.stringify({ error: 'orderId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify ownership and current status
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, user_id, status')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only cancel orders that are still awaiting payment
    if (order.status !== 'aguardando_pagamento') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Order already paid or processed',
        status: order.status,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Liberar reservas de estoque
    await supabase.rpc('release_stock_reservation', { p_order_id: orderId });

    // Liberar limite de promoções consumido
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, variation_id, quantity')
      .eq('order_id', orderId);
    if (items && items.length > 0) {
      await supabase.rpc('release_promo_limits', {
        p_items: items.map((i: any) => ({
          product_id: i.product_id,
          variation_id: i.variation_id,
          quantity: i.quantity,
        })),
      });
    }

    // Cancel the order: set status to 'cancelado' (do NOT delete — orders must have full history)
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'cancelado', cancellation_reason: 'cancelado_pelo_cliente' })
      .eq('id', orderId);

    if (updateErr) {
      console.error('Cancel order error', updateErr);
      return new Response(JSON.stringify({ error: 'Failed to cancel order' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, cancelled: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('cancel-checkout-order error', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

if (!Deno.env.get("DENO_TEST")) {
  serve((req) => handleRequest(req));
}
