// Edge function: upscale/enhance de imagem via Lovable AI (Gemini image preview)
// Recebe { imageBase64, mimeType } e devolve { imageBase64 } (PNG melhorada)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) throw new Error('imageBase64 obrigatório');

    const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`;

    const prompt =
      'Enhance this product photo: increase resolution, remove JPEG artifacts and aliasing (serrilhado), sharpen edges, improve clarity and detail. Keep the exact same subject, composition, colors and background. Do not add or remove anything. Output a clean, high-resolution version of the same image.';

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        modalities: ['image', 'text'],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de uso atingido. Tente novamente em alguns minutos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos de IA esgotados. Adicione créditos em Lovable Cloud.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`AI gateway error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    // A resposta vem com a imagem em message.images[0].image_url.url (data URL)
    const imgUrl: string | undefined =
      data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imgUrl) {
      throw new Error('IA não retornou imagem');
    }

    // Extrai base64 do data URL
    const match = imgUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Formato de imagem inválido na resposta');
    const outMime = match[1];
    const outB64 = match[2];

    return new Response(
      JSON.stringify({ imageBase64: outB64, mimeType: outMime }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('ai-upscale-image error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
