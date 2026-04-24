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

    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validationResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { orderId } = validationResult.data;
    console.log('[subtract-stock] Processing order:', orderId);

    // Service role faz a operação. Webhook do Mercado Pago não tem JWT do usuário,
    // então autorizamos pelo service role key (a função só é chamada por edge functions internas).
    const authHeader = req.headers.get('Authorization') ?? '';
    const isServiceCall = authHeader.includes(supabaseServiceKey);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Se NÃO for chamada interna, exige usuário admin/employee
    if (!isServiceCall) {
      const userToken = authHeader.replace('Bearer ', '');
      if (!userToken) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser(userToken);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id);
      const isAuthorized = roles?.some(r => r.role === 'admin' || r.role === 'employee');
      if (!isAuthorized) {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Buscar itens do pedido
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('product_id, variation_id, quantity')
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('[subtract-stock] Error fetching items:', itemsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch order items' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!orderItems || orderItems.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No items found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Aplicar movimentação atômica para cada item
    const results = [];
    const errors = [];

    for (const item of orderItems) {
      // Compatibilidade: se variation_id null mas product_id aponta para uma variação
      let variationId: string | null = item.variation_id ?? null;
      let productId: string = item.product_id;

      if (!variationId) {
        const { data: maybeVariation } = await supabase
          .from('product_variations')
          .select('id, product_id')
          .eq('id', item.product_id)
          .maybeSingle();
        if (maybeVariation) {
          variationId = maybeVariation.id;
          productId = maybeVariation.product_id;
        }
      }

      const { data, error } = await supabase.rpc('apply_stock_movement', {
        p_product_id: productId,
        p_variation_id: variationId,
        p_quantity_delta: -Math.abs(item.quantity), // sempre negativo (saída)
        p_movement_type: 'sale',
        p_order_id: orderId,
        p_reason: `Venda online - pedido ${orderId.slice(0, 8)}`,
      });

      if (error) {
        console.error('[subtract-stock] RPC error:', error);
        errors.push({ product_id: productId, error: error.message });
      } else {
        results.push(data);
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        processed: results.length,
        errors,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[subtract-stock] Fatal:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
