import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate CRON_SECRET to prevent unauthorized access
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('authorization');

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('Unauthorized cleanup attempt');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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

    // Deletar pedidos aguardando pagamento há mais de 3 dias
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    
    // Primeiro buscar os pedidos que serão deletados
    const { data: ordersToDelete, error: fetchError } = await supabaseClient
      .from('orders')
      .select('id')
      .eq('status', 'aguardando_pagamento')
      .lt('created_at', threeDaysAgo);

    if (fetchError) {
      console.error('Error fetching old orders:', fetchError);
    } else if (ordersToDelete && ordersToDelete.length > 0) {
      console.log(`Found ${ordersToDelete.length} old unpaid orders to delete`);
      
      // Deletar os itens dos pedidos primeiro (foreign key)
      const orderIds = ordersToDelete.map(o => o.id);
      const { error: itemsError } = await supabaseClient
        .from('order_items')
        .delete()
        .in('order_id', orderIds);

      if (itemsError) {
        console.error('Error deleting order items:', itemsError);
      }

      // Depois deletar os pedidos
      const { error: ordersError } = await supabaseClient
        .from('orders')
        .delete()
        .in('id', orderIds);

      if (ordersError) {
        console.error('Error deleting old orders:', ordersError);
      } else {
        console.log(`Successfully deleted ${ordersToDelete.length} old unpaid orders`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Cleanup completed successfully',
        messagesDeletedBefore: twentyFourHoursAgo,
        ordersDeletedBefore: threeDaysAgo,
        deletedOrdersCount: ordersToDelete?.length || 0
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
});