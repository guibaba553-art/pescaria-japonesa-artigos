import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const bodySchema = z.object({
  orderId: z.string().uuid(),
  items: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(200),
    quantity: z.number().int().positive(),
    price: z.number().positive(),
    variationId: z.string().uuid().optional(),
  })).min(1),
  shippingCost: z.number().nonnegative().default(0),
  successUrl: z.string().url(),
  failureUrl: z.string().url(),
  pendingUrl: z.string().url(),
  payerEmail: z.string().email().optional(),
});

serve(async (req) => {
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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(JSON.stringify({
        error: 'Invalid input',
        details: parsed.error.errors.map(e => e.message),
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const data = parsed.data;

    // Verify order ownership
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('user_id, total_amount')
      .eq('id', data.orderId)
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

    // Verify prices server-side
    let verified = 0;
    for (const item of data.items) {
      let price: number;
      if (item.variationId) {
        const { data: prod } = await supabase
          .from('products').select('on_sale, sale_price, price').eq('id', item.id).single();
        const { data: variation } = await supabase
          .from('product_variations').select('price').eq('id', item.variationId).eq('product_id', item.id).single();
        if (!prod || !variation) {
          return new Response(JSON.stringify({ error: 'Invalid product/variation' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        let vp = Number(variation.price);
        if (prod.on_sale && prod.sale_price !== null) {
          const discount = 1 - (Number(prod.sale_price) / Number(prod.price));
          vp = vp * (1 - discount);
        }
        price = vp;
      } else {
        const { data: prod } = await supabase
          .from('products').select('price, sale_price, on_sale').eq('id', item.id).single();
        if (!prod) {
          return new Response(JSON.stringify({ error: 'Invalid product' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        price = prod.on_sale && prod.sale_price ? Number(prod.sale_price) : Number(prod.price);
      }
      if (Math.abs(item.price - price) > 0.01) {
        return new Response(JSON.stringify({ error: 'Price verification failed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      verified += price * item.quantity;
    }
    verified += data.shippingCost;

    if (Math.abs(Number(order.total_amount) - verified) > 0.5) {
      console.error('Total mismatch', order.total_amount, verified);
      return new Response(JSON.stringify({ error: 'Total mismatch' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    if (!accessToken) throw new Error('MERCADO_PAGO_ACCESS_TOKEN not configured');

    // Build preference items (include shipping as a line item to keep totals exact)
    const prefItems = data.items.map(it => ({
      id: it.variationId || it.id,
      title: it.name.substring(0, 200),
      quantity: it.quantity,
      unit_price: Number(Number(it.price).toFixed(2)),
      currency_id: 'BRL',
    }));
    if (data.shippingCost > 0) {
      prefItems.push({
        id: 'shipping',
        title: 'Frete',
        quantity: 1,
        unit_price: Number(data.shippingCost.toFixed(2)),
        currency_id: 'BRL',
      });
    }

    const preferenceBody = {
      items: prefItems,
      payer: data.payerEmail ? { email: data.payerEmail } : undefined,
      back_urls: {
        success: data.successUrl,
        failure: data.failureUrl,
        pending: data.pendingUrl,
      },
      auto_return: 'approved',
      external_reference: data.orderId,
      // Notification webhook (existing function)
      notification_url: `${supabaseUrl}/functions/v1/payment-webhook`,
      // Allow all default methods (Google Pay shows up automatically on supported browsers)
      payment_methods: {
        excluded_payment_types: [],
      },
      statement_descriptor: 'JAPA PESCA',
    };

    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `pref-${data.orderId}-${Date.now()}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    const respData = await resp.json();
    if (!resp.ok) {
      console.error('MP preference error', resp.status, respData);
      return new Response(JSON.stringify({
        error: 'Erro ao criar checkout',
        details: respData.message || 'Erro desconhecido',
      }), { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const isTest = accessToken.startsWith('TEST-');
    const initPoint = isTest ? respData.sandbox_init_point : respData.init_point;

    // Save preference id on the order
    await supabase
      .from('orders')
      .update({ payment_id: respData.id })
      .eq('id', data.orderId);

    return new Response(JSON.stringify({
      success: true,
      initPoint,
      preferenceId: respData.id,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('create-checkout-preference error', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
