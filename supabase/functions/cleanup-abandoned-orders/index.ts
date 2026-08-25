import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupTarget {
  id: string;
}

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

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: abandoned } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'aguardando_pagamento')
      .is('payment_id', null)
      .is('asaas_payment_id', null)
      .lt('created_at', fiveMinutesAgo);

    const { data: zombies } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'aguardando_pagamento')
      .not('asaas_payment_id', 'is', null)
      .lt('created_at', twoHoursAgo);

    const targets: CleanupTarget[] = [
      ...((abandoned ?? []) as CleanupTarget[]),
      ...((zombies ?? []).filter((z) => !(abandoned ?? []).some((a) => a.id === z.id)) as CleanupTarget[]),
    ];

    const cancelled: string[] = [];
    const failed: { orderId: string; error: string }[] = [];

    for (const target of targets) {
      try {
        await supabase.rpc('release_stock_reservation', { p_order_id: target.id });

        const { data: items } = await supabase
          .from('order_items')
          .select('product_id, variation_id, quantity')
          .eq('order_id', target.id);
        if (items && items.length > 0) {
          await supabase.rpc('release_promo_limits', {
            p_items: items.map((i: any) => ({
              product_id: i.product_id,
              variation_id: i.variation_id,
              quantity: i.quantity,
            })),
          });
        }

        const { error: updateErr } = await supabase
          .from('orders')
          .update({ status: 'cancelado', cancellation_reason: 'cancelado_pelo_cliente' })
          .eq('id', target.id);

        if (updateErr) {
          failed.push({ orderId: target.id, error: updateErr.message });
        } else {
          cancelled.push(target.id);
        }
      } catch (targetErr) {
        failed.push({ orderId: target.id, error: String(targetErr) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, cancelled, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('cleanup-abandoned-orders error', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

if (!Deno.env.get("DENO_TEST")) {
  serve((req) => handleRequest(req));
}
