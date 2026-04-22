import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FOCUS_URL_HOMOLOGACAO = 'https://homologacao.focusnfe.com.br';
const FOCUS_URL_PRODUCAO = 'https://api.focusnfe.com.br';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Não autorizado' }, 401);

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return jsonResponse({ error: 'Não autorizado' }, 401);

    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return jsonResponse({ error: 'Apenas admins' }, 403);

    const { emissionId } = await req.json();
    if (!emissionId) return jsonResponse({ error: 'emissionId obrigatório' }, 400);

    const { data: emission, error } = await supabase
      .from('nfe_emissions').select('*').eq('id', emissionId).single();
    if (error || !emission) return jsonResponse({ error: 'Emissão não encontrada' }, 404);
    if (!emission.ref_focus) return jsonResponse({ error: 'Sem referência Focus NFe' }, 400);

    const { data: settings } = await supabase
      .from('focus_nfe_settings').select('*').limit(1).maybeSingle();

    const token = emission.ambiente === 'producao'
      ? Deno.env.get('FOCUS_NFE_TOKEN_PRODUCAO')
      : Deno.env.get('FOCUS_NFE_TOKEN_HOMOLOGACAO');
    if (!token) return jsonResponse({ error: 'Token não configurado' }, 400);

    const baseUrl = emission.ambiente === 'producao' ? FOCUS_URL_PRODUCAO : FOCUS_URL_HOMOLOGACAO;
    const endpoint = emission.modelo === '65'
      ? `/v2/nfce/${emission.ref_focus}`
      : `/v2/nfe/${emission.ref_focus}`;

    const resp = await fetch(`${baseUrl}${endpoint}`, {
      headers: { 'Authorization': 'Basic ' + btoa(`${token}:`) },
    });
    const data = await resp.json();
    console.log('Consulta Focus:', resp.status, data);

    if (resp.ok) {
      const newStatus = data.status === 'autorizado' ? 'success'
        : data.status === 'cancelado' ? 'cancelled'
        : data.status === 'erro_autorizacao' ? 'error'
        : 'processing';

      await supabase.from('nfe_emissions').update({
        status: newStatus,
        nfe_number: data.numero || emission.nfe_number,
        nfe_key: data.chave_nfe || emission.nfe_key,
        protocolo: data.protocolo || emission.protocolo,
        nfe_xml_url: data.caminho_xml_nota_fiscal ? `${baseUrl}${data.caminho_xml_nota_fiscal}` : emission.nfe_xml_url,
        danfe_url: data.caminho_danfe ? `${baseUrl}${data.caminho_danfe}` : emission.danfe_url,
        error_message: data.mensagem_sefaz || null,
        emitted_at: data.status === 'autorizado' && !emission.emitted_at ? new Date().toISOString() : emission.emitted_at,
      }).eq('id', emission.id);
    }

    return jsonResponse({ success: true, data });
  } catch (e: any) {
    console.error(e);
    return jsonResponse({ error: e.message }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
