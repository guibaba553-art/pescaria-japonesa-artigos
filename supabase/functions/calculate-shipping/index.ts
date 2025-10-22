// Edge function for calculating shipping costs

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ShippingRequest {
  cepDestino: string;
  peso: number; // em gramas
  formato: number; // 1=caixa/pacote, 2=rolo/prisma, 3=envelope
  comprimento: number; // em cm
  altura: number; // em cm
  largura: number; // em cm
  diametro?: number; // em cm
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cepDestino, peso, formato, comprimento, altura, largura, diametro }: ShippingRequest = await req.json();

    console.log('Calculating shipping:', { cepDestino, peso, formato, comprimento, altura, largura });

    // CEP de origem (Sinop - MT)
    const cepOrigem = '78550970';

    // Códigos de serviço dos Correios
    // 04014 = SEDEX
    // 04510 = PAC
    const servicoCodes = ['04014', '04510'];

    const shippingOptions = [];

    for (const codigo of servicoCodes) {
      // Usando API pública dos Correios (ViaCEP não tem frete, então vamos simular valores realistas)
      // Em produção, você deveria usar a API oficial dos Correios com credenciais
      
      // Calcular frete baseado em distância aproximada e peso
      const cepDestinoNum = parseInt(cepDestino.replace(/\D/g, ''));
      const cepOrigemNum = parseInt(cepOrigem.replace(/\D/g, ''));
      const distanciaFator = Math.abs(cepDestinoNum - cepOrigemNum) / 10000000;
      
      const pesoKg = peso / 1000;
      const volumeM3 = (comprimento * altura * largura) / 1000000;
      const pesoCubado = Math.max(pesoKg, volumeM3 * 200); // Fator de cubagem
      
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

    console.log('Shipping options calculated:', shippingOptions);

    return new Response(
      JSON.stringify({
        success: true,
        options: shippingOptions
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error calculating shipping:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({
        error: errorMessage,
        success: false
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
