// Edge function: explain-error
// Recebe um erro e devolve um resumo em português explicando o que aconteceu
// e a provável causa, usando Lovable AI Gateway.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, stack, source, url, user_agent, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Você é um engenheiro de software sênior. Analise o erro abaixo capturado em um site React/Vite/Supabase e responda em **português do Brasil**, de forma curta e clara (no máximo 6 linhas), explicando:
1. **O que aconteceu** (em linguagem simples).
2. **Causa mais provável**.
3. **Como corrigir** (passos diretos).

Erro:
- Mensagem: ${message ?? "(sem mensagem)"}
- Origem: ${source ?? "(sem origem)"}
- URL: ${url ?? "(sem url)"}
- User-Agent: ${user_agent ?? "(sem UA)"}
- Stack:\n${(stack ?? "(sem stack)").slice(0, 3000)}
${context ? `- Contexto: ${JSON.stringify(context).slice(0, 1500)}` : ""}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você responde em português brasileiro, conciso e técnico." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente em alguns segundos." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Lovable Cloud." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `AI gateway error: ${t}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const summary = data?.choices?.[0]?.message?.content ?? "Sem resposta do modelo.";
    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
