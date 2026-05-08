import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Auth: admin/employee only
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roles } = await supabase
      .from('user_roles').select('role')
      .eq('user_id', userData.user.id)
      .in('role', ['admin', 'employee']);
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'Permissão negada' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const nfeId: string | undefined = body.nfe_id;
    const justificativa: string = String(body.justificativa || '').trim();

    if (!nfeId) {
      return new Response(JSON.stringify({ error: 'nfe_id é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (justificativa.length < 15 || justificativa.length > 255) {
      return new Response(JSON.stringify({ error: 'A justificativa deve ter entre 15 e 255 caracteres (exigência da SEFAZ).' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar a NF-e
    const { data: nfe, error: nfeErr } = await supabase
      .from('nfe_emissions')
      .select('id, ref_focus, status, ambiente, nfe_number, nfe_key')
      .eq('id', nfeId)
      .maybeSingle();

    if (nfeErr || !nfe) {
      return new Response(JSON.stringify({ error: 'NF-e não encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (nfe.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'NF-e já está cancelada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (nfe.status !== 'success') {
      return new Response(JSON.stringify({ error: 'Apenas NF-e autorizadas podem ser canceladas' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!nfe.ref_focus) {
      return new Response(JSON.stringify({ error: 'NF-e sem referência Focus — não é possível cancelar' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tokens
    const { data: focusSettings } = await supabase
      .from('focus_nfe_settings').select('ambiente').maybeSingle();
    const isProducao = (nfe.ambiente || focusSettings?.ambiente) === 'producao';
    const focusToken = isProducao
      ? Deno.env.get('FOCUS_NFE_TOKEN_PRINCIPAL')
      : Deno.env.get('FOCUS_NFE_TOKEN_HOMOLOGACAO');
    const focusBaseUrl = isProducao
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';

    if (!focusToken) {
      return new Response(JSON.stringify({ error: 'Token Focus NFe não configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const basicAuth = 'Basic ' + btoa(`${focusToken}:`);

    const cancelResp = await fetch(`${focusBaseUrl}/v2/nfe/${encodeURIComponent(nfe.ref_focus)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': basicAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ justificativa }),
    });

    const respText = await cancelResp.text();
    let respJson: any = null;
    try { respJson = JSON.parse(respText); } catch { /* keep raw */ }

    console.log('[cancel-nfe] Focus response', cancelResp.status, respText);

    // Focus retorna 200 com status "cancelado" quando OK; ou 4xx com erro
    const focusStatus: string = respJson?.status || respJson?.status_sefaz || '';
    const ok = cancelResp.ok && (
      focusStatus === 'cancelado' ||
      respJson?.cnpj_emitente // cancelado retorna dados completos
    );

    if (!ok) {
      const msg = respJson?.mensagem_sefaz || respJson?.mensagem || respJson?.erros?.[0]?.mensagem || respText || `HTTP ${cancelResp.status}`;
      await supabase.from('nfe_emissions')
        .update({ error_message: `Cancelamento rejeitado: ${msg}`.slice(0, 1000) })
        .eq('id', nfeId);
      return new Response(JSON.stringify({ error: msg, focus_response: respJson }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('nfe_emissions')
      .update({
        status: 'cancelled',
        motivo_cancelamento: justificativa,
        cancelled_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', nfeId);

    return new Response(JSON.stringify({
      success: true,
      message: 'NF-e cancelada com sucesso',
      protocolo_cancelamento: respJson?.numero_protocolo || respJson?.protocolo_cancelamento || null,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[cancel-nfe] error', err);
    return new Response(JSON.stringify({ error: err?.message || 'Erro inesperado' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
