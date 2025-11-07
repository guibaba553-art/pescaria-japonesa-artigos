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
    const { xmlContent, isPdf, fileName } = await req.json();
    
    if (!xmlContent && !isPdf) {
      throw new Error('XML content is required');
    }

    let contentToProcess = xmlContent;

    // Se for PDF, usar instruções especiais para extrair de PDF
    if (isPdf) {
      console.log('Processing PDF file:', fileName);
      console.log('Note: For best PDF parsing, user should upload the file directly through the chat');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Parsing NFe content with AI...');

    const systemPrompt = isPdf 
      ? `Você é um especialista em extrair dados de PDFs de Notas Fiscais Eletrônicas (NFe) brasileiras.

INSTRUÇÕES IMPORTANTES:
1. Extraia TODOS os dados estruturados dos produtos da nota fiscal
2. SEMPRE extraia o código de barras EAN/GTIN de cada produto
3. O código de barras pode estar identificado como: EAN, GTIN, Cód. Barras, ou código similar
4. Se o código de barras não existir, retorne "SEM GTIN"
5. NUNCA deixe o campo ean como null, undefined ou vazio
6. Extraia impostos quando disponíveis (ICMS, IPI, PIS, COFINS)
7. Procure por informações do fornecedor/emitente (nome, CNPJ)
8. Extraia número, série e data de emissão da nota
9. Extraia valores totais de produtos e frete quando disponíveis`
      : `Você é um especialista em extrair dados de XML de Notas Fiscais Eletrônicas (NFe) brasileiras. 

INSTRUÇÕES IMPORTANTES:
1. Extraia TODOS os dados estruturados dos produtos
2. SEMPRE extraia o código de barras EAN/GTIN de cada produto
3. O código de barras pode estar nas tags: cEAN, cEANTrib, ou GTIN dentro de det > prod
4. Se o código de barras não existir ou for vazio, retorne "SEM GTIN"
5. NUNCA deixe o campo ean como null, undefined ou vazio
6. Preste atenção especial aos impostos (ICMS, IPI, PIS, COFINS) dentro de det > imposto

Exemplo de estrutura XML:
<det nItem="1">
  <prod>
    <cProd>123</cProd>
    <cEAN>7891234567890</cEAN> <!-- CÓDIGO DE BARRAS AQUI -->
    <xProd>Nome do Produto</xProd>
    <NCM>12345678</NCM>
    <qCom>10.00</qCom>
    <vUnCom>15.50</vUnCom>
    <vProd>155.00</vProd>
  </prod>
  <imposto>
    <ICMS><ICMS00><vICMS>12.40</vICMS></ICMS00></ICMS>
    <IPI><IPITrib><vIPI>5.00</vIPI></IPITrib></IPI>
    <PIS><PISAliq><vPIS>2.50</vPIS></PISAliq></PIS>
    <COFINS><COFINSAliq><vCOFINS>11.63</vCOFINS></COFINSAliq></COFINS>
  </imposto>
</det>`;

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
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Extraia os dados desta NFe ${isPdf ? 'PDF' : 'XML'}:\n\n${contentToProcess}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_nfe_data',
              description: 'Extrai dados estruturados de uma NFe XML ou PDF brasileira',
              parameters: {
                type: 'object',
                properties: {
                  numero: { type: 'string', description: 'Número da NFe' },
                  serie: { type: 'string', description: 'Série da NFe' },
                  data_emissao: { type: 'string', description: 'Data de emissão no formato ISO' },
                  fornecedor: {
                    type: 'object',
                    properties: {
                      nome: { type: 'string', description: 'Nome/Razão social do emitente' },
                      cnpj: { type: 'string', description: 'CNPJ do emitente' }
                    },
                    required: ['nome', 'cnpj']
                  },
                  produtos: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        sku: { type: 'string', description: 'Código do produto' },
                        ean: { type: 'string', description: 'CRÍTICO: Código de barras EAN/GTIN. Se não existir, retornar "SEM GTIN". NUNCA null.' },
                        nome: { type: 'string', description: 'Nome/descrição do produto' },
                        ncm: { type: 'string', description: 'Código NCM' },
                        quantidade: { type: 'number', description: 'Quantidade comercial' },
                        valor_unitario: { type: 'number', description: 'Valor unitário' },
                        valor_total: { type: 'number', description: 'Valor total do item' },
                        icms: { type: 'number', description: 'Valor do ICMS ou 0' },
                        ipi: { type: 'number', description: 'Valor do IPI ou 0' },
                        pis: { type: 'number', description: 'Valor do PIS ou 0' },
                        cofins: { type: 'number', description: 'Valor do COFINS ou 0' }
                      },
                      required: ['nome', 'quantidade', 'valor_unitario', 'valor_total', 'ean']
                    }
                  },
                  valor_total: { type: 'number', description: 'Valor total da NFe' },
                  valor_frete: { type: 'number', description: 'Valor total do frete ou 0' },
                  chave_acesso: { type: 'string', description: 'Chave de acesso da NFe (44 dígitos)' }
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
      throw new Error('Erro ao processar com IA');
    }

    const aiData = await aiResponse.json();
    console.log('AI Response received');

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('Não foi possível extrair dados da nota fiscal');
    }

    const nfeData = JSON.parse(toolCall.function.arguments);
    
    // Garantir que todos os produtos tenham EAN
    nfeData.produtos = nfeData.produtos.map((p: any) => ({
      ...p,
      ean: p.ean || 'SEM GTIN',
      sku: p.sku || p.ean || 'SEM SKU',
      icms: p.icms || 0,
      ipi: p.ipi || 0,
      pis: p.pis || 0,
      cofins: p.cofins || 0
    }));
    
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
    console.error('Error parsing NFe:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido ao processar nota fiscal' 
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
