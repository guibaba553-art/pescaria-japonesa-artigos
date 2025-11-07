import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { xmlContent } = await req.json();
    
    if (!xmlContent) {
      throw new Error('XML content is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Parsing NFe XML with AI...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um especialista em extrair dados de XML de Notas Fiscais Eletrônicas (NFe) brasileiras. Extraia todos os dados estruturados dos produtos.'
          },
          {
            role: 'user',
            content: `Extraia os dados desta NFe XML:\n\n${xmlContent}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_nfe_data',
              description: 'Extrai dados estruturados de uma NFe XML brasileira',
              parameters: {
                type: 'object',
                properties: {
                  numero: { type: 'string', description: 'Número da NFe (tag nNF)' },
                  serie: { type: 'string', description: 'Série da NFe (tag serie)' },
                  data_emissao: { type: 'string', description: 'Data de emissão no formato ISO (tag dhEmi)' },
                  fornecedor: {
                    type: 'object',
                    properties: {
                      nome: { type: 'string', description: 'Nome/Razão social do emitente (tag xNome dentro de emit)' },
                      cnpj: { type: 'string', description: 'CNPJ do emitente (tag CNPJ dentro de emit)' }
                    },
                    required: ['nome', 'cnpj']
                  },
                  produtos: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        sku: { type: 'string', description: 'Código do produto (tag cProd)' },
                        ean: { type: 'string', description: 'Código de barras EAN/GTIN (tag cEAN ou cEANTrib)' },
                        nome: { type: 'string', description: 'Nome/descrição do produto (tag xProd)' },
                        ncm: { type: 'string', description: 'Código NCM (tag NCM)' },
                        quantidade: { type: 'number', description: 'Quantidade (tag qCom)' },
                        valor_unitario: { type: 'number', description: 'Valor unitário (tag vUnCom)' },
                        valor_total: { type: 'number', description: 'Valor total do item (tag vProd)' },
                        icms: { type: 'number', description: 'Valor do ICMS (tag vICMS ou 0 se não houver)' },
                        ipi: { type: 'number', description: 'Valor do IPI (tag vIPI ou 0 se não houver)' },
                        pis: { type: 'number', description: 'Valor do PIS (tag vPIS ou 0 se não houver)' },
                        cofins: { type: 'number', description: 'Valor do COFINS (tag vCOFINS ou 0 se não houver)' }
                      },
                      required: ['nome', 'quantidade', 'valor_unitario', 'valor_total']
                    }
                  },
                  valor_total: { type: 'number', description: 'Valor total da NFe (tag vNF)' },
                  valor_frete: { type: 'number', description: 'Valor total do frete da NFe (tag vFrete ou 0)' },
                  chave_acesso: { type: 'string', description: 'Chave de acesso da NFe com 44 dígitos (tag chNFe ou infNFe Id)' }
                },
                required: ['numero', 'serie', 'data_emissao', 'fornecedor', 'produtos', 'valor_total'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_nfe_data' } }
      })
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns instantes.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos ao seu workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error('Erro ao processar XML com IA');
    }

    const aiData = await aiResponse.json();
    console.log('AI Response:', JSON.stringify(aiData, null, 2));

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('Não foi possível extrair dados do XML');
    }

    const nfeData = JSON.parse(toolCall.function.arguments);
    console.log('NFe data extracted:', nfeData.produtos.length, 'products');

    return new Response(
      JSON.stringify(nfeData),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error parsing NFe XML:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido ao processar XML' 
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});