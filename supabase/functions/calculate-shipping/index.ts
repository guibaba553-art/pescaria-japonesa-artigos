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
  width: z.number().min(11),
  height: z.number().min(2),
  length: z.number().min(11),
  weight: z.number().min(0.01).max(30),
  insurance_value: z.number().min(0).default(0),
  quantity: z.number().int().min(1).default(1),
});

const shippingRequestSchema = z.object({
  cepDestino: z.string().regex(/^\d{8}$/, 'CEP must be exactly 8 digits'),
  // Backwards-compatible single-product fields
  peso: z.number().min(1).max(30000).optional(),
  comprimento: z.number().min(11).optional(),
  altura: z.number().min(2).optional(),
  largura: z.number().min(11).optional(),
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
    const frenetToken = Deno.env.get('FRENET_TOKEN');
    if (!token && !frenetToken) {
      console.error('No shipping provider configured');
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

    console.log('Calculating shipping:', {
      cepDestino: data.cepDestino.substring(0, 5) + 'XXX',
      productsCount: products.length,
      providers: { me: !!token, frenet: !!frenetToken },
    });

    // ---------- Melhor Envio ----------
    const fetchMelhorEnvio = async (): Promise<any[]> => {
      if (!token) return [];
      try {
        const r = await fetch(`${ME_API_BASE}/me/shipment/calculate`, {
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
        if (!r.ok) {
          console.error('Melhor Envio error:', r.status, await r.text());
          return [];
        }
        const arr = await r.json();
        return (Array.isArray(arr) ? arr : [])
          .filter((opt: any) => !opt.error && opt.price)
          .map((opt: any) => ({
            codigo: `me-${opt.id}`,
            nome: `${opt.company?.name || ''} ${opt.name || ''}`.trim(),
            valor: parseFloat(opt.price),
            prazoEntrega: opt.delivery_time || opt.delivery_range?.max || 0,
            company: opt.company?.name || null,
            servico: opt.name || null,
            provider: 'melhor_envio',
          }));
      } catch (e) {
        console.error('Melhor Envio exception:', e);
        return [];
      }
    };

    // ---------- Frenet ----------
    const fetchFrenet = async (): Promise<any[]> => {
      if (!frenetToken) return [];
      try {
        // Frenet aceita múltiplas embalagens via ShippingItemArray
        const ShippingItemArray = products.map((p) => ({
          Weight: Math.max(0.01, p.weight), // kg
          Length: Math.max(11, Math.round(p.length)),
          Height: Math.max(2, Math.round(p.height)),
          Width: Math.max(11, Math.round(p.width)),
          Quantity: p.quantity,
          SKU: p.id,
          Category: 'Pesca',
          isFragile: false,
        }));
        const totalInsurance = products.reduce(
          (s, p) => s + (p.insurance_value || 0) * (p.quantity || 1),
          0,
        );
        const r = await fetch('https://api.frenet.com.br/shipping/quote', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            token: frenetToken,
          },
          body: JSON.stringify({
            SellerCEP: CEP_ORIGEM,
            RecipientCEP: data.cepDestino,
            ShipmentInvoiceValue: totalInsurance || 100,
            ShippingItemArray,
            RecipientCountry: 'BR',
          }),
        });
        if (!r.ok) {
          console.error('Frenet error:', r.status, await r.text());
          return [];
        }
        const json = await r.json();
        const services: any[] = json?.ShippingSevicesArray || json?.ShippingSeviceAvailableArray || [];
        return services
          .filter((s: any) => !s.Error && s.ShippingPrice)
          .map((s: any) => ({
            codigo: `frenet-${s.ServiceCode || s.Carrier}-${s.ServiceDescription}`.replace(/\s+/g, '_'),
            nome: `${s.Carrier || ''} ${s.ServiceDescription || ''}`.trim(),
            valor: parseFloat(String(s.ShippingPrice).replace(',', '.')),
            prazoEntrega: parseInt(s.DeliveryTime, 10) || 0,
            company: s.Carrier || null,
            servico: s.ServiceDescription || null,
            provider: 'frenet',
          }));
      } catch (e) {
        console.error('Frenet exception:', e);
        return [];
      }
    };

    const [meOptions, frenetOptions] = await Promise.all([fetchMelhorEnvio(), fetchFrenet()]);
    const allOptions = [...meOptions, ...frenetOptions];

    // Deduplica: para mesma transportadora+serviço, mantém o mais barato
    const dedupMap = new Map<string, any>();
    for (const opt of allOptions) {
      const key = `${(opt.company || '').toLowerCase()}::${(opt.servico || '').toLowerCase()}`;
      const existing = dedupMap.get(key);
      if (!existing || opt.valor < existing.valor) dedupMap.set(key, opt);
    }
    const options = Array.from(dedupMap.values()).sort((a, b) => a.valor - b.valor);

    // Add pickup option
    options.push({
      codigo: 'RETIRADA',
      nome: 'Retirar na Loja',
      valor: 0,
      prazoEntrega: 0,
      company: 'Loja',
      servico: 'Retirada',
      provider: 'pickup',
    });

    console.log('Shipping options calculated:', {
      total: options.length,
      me: meOptions.length,
      frenet: frenetOptions.length,
    });

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
