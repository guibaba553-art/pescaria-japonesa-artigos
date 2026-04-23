import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function cleanDoc(doc?: string | null): string {
  return (doc || '').replace(/\D/g, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Apenas admin
    const { data: roleCheck } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin');
    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Apenas admins podem sincronizar' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar configurações Focus NFe
    const { data: focusSettings, error: focusError } = await supabase
      .from('focus_nfe_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (focusError || !focusSettings) {
      return new Response(
        JSON.stringify({ error: 'Configurações Focus NFe não encontradas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cscId = (focusSettings.csc_id || '').toString().trim();
    const cscToken = (focusSettings.csc_token || '').toString().trim();
    if (!cscId || !cscToken) {
      return new Response(
        JSON.stringify({ error: 'CSC ID e CSC Token devem estar preenchidos nas configurações antes de sincronizar.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar empresa local
    const { data: company, error: companyError } = await supabase
      .from('company_fiscal_data')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: 'Cadastre os dados fiscais da empresa antes de sincronizar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isProducao = focusSettings.ambiente === 'producao';
    // A gestão de empresas via API exige o Token Principal de Produção da Focus
    // (independente do ambiente). Os tokens de emissão não têm permissão nessa rota.
    const focusToken = Deno.env.get('FOCUS_NFE_TOKEN_PRINCIPAL');

    if (!focusToken) {
      return new Response(
        JSON.stringify({
          error:
            'Token Principal Focus NFe não configurado. Cadastre o secret FOCUS_NFE_TOKEN_PRINCIPAL (Painel API → Tokens → Token Principal de Produção).',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Token Principal só é aceito no domínio de produção, mesmo para configurar empresas
    // que serão usadas em homologação.
    const focusBaseUrl = 'https://api.focusnfe.com.br';

    const auth = btoa(`${focusToken}:`);
    const cnpjLimpo = cleanDoc(company.cnpj);

    // 1. Listar empresas para localizar pelo CNPJ
    const listResp = await fetch(`${focusBaseUrl}/v2/empresas`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const listText = await listResp.text();

    if (!listResp.ok) {
      console.error('Falha ao listar empresas:', listResp.status, listText);
      return new Response(
        JSON.stringify({
          error: `Não foi possível listar empresas na Focus (HTTP ${listResp.status}). Verifique o token configurado para o ambiente atual.`,
          details: listText.substring(0, 500),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let empresas: any[] = [];
    try {
      empresas = JSON.parse(listText);
    } catch {
      empresas = [];
    }

    const empresa = Array.isArray(empresas)
      ? empresas.find((e) => cleanDoc(e.cnpj) === cnpjLimpo)
      : null;

    if (!empresa) {
      return new Response(
        JSON.stringify({
          error: `Empresa com CNPJ ${cnpjLimpo} não encontrada na Focus NFe (ambiente ${focusSettings.ambiente}). Cadastre a empresa primeiro no painel da Focus.`,
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. PUT /v2/empresas/ID atualizando o CSC do ambiente correto
    const updatePayload: Record<string, unknown> = isProducao
      ? {
          habilita_nfce: true,
          csc_nfce_producao: cscToken,
          id_token_nfce_producao: cscId,
        }
      : {
          habilita_nfce: true,
          csc_nfce_homologacao: cscToken,
          id_token_nfce_homologacao: cscId,
        };

    const putResp = await fetch(`${focusBaseUrl}/v2/empresas/${empresa.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatePayload),
    });
    const putText = await putResp.text();

    if (!putResp.ok) {
      console.error('Falha ao atualizar empresa Focus:', putResp.status, putText);
      let parsed: any = null;
      try { parsed = JSON.parse(putText); } catch {}
      return new Response(
        JSON.stringify({
          error: parsed?.mensagem || `Erro ao atualizar empresa na Focus (HTTP ${putResp.status})`,
          details: parsed || putText.substring(0, 800),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        empresa_id: empresa.id,
        ambiente: focusSettings.ambiente,
        message: `CSC sincronizado com a Focus NFe (empresa ID ${empresa.id}, ambiente ${focusSettings.ambiente}).`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro sync-focus-empresa:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
