import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roles } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id)
      .in('role', ['admin', 'employee']);
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { cnpj } = await req.json();
    const digits = String(cnpj || '').replace(/\D/g, '');
    if (digits.length !== 14) {
      return new Response(JSON.stringify({ error: 'CNPJ inválido (14 dígitos)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Configurações Focus NFe
    const { data: focusSettings } = await supabase
      .from('focus_nfe_settings').select('*').limit(1).maybeSingle();

    const isProducao = focusSettings?.ambiente === 'producao';
    const focusToken = isProducao
      ? Deno.env.get('FOCUS_NFE_TOKEN_PRINCIPAL')
      : Deno.env.get('FOCUS_NFE_TOKEN_HOMOLOGACAO');
    if (!focusToken) {
      return new Response(JSON.stringify({ error: 'Token Focus NFe não configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const focusBaseUrl = isProducao
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';

    const auth = btoa(`${focusToken}:`);
    const resp = await fetch(`${focusBaseUrl}/v2/cnpjs/${digits}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const text = await resp.text();
    let d: any;
    try { d = JSON.parse(text); } catch { d = { mensagem: text }; }

    if (!resp.ok) {
      return new Response(JSON.stringify({
        error: d.mensagem || `HTTP ${resp.status}`, details: d,
      }), { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Focus NFe retorna inscrições estaduais por estado quando disponível.
    // Estrutura típica: inscricoes_estaduais: [{ inscricao_estadual, uf, ativo, ... }]
    const inscricoes: any[] = Array.isArray(d.inscricoes_estaduais) ? d.inscricoes_estaduais : [];
    const ieDoEstado = inscricoes.find((i) =>
      String(i?.uf || '').toUpperCase() === String(d.uf || '').toUpperCase() && (i?.ativo ?? true)
    ) || inscricoes.find((i) => i?.ativo) || inscricoes[0];

    const ieValue = ieDoEstado?.inscricao_estadual || '';
    const ieAtiva = !!ieDoEstado?.ativo;

    return new Response(JSON.stringify({
      success: true,
      cnpj: digits,
      razao_social: d.nome || d.razao_social || null,
      nome_fantasia: d.fantasia || d.nome_fantasia || null,
      situacao: d.situacao || d.situacao_cadastral || null,
      logradouro: d.logradouro || null,
      numero: d.numero || null,
      complemento: d.complemento || null,
      bairro: d.bairro || null,
      municipio: d.municipio || null,
      uf: d.uf || null,
      cep: (d.cep || '').replace(/\D/g, '') || null,
      codigo_municipio_ibge: d.codigo_municipio || d.cod_ibge || null,
      email: d.email || null,
      telefone: d.telefone || null,
      inscricao_estadual: ieValue || null,
      ie_ativa: ieAtiva,
      inscricoes_estaduais: inscricoes,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('lookup-cnpj-focus error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
