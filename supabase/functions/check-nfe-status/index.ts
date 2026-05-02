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
    // Authentication: accept EITHER a valid CRON_SECRET (for scheduled jobs)
    // OR an admin/employee JWT. Otherwise reject.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedCron = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('Authorization');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let authorized = false;

    if (cronSecret && providedCron && providedCron === cronSecret) {
      authorized = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (!userErr && userData?.user) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userData.user.id)
          .in('role', ['admin', 'employee']);
        if (roles && roles.length > 0) authorized = true;
      }
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar configuração de ambiente
    const { data: focusSettings } = await supabase
      .from('focus_nfe_settings')
      .select('ambiente')
      .maybeSingle();

    const isProducao = focusSettings?.ambiente === 'producao';
    // Em produção usa o Token Principal (mesmo da emissão); em homologação o token de homologação
    const focusToken = isProducao
      ? Deno.env.get('FOCUS_NFE_TOKEN_PRINCIPAL')
      : Deno.env.get('FOCUS_NFE_TOKEN_HOMOLOGACAO');
    const focusBaseUrl = isProducao
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';

    if (!focusToken) {
      return new Response(
        JSON.stringify({ error: 'Token Focus NFe não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar todas as NF-e pendentes (até 30 min de idade)
    const { data: pendingEmissions, error: fetchError } = await supabase
      .from('nfe_emissions')
      .select('id, ref_focus, modelo, status, created_at')
      .eq('status', 'pending')
      .not('ref_focus', 'is', null)
      .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

    if (fetchError) throw fetchError;

    if (!pendingEmissions || pendingEmissions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Nenhuma NF-e pendente', checked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: any[] = [];
    const auth = 'Basic ' + btoa(focusToken + ':');

    for (const emission of pendingEmissions) {
      try {
        const isNFCe = emission.modelo === '65';
        const endpoint = isNFCe
          ? `/v2/nfce/${emission.ref_focus}`
          : `/v2/nfe/${emission.ref_focus}`;

        const resp = await fetch(`${focusBaseUrl}${endpoint}`, {
          headers: { Authorization: auth },
        });

        const data = await resp.json();
        const focusStatus = data.status;

        let updateData: any = { updated_at: new Date().toISOString() };

        if (focusStatus === 'autorizado') {
          updateData.status = 'success';
          updateData.nfe_key = data.chave_nfe || data.chave_nfce;
          updateData.nfe_number = data.numero;
          updateData.protocolo = data.protocolo;
          updateData.emitted_at = data.data_emissao || new Date().toISOString();
          updateData.danfe_url = data.caminho_danfe ? `${focusBaseUrl}${data.caminho_danfe}` : null;
          updateData.nfe_xml_url = data.caminho_xml_nota_fiscal ? `${focusBaseUrl}${data.caminho_xml_nota_fiscal}` : null;
        } else if (
          focusStatus === 'erro_autorizacao' ||
          focusStatus === 'denegado' ||
          focusStatus === 'rejeitado'
        ) {
          updateData.status = 'error';
          const sefazInfo = data.status_sefaz ? `[SEFAZ ${data.status_sefaz}] ` : '';
          updateData.error_message = `${sefazInfo}${data.mensagem_sefaz || data.mensagem || 'Erro na autorização'}`;
        } else if (focusStatus === 'cancelado') {
          updateData.status = 'cancelled';
          updateData.cancelled_at = new Date().toISOString();
        }
        // processando_autorizacao / em_processamento -> mantém pending

        if (updateData.status) {
          await supabase
            .from('nfe_emissions')
            .update(updateData)
            .eq('id', emission.id);
        }

        results.push({ id: emission.id, ref: emission.ref_focus, focusStatus, updated: !!updateData.status });
      } catch (err: any) {
        console.error(`Erro consultando ${emission.ref_focus}:`, err);
        results.push({ id: emission.id, ref: emission.ref_focus, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({ checked: pendingEmissions.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Erro check-nfe-status:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
