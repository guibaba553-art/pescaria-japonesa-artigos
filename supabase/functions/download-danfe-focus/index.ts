import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'Content-Disposition',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: userData } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) throw new Error('Unauthorized');

    const { data: roleRow } = await supabase
      .from('user_roles').select('role')
      .eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Apenas admins' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { chave } = await req.json();
    if (!chave || !/^\d{44}$/.test(chave)) {
      throw new Error('Chave de NF-e inválida');
    }

    const focusToken = Deno.env.get('FOCUS_NFE_TOKEN_PRODUCAO');
    if (!focusToken) throw new Error('FOCUS_NFE_TOKEN_PRODUCAO não configurado');

    const auth = btoa(`${focusToken}:`);
    const url = `https://api.focusnfe.com.br/v2/nfes_recebidas/${chave}.pdf`;
    const resp = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('[download-danfe-focus] Focus error', resp.status, txt);
      return new Response(JSON.stringify({
        error: `Focus retornou HTTP ${resp.status}`,
        details: txt.substring(0, 500),
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const pdf = await resp.arrayBuffer();
    return new Response(pdf, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="danfe-${chave}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('[download-danfe-focus]', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
