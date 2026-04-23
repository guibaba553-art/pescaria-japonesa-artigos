import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ME_API_BASE = 'https://melhorenvio.com.br/api/v2';
const USER_AGENT = 'JAPAS Pesca (robertobaba2@gmail.com)';

// Origem fixa - dados da loja
const FROM_ADDRESS = {
  name: 'JAPAS Pesca',
  phone: '5566996579671',
  email: 'robertobaba2@gmail.com',
  document: '', // CPF/CNPJ deve ser preenchido nas configurações da conta Melhor Envio
  address: 'Endereço da loja', // Será sobrescrito pelo perfil ME
  complement: '',
  number: 'S/N',
  district: 'Centro',
  city: 'Sinop',
  state_abbr: 'MT',
  postal_code: '78556100',
  country_id: 'BR',
};

const labelRequestSchema = z.object({
  action: z.enum(['create_cart', 'checkout', 'generate', 'print', 'full_flow']),
  orderId: z.string().uuid().optional(),
  serviceId: z.string().or(z.number()).optional(),
  orderIds: z.array(z.string()).optional(), // ME order IDs (returned from cart)
  // For full_flow:
  meServiceId: z.number().optional(),
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

    // Validar JWT do usuário
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

    // Verificar se é admin ou employee
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);

    const isAuthorized = roles?.some(
      (r) => r.role === 'admin' || r.role === 'employee'
    );
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const validation = labelRequestSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, orderId, meServiceId, orderIds } = validation.data;

    const meHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': USER_AGENT,
    };

    // FULL FLOW: cria carrinho, faz checkout (compra) e gera etiqueta para um pedido
    if (action === 'full_flow') {
      if (!orderId || !meServiceId) {
        return new Response(
          JSON.stringify({ error: 'orderId and meServiceId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar pedido + cliente + itens
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('*, order_items(*, products(*))')
        .eq('id', orderId)
        .single();

      if (orderErr || !order) {
        return new Response(
          JSON.stringify({ error: 'Order not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar profile do cliente
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', order.user_id)
        .single();

      // Parse endereço (formato livre — assume "rua, numero, bairro, cidade/UF")
      const addressParts = (order.shipping_address || '').split(',').map((s: string) => s.trim());

      const cartPayload = {
        service: meServiceId,
        from: FROM_ADDRESS,
        to: {
          name: profile?.full_name || 'Cliente',
          phone: profile?.phone || '',
          email: '',
          document: profile?.cpf || '',
          address: addressParts[0] || order.shipping_address,
          complement: '',
          number: addressParts[1] || 'S/N',
          district: addressParts[2] || 'Centro',
          city: addressParts[3]?.split('/')[0]?.trim() || 'Cidade',
          state_abbr: addressParts[3]?.split('/')[1]?.trim() || 'MT',
          postal_code: order.shipping_cep,
          country_id: 'BR',
        },
        products: order.order_items.map((item: any) => ({
          name: item.products?.name || 'Produto',
          quantity: item.quantity,
          unitary_value: item.price_at_purchase,
        })),
        volumes: [
          {
            height: 20,
            width: 20,
            length: 30,
            weight: 0.5,
          },
        ],
        options: {
          insurance_value: order.total_amount,
          receipt: false,
          own_hand: false,
          reverse: false,
          non_commercial: true,
          invoice: { key: '' },
          platform: 'JAPAS Pesca',
          tags: [{ tag: order.id, url: null }],
        },
      };

      // 1. Adicionar ao carrinho
      const cartRes = await fetch(`${ME_API_BASE}/me/cart`, {
        method: 'POST',
        headers: meHeaders,
        body: JSON.stringify(cartPayload),
      });
      const cartData = await cartRes.json();
      if (!cartRes.ok) {
        console.error('Cart error:', cartData);
        return new Response(
          JSON.stringify({ error: 'Failed to add to cart', details: cartData }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const meOrderId = cartData.id;

      // 2. Checkout (compra real - debita saldo)
      const checkoutRes = await fetch(`${ME_API_BASE}/me/shipment/checkout`, {
        method: 'POST',
        headers: meHeaders,
        body: JSON.stringify({ orders: [meOrderId] }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) {
        console.error('Checkout error:', checkoutData);
        return new Response(
          JSON.stringify({ error: 'Failed to checkout', details: checkoutData }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 3. Gerar etiqueta
      const generateRes = await fetch(`${ME_API_BASE}/me/shipment/generate`, {
        method: 'POST',
        headers: meHeaders,
        body: JSON.stringify({ orders: [meOrderId] }),
      });
      const generateData = await generateRes.json();

      // 4. Obter URL de impressão
      const printRes = await fetch(`${ME_API_BASE}/me/shipment/print`, {
        method: 'POST',
        headers: meHeaders,
        body: JSON.stringify({ mode: 'private', orders: [meOrderId] }),
      });
      const printData = await printRes.json();

      // 5. Buscar dados do pedido para pegar tracking
      const trackRes = await fetch(`${ME_API_BASE}/me/orders/${meOrderId}`, {
        headers: meHeaders,
      });
      const trackData = await trackRes.json();

      const trackingCode = trackData?.tracking || null;

      // Atualizar pedido com tracking_code
      if (trackingCode) {
        await supabase
          .from('orders')
          .update({ tracking_code: trackingCode })
          .eq('id', orderId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          meOrderId,
          trackingCode,
          labelUrl: printData?.url || null,
          generated: generateData,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Action not implemented' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Label error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
