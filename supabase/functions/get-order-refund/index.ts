import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, payment_method')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Pedido não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Acesso não autorizado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, cpf')
      .eq('id', order.user_id)
      .single();

    const { data: refunds, error: refundError } = await supabase
      .from('payment_refunds')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1);

    if (refundError) {
      console.error('Error fetching refund:', refundError);
      return new Response(JSON.stringify({ error: 'Erro ao buscar reembolso' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!refunds || refunds.length === 0) {
      return new Response(JSON.stringify({ refund: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const refund = refunds[0];
    const transactionReceiptUrl = refund.gateway_response?.transactionReceiptUrl as string | undefined;

    return new Response(
      JSON.stringify({
        refund: {
          id: refund.id,
          amount: refund.amount,
          date: refund.created_at,
          gatewayRefundId: refund.gateway_refund_id,
          reason: refund.reason,
          status: refund.status,
          transactionReceiptUrl: transactionReceiptUrl || null,
          customerName: profile?.full_name || null,
          customerCpf: profile?.cpf || null,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
