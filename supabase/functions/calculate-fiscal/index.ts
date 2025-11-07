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
    const { products, tipo = "simples_nacional" } = await req.json();
    
    console.log('[calculate-fiscal] Processing', products.length, 'products, regime:', tipo);
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Prompt detalhado para cálculos fiscais
    const systemPrompt = `Você é um especialista em contabilidade e cálculos fiscais brasileiros.
Calcule impostos, despesas e margem de lucro para os produtos fornecidos.

IMPORTANTE: Retorne APENAS um JSON válido, sem texto adicional.

Regras de cálculo:
- Simples Nacional (${tipo === 'simples_nacional' ? 'USAR' : 'NÃO USAR'}): Alíquota de 6% a 15% dependendo do faturamento
- Lucro Presumido: ICMS 18%, PIS 0.65%, COFINS 3%, IRPJ 15%, CSLL 9%
- Lucro Real: Cálculo sobre o lucro real

Para CADA produto calcule:
1. Custo total (preço de compra + despesas operacionais estimadas)
2. Impostos federais (PIS, COFINS, IRPJ, CSLL ou Simples)
3. Impostos estaduais (ICMS)
4. Margem de lucro bruta (%)
5. Margem de lucro líquida (%) após impostos
6. Preço sugerido para venda
7. Despesas operacionais estimadas (10% do custo)`;

    const userPrompt = `Analise estes produtos e calcule os impostos:

${JSON.stringify(products, null, 2)}

Regime tributário: ${tipo}

Retorne um JSON com esta estrutura EXATA:
{
  "products": [
    {
      "id": "id_do_produto",
      "name": "nome",
      "cost": 100.00,
      "expenses": 10.00,
      "taxes": {
        "federal": 8.50,
        "state": 18.00,
        "total": 26.50
      },
      "margins": {
        "gross": 30.5,
        "net": 15.2
      },
      "suggested_price": 150.00,
      "breakdown": "Explicação detalhada dos cálculos"
    }
  ],
  "summary": {
    "total_cost": 1000.00,
    "total_taxes": 265.00,
    "total_revenue": 1500.00,
    "net_profit": 235.00
  }
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[calculate-fiscal] AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Limite de requisições atingido. Aguarde um momento." 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "Créditos insuficientes. Adicione créditos ao workspace." 
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content in AI response");
    }

    console.log('[calculate-fiscal] AI response:', content);

    // Extrair JSON da resposta (pode vir com markdown ```json```)
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.slice(7);
    }
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.slice(3);
    }
    if (jsonContent.endsWith('```')) {
      jsonContent = jsonContent.slice(0, -3);
    }
    
    const calculations = JSON.parse(jsonContent.trim());
    
    console.log('[calculate-fiscal] Success:', calculations.products.length, 'products calculated');

    return new Response(JSON.stringify(calculations), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[calculate-fiscal] Error:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message || 'Erro ao calcular impostos'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
