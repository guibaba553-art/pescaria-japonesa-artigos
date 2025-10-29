import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  orderId: z.string().uuid('Invalid order ID format')
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Validate input
    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input', 
          details: validationResult.error.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { orderId } = validationResult.data;
    console.log('Verificando pagamento para pedido:', orderId);
    
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token for authorization checks
    const userToken = authHeader.replace('Bearer ', '');
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(userToken);
    
    if (authError || !user) {
      console.error('Invalid token:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar o pedido e verificar autorização
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, payment_id, status, user_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Erro ao buscar pedido:', orderError);
      return new Response(
        JSON.stringify({ error: 'Pedido não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check authorization: user must own the order OR be admin/employee
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = roles?.some(r => r.role === 'admin' || r.role === 'employee');
    
    if (!isAdmin && order.user_id !== user.id) {
      console.error('User not authorized to access this order');
      return new Response(
        JSON.stringify({ error: 'Forbidden: You do not have permission to access this order' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!order.payment_id) {
      console.error('Pedido não tem payment_id');
      return new Response(
        JSON.stringify({ error: 'Pedido sem ID de pagamento' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar status do pagamento no Mercado Pago
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    console.log('Buscando pagamento no Mercado Pago:', order.payment_id);

    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${order.payment_id}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    );

    if (!paymentResponse.ok) {
      console.error('Erro ao buscar pagamento no Mercado Pago:', paymentResponse.status);
      return new Response(
        JSON.stringify({ error: 'Erro ao consultar Mercado Pago' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paymentData = await paymentResponse.json();
    console.log('Status do pagamento:', paymentData.status);

    // Se pagamento aprovado, atualizar o pedido
    if (paymentData.status === 'approved' && order.status === 'aguardando_pagamento') {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'em_preparo' })
        .eq('id', order.id);

      if (updateError) {
        console.error('Erro ao atualizar pedido:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erro ao atualizar pedido' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Pedido atualizado com sucesso');

      // Subtrair estoque após pagamento aprovado
      try {
        const stockResponse = await fetch(`${supabaseUrl}/functions/v1/subtract-stock`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ orderId: order.id })
        });

        if (stockResponse.ok) {
          const stockData = await stockResponse.json();
          console.log('Estoque subtraído:', stockData.message);
        } else {
          console.error('Erro ao subtrair estoque:', await stockResponse.text());
        }
      } catch (stockError) {
        console.error('Erro ao chamar subtract-stock:', stockError);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Pagamento aprovado! Pedido atualizado para "Em Preparo".',
          status: 'approved' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Retornar status atual
    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Status do pagamento: ${paymentData.status}`,
        status: paymentData.status,
        updated: false
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro em verify-payment:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
