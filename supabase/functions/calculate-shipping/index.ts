import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema for shipping calculation
const shippingRequestSchema = z.object({
  cepDestino: z.string().regex(/^\d{8}$/, 'CEP must be exactly 8 digits'),
  peso: z.number().min(1, 'Weight must be at least 1g').max(30000, 'Weight must not exceed 30kg'),
  comprimento: z.number().min(11, 'Length must be at least 11cm').max(105, 'Length must not exceed 105cm'),
  altura: z.number().min(2, 'Height must be at least 2cm').max(105, 'Height must not exceed 105cm'),
  largura: z.number().min(11, 'Width must be at least 11cm').max(105, 'Width must not exceed 105cm'),
  formato: z.number().int().min(1).max(3, 'Format must be 1 (box), 2 (roll), or 3 (envelope)'),
  diametro: z.number().optional(),
});

interface ShippingRequest {
  cepDestino: string;
  peso: number;
  formato: number;
  comprimento: number;
  altura: number;
  largura: number;
  diametro?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawData = await req.json();
    
    // Validate input data
    const validationResult = shippingRequestSchema.safeParse(rawData);
    if (!validationResult.success) {
      console.error('Shipping validation failed:', validationResult.error.issues[0].message);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input', 
          details: validationResult.error.errors.map(e => e.message)
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    const data: ShippingRequest = validationResult.data;

    console.log('Calculating shipping for CEP:', data.cepDestino.substring(0, 5) + 'XXX');

    // CEP de origem (Sinop - MT)
    const cepOrigem = '78556100';

    // Códigos de serviço dos Correios
    const servicoCodes = ['04014', '04510'];

    const shippingOptions = [];

    for (const codigo of servicoCodes) {
      // Calcular frete baseado em distância aproximada e peso
      const cepDestinoNum = parseInt(data.cepDestino);
      const cepOrigemNum = parseInt(cepOrigem);
      const distanciaFator = Math.abs(cepDestinoNum - cepOrigemNum) / 10000000;
      
      const pesoKg = data.peso / 1000;
      const volumeM3 = (data.comprimento * data.altura * data.largura) / 1000000;
      const pesoCubado = Math.max(pesoKg, volumeM3 * 200);
      
      let valorBase = 0;
      let prazoBase = 0;
      let nome = '';

      if (codigo === '04014') {
        // SEDEX
        nome = 'SEDEX';
        valorBase = 25 + (pesoCubado * 5) + (distanciaFator * 50);
        prazoBase = 2 + Math.floor(distanciaFator * 3);
      } else {
        // PAC
        nome = 'PAC';
        valorBase = 15 + (pesoCubado * 3) + (distanciaFator * 30);
        prazoBase = 5 + Math.floor(distanciaFator * 5);
      }

      shippingOptions.push({
        codigo,
        nome,
        valor: parseFloat(valorBase.toFixed(2)),
        prazoEntrega: prazoBase,
        valorMaoPropriaLabel: 'R$ 0,00',
        valorAvisoRecebimento: 'R$ 0,00',
        valorDeclarado: 'R$ 0,00',
      });
    }

    // Adicionar opção de retirada na loja
    shippingOptions.push({
      codigo: 'RETIRADA',
      nome: 'Retirar na Loja',
      valor: 0,
      prazoEntrega: 0,
      valorMaoPropriaLabel: 'R$ 0,00',
      valorAvisoRecebimento: 'R$ 0,00',
      valorDeclarado: 'R$ 0,00',
    });

    console.log('Shipping options calculated:', shippingOptions.length, 'options');

    return new Response(
      JSON.stringify({
        success: true,
        options: shippingOptions
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error calculating shipping:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({
        error: 'Error calculating shipping',
        success: false
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});