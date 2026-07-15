import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate CRON_SECRET to prevent unauthorized access
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('authorization');

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error('Unauthorized cleanup attempt');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Deletar mensagens com mais de 24 horas
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: messagesData, error: messagesError } = await supabaseClient
      .from('chat_messages')
      .delete()
      .lt('created_at', twentyFourHoursAgo);

    if (messagesError) {
      console.error('Error deleting old messages:', messagesError);
    } else {
      console.log('Successfully deleted old messages');
    }

    // Cancelar pedidos aguardando pagamento há mais de 3 dias (em vez de deletar)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    
    // Primeiro buscar os pedidos que serão cancelados
    const { data: ordersToCancel, error: fetchError } = await supabaseClient
      .from('orders')
      .select('id')
      .eq('status', 'aguardando_pagamento')
      .lt('created_at', threeDaysAgo);

    if (fetchError) {
      console.error('Error fetching old orders:', fetchError);
    } else if (ordersToCancel && ordersToCancel.length > 0) {
      console.log(`Found ${ordersToCancel.length} old unpaid orders to cancel`);

      // Liberar reservas de estoque e promo_limits para cada pedido
      for (const order of ordersToCancel) {
        try {
          await supabaseClient.rpc('release_stock_reservation', { p_order_id: order.id });
        } catch {
          // RPC pode não existir no ambiente
        }
        try {
          const { data: items } = await supabaseClient
            .from('order_items')
            .select('product_id, variation_id, quantity')
            .eq('order_id', order.id);
          if (items && items.length > 0) {
            await supabaseClient.rpc('release_promo_limits', {
              p_items: items.map((i: any) => ({
                product_id: i.product_id,
                variation_id: i.variation_id,
                quantity: i.quantity,
              })),
            });
          }
        } catch {
          // RPC pode não existir no ambiente
        }
      }

      // Cancelar os pedidos (setar status como 'cancelado' — NÃO deletar)
      const orderIds = ordersToCancel.map(o => o.id);
      const { error: ordersError } = await supabaseClient
        .from('orders')
        .update({ status: 'cancelado', cancellation_reason: 'prazo_expirado' })
        .in('id', orderIds)
        .eq('status', 'aguardando_pagamento'); // re-check para race condition

      if (ordersError) {
        console.error('Error cancelling old orders:', ordersError);
      } else {
        console.log(`Successfully cancelled ${ordersToCancel.length} old unpaid orders`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Cleanup completed successfully',
        messagesDeletedBefore: twentyFourHoursAgo,
        ordersCancelledBefore: threeDaysAgo,
        cancelledOrdersCount: ordersToCancel?.length || 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Cleanup error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
}

if (!Deno.env.get("DENO_TEST")) {
  Deno.serve((req) => handleRequest(req));
}
