import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ME_API_BASE = 'https://melhorenvio.com.br/api/v2';
const CEP_ORIGEM = '78556100'; // Sinop - MT
const USER_AGENT = 'JAPAS Pesca (robertobaba2@gmail.com)';

const productSchema = z.object({
  id: z.string().optional(),
  width: z.number().min(11).max(105),
  height: z.number().min(2).max(105),
  length: z.number().min(11).max(105),
  weight: z.number().min(0.01).max(30),
  insurance_value: z.number().min(0).default(0),
  quantity: z.number().int().min(1).default(1),
});

const shippingRequestSchema = z.object({
  cepDestino: z.string().regex(/^\d{8}$/, 'CEP must be exactly 8 digits'),
  // Backwards-compatible single-product fields
  peso: z.number().min(1).max(30000).optional(),
  comprimento: z.number().min(11).max(105).optional(),
  altura: z.number().min(2).max(105).optional(),
  largura: z.number().min(11).max(105).optional(),
  formato: z.number().int().min(1).max(3).optional(),
  diametro: z.number().optional(),
  // New: list of products (preferred)
  products: z.array(productSchema).optional(),
  insurance_value: z.number().min(0).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
    if (!token) {
      console.error('MELHOR_ENVIO_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Shipping provider not configured', success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawData = await req.json();
    const validation = shippingRequestSchema.safeParse(rawData);
    if (!validation.success) {
      console.error('Validation failed:', validation.error.issues);
      return new Response(
        JSON.stringify({
          error: 'Invalid input',
          details: validation.error.errors.map((e) => e.message),
          success: false,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = validation.data;

    // Build products array for Melhor Envio (weight in kg, dims in cm)
    let products;
    if (data.products && data.products.length > 0) {
      products = data.products.map((p, idx) => ({
        id: p.id || String(idx + 1),
        width: p.width,
        height: p.height,
        length: p.length,
        weight: p.weight,
        insurance_value: p.insurance_value || 0,
        quantity: p.quantity,
      }));
    } else {
      // Fallback to legacy single-package input
      products = [
        {
          id: '1',
          width: data.largura || 20,
          height: data.altura || 20,
          length: data.comprimento || 30,
          weight: (data.peso || 500) / 1000, // grams -> kg
          insurance_value: data.insurance_value || 0,
          quantity: 1,
        },
      ];
    }

    console.log('Calculating shipping via Melhor Envio:', {
      cepDestino: data.cepDestino.substring(0, 5) + 'XXX',
      productsCount: products.length,
    });

    const meResponse = await fetch(`${ME_API_BASE}/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        from: { postal_code: CEP_ORIGEM },
        to: { postal_code: data.cepDestino },
        products,
      }),
    });

    if (!meResponse.ok) {
      const errText = await meResponse.text();
      console.error('Melhor Envio error:', meResponse.status, errText);
      return new Response(
        JSON.stringify({
          error: 'Failed to calculate shipping',
          status: meResponse.status,
          success: false,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const meData = await meResponse.json();

    // Filter and normalize options
    const options = (Array.isArray(meData) ? meData : [])
      .filter((opt: any) => !opt.error && opt.price)
      .map((opt: any) => ({
        codigo: String(opt.id),
        nome: `${opt.company?.name || ''} ${opt.name || ''}`.trim(),
        valor: parseFloat(opt.price),
        prazoEntrega: opt.delivery_time || opt.delivery_range?.max || 0,
        company: opt.company?.name || null,
        servico: opt.name || null,
      }));

    // Add pickup option
    options.push({
      codigo: 'RETIRADA',
      nome: 'Retirar na Loja',
      valor: 0,
      prazoEntrega: 0,
      company: 'Loja',
      servico: 'Retirada',
    });

    console.log('Shipping options calculated:', options.length);

    return new Response(
      JSON.stringify({ success: true, options }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error calculating shipping:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: 'Error calculating shipping', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
