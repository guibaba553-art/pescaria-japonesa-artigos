import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ME_API_BASE = 'https://melhorenvio.com.br/api/v2';
const USER_AGENT = 'JAPAS Pesca (robertobaba2@gmail.com)';

const trackingSchema = z.object({
  orderId: z.string().uuid().optional(),
  trackingCode: z.string().min(3).max(50).optional(),
}).refine((d) => d.orderId || d.trackingCode, {
  message: 'orderId or trackingCode required',
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Shipping provider not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const validation = trackingSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let trackingCode = validation.data.trackingCode;

    // Se vier orderId, buscar o tracking do pedido (com checagem de permissão)
    if (validation.data.orderId && !trackingCode) {
      const { data: order, error } = await supabase
        .from('orders')
        .select('tracking_code, user_id')
        .eq('id', validation.data.orderId)
        .single();

      if (error || !order) {
        return new Response(
          JSON.stringify({ error: 'Order not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verificar se é dono ou admin/employee
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id);

      const isStaff = roles?.some((r) => r.role === 'admin' || r.role === 'employee');
      if (order.user_id !== userData.user.id && !isStaff) {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      trackingCode = order.tracking_code || undefined;
      if (!trackingCode) {
        return new Response(
          JSON.stringify({ success: false, error: 'No tracking code yet' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Consultar tracking via Melhor Envio
    const trackRes = await fetch(`${ME_API_BASE}/me/shipment/tracking`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ orders: [trackingCode] }),
    });

    const trackData = await trackRes.json();

    if (!trackRes.ok) {
      console.error('Tracking error:', trackData);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch tracking', details: trackData }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, trackingCode, tracking: trackData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Tracking error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
