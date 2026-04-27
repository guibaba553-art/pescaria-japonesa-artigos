import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cleanDoc = (doc?: string | null): string => (doc || '').replace(/\D/g, '');

// Extrai partes do shipping_address (formato livre — tentamos parsear o que for possível).
// Estrutura esperada (criada no checkout): "Logradouro, Número - Bairro, Cidade - UF, CEP"
function parseAddress(raw: string): {
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  complemento?: string;
} {
  const safe = raw || '';
  const ufMatch = safe.toUpperCase().match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  const cepMatch = safe.match(/(\d{5}-?\d{3})/);

  // Heurística simples para os outros campos
  // "Rua X, 123 - Centro, Cidade - UF, 78000-000"
  const parts = safe.split(/[,\-]/).map((s) => s.trim()).filter(Boolean);
  return {
    logradouro: parts[0] || 'NAO INFORMADO',
    numero: (parts[1] || 'S/N').replace(/\D/g, '') || 'S/N',
    bairro: parts[2] || 'CENTRO',
    municipio: parts[3] || parts[2] || 'CUIABA',
    uf: ufMatch ? ufMatch[1] : 'MT',
    cep: cepMatch ? cleanDoc(cepMatch[1]) : '00000000',
  };
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

    // ---------- AUTENTICAÇÃO ----------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar role admin/employee
    const { data: roleCheck } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'employee']);

    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---------- RATE LIMIT ----------
    const { data: rateLimitCheck } = await supabase.rpc('check_fiscal_rate_limit', {
      p_user_id: user.id,
      p_function_name: 'emit-nfe',
      p_max_requests: 20,
      p_window_hours: 1,
    });

    if (!rateLimitCheck) {
      return new Response(
        JSON.stringify({ error: 'Limite de emissões excedido. Máximo 20 NF-e por hora.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'ID do pedido é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---------- CONFIG FOCUS NFe ----------
    const { data: focusSettings, error: focusError } = await supabase
      .from('focus_nfe_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (focusError || !focusSettings?.enabled) {
      return new Response(
        JSON.stringify({ error: 'Focus NFe não está habilitada nas configurações fiscais' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: company, error: companyError } = await supabase
      .from('company_fiscal_data')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: 'Dados fiscais da empresa não cadastrados' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isProducao = focusSettings.ambiente === 'producao';
    const focusToken = isProducao
      ? Deno.env.get('FOCUS_NFE_TOKEN_PRINCIPAL')
      : Deno.env.get('FOCUS_NFE_TOKEN_HOMOLOGACAO');

    if (!focusToken) {
      return new Response(
        JSON.stringify({
          error: isProducao
            ? 'Token Focus NFe de PRODUÇÃO não configurado (FOCUS_NFE_TOKEN_PRINCIPAL)'
            : 'Token Focus NFe de HOMOLOGAÇÃO não configurado',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const focusBaseUrl = isProducao
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';

    // ---------- CARREGAR PEDIDO ----------
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*, products (name, description, include_in_nfe, ncm, cest, csosn, origem, unidade_comercial, cfop))
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      console.error('Pedido não encontrado:', { orderId, orderError });
      return new Response(JSON.stringify({ error: 'Pedido não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, cpf')
      .eq('id', order.user_id)
      .maybeSingle();

    // ---------- VALIDAÇÃO FISCAL ----------
    const { data: missingFiscal, error: validError } = await supabase
      .rpc('validate_order_fiscal', { p_order_id: orderId });

    if (validError) throw validError;

    if (missingFiscal && missingFiscal.length > 0) {
      const lista = missingFiscal
        .map((p: any) => `• ${p.product_name}: faltam ${p.missing_fields.join(', ')}`)
        .join('\n');
      return new Response(
        JSON.stringify({
          error: 'Produtos com campos fiscais incompletos:\n' + lista,
          missing: missingFiscal,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---------- DESTINATÁRIO ----------
    const cpf = cleanDoc(profile?.cpf);
    const hasCpf = cpf.length === 11;
    if (!hasCpf) {
      return new Response(
        JSON.stringify({ error: 'CPF do cliente não cadastrado. NF-e exige identificação do destinatário.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const addr = parseAddress(order.shipping_address);
    const ufDestino = addr.uf;
    const isInterestadual = ufDestino !== (company.uf || 'MT').toUpperCase();
    const cfopPadrao = isInterestadual
      ? (focusSettings.cfop_interestadual || '6108')
      : (focusSettings.cfop_padrao || '5102');

    // ---------- ITENS ----------
    const nfeItems = (order.order_items || []).filter(
      (item: any) => item.products?.include_in_nfe !== false
    );

    if (nfeItems.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nenhum item do pedido está marcado para incluir na NF-e' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const focusItems = nfeItems.map((item: any, idx: number) => {
      const p = item.products || {};
      const rawNcm = (p.ncm || focusSettings.ncm_padrao || '').replace(/\D/g, '');
      const ncm = rawNcm.length === 8 ? rawNcm : '';
      if (!ncm) {
        throw new Error(
          `NCM ausente ou inválido no item "${p.name}". Cadastre o NCM (8 dígitos) no produto ou defina um NCM padrão nas Configurações Focus NFe.`
        );
      }
      return {
        numero_item: idx + 1,
        codigo_produto: String(item.product_id).substring(0, 30),
        descricao: p.name,
        codigo_ncm: ncm,
        cfop: cfopPadrao,
        unidade_comercial: p.unidade_comercial || focusSettings.unidade_padrao || 'UN',
        quantidade_comercial: Number(item.quantity).toFixed(4),
        valor_unitario_comercial: Number(item.price_at_purchase).toFixed(2),
        valor_unitario_tributavel: Number(item.price_at_purchase).toFixed(2),
        unidade_tributavel: p.unidade_comercial || focusSettings.unidade_padrao || 'UN',
        quantidade_tributavel: Number(item.quantity).toFixed(4),
        valor_bruto: (Number(item.quantity) * Number(item.price_at_purchase)).toFixed(2),
        icms_origem: p.origem || focusSettings.origem_padrao || '0',
        icms_situacao_tributaria: p.csosn || focusSettings.csosn_padrao || '102',
        ...(p.cest ? { cest: p.cest } : {}),
      };
    });

    // ---------- DATA EMISSÃO ----------
    const issuerUf = (company.uf || '').toUpperCase();
    const timezoneOffset = issuerUf === 'AC'
      ? '-05:00'
      : ['AM', 'MT', 'MS', 'RO', 'RR'].includes(issuerUf) ? '-04:00' : '-03:00';

    const buildDataEmissao = (futureOffsetMinutes: number) => {
      const now = new Date(Date.now() + futureOffsetMinutes * 60 * 1000);
      const tzMs = Number(timezoneOffset.slice(0, 3)) * 60 * 60 * 1000;
      const local = new Date(now.getTime() + tzMs);
      const pad = (n: number) => String(n).padStart(2, '0');
      return (
        `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
        `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${timezoneOffset}`
      );
    };

    // ---------- NUMERAÇÃO NF-e ----------
    // Reaproveitamos o campo `proximo_numero_nfce` para NFC-e; para NF-e vamos
    // deixar a Focus atribuir o próximo número (não enviando o campo `numero`).
    // A `serie_nfe` vem de focus_nfe_settings.
    const nfeSeries = String(focusSettings.serie_nfe || 1);

    // ---------- PAYLOAD ----------
    const totalProdutos = focusItems.reduce((sum, it) => sum + Number(it.valor_bruto), 0);
    const valorFrete = Number(order.shipping_cost || 0);

    const buildPayload = (dataEmissao: string): Record<string, unknown> => ({
      natureza_operacao: 'Venda de mercadoria',
      data_emissao: dataEmissao,
      data_entrada_saida: dataEmissao,
      tipo_documento: 1,
      finalidade_emissao: 1,
      serie: nfeSeries,
      // numero: omitido — Focus atribui automaticamente
      cnpj_emitente: cleanDoc(company.cnpj),
      nome_emitente: company.razao_social,
      nome_fantasia_emitente: company.nome_fantasia || company.razao_social,
      logradouro_emitente: company.logradouro,
      numero_emitente: company.numero,
      ...(company.complemento ? { complemento_emitente: company.complemento } : {}),
      bairro_emitente: company.bairro,
      municipio_emitente: company.municipio,
      uf_emitente: company.uf,
      cep_emitente: cleanDoc(company.cep),
      inscricao_estadual_emitente: company.inscricao_estadual,
      regime_tributario_emitente: company.regime_tributario === 'simples_nacional' ? 1 : 3,

      // Destinatário (pessoa física)
      nome_destinatario: profile?.full_name || 'CONSUMIDOR',
      cpf_destinatario: cpf,
      logradouro_destinatario: addr.logradouro,
      numero_destinatario: addr.numero,
      bairro_destinatario: addr.bairro,
      municipio_destinatario: addr.municipio,
      uf_destinatario: addr.uf,
      cep_destinatario: addr.cep,
      indicador_inscricao_estadual_destinatario: 9, // não contribuinte

      presenca_comprador: 2,    // operação não presencial — internet
      modalidade_frete: 0,      // por conta do emitente
      local_destino: isInterestadual ? 2 : 1,
      consumidor_final: 1,

      valor_frete: valorFrete.toFixed(2),
      valor_produtos: totalProdutos.toFixed(2),
      valor_total: (totalProdutos + valorFrete).toFixed(2),

      items: focusItems,
      formas_pagamento: [
        {
          forma_pagamento: '99',
          valor_pagamento: (totalProdutos + valorFrete).toFixed(2),
        },
      ],
    });

    const userPrefix = user.id.substring(0, 8);
    const ref = `nfe-${userPrefix}-${orderId.substring(0, 8)}-${Date.now()}`;
    const dataEmissao = buildDataEmissao(0);
    const payload = buildPayload(dataEmissao);

    console.log('Emitindo NF-e:', {
      ref, orderId, isInterestadual, cfopPadrao,
      ufDestino, items: focusItems.length, total: totalProdutos + valorFrete,
    });

    // Registrar emissão pendente
    const { data: emission } = await supabase
      .from('nfe_emissions')
      .insert({
        order_id: orderId,
        status: 'pending',
        modelo: '55',
        ambiente: focusSettings.ambiente,
        tipo: 'saida',
        ref_focus: ref,
        valor_total: totalProdutos + valorFrete,
        products_count: focusItems.length,
      })
      .select()
      .single();

    // ---------- CHAMADA FOCUS ----------
    const auth = btoa(`${focusToken}:`);
    const url = `${focusBaseUrl}/v2/nfe?ref=${encodeURIComponent(ref)}`;
    const focusResp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const respText = await focusResp.text();
    let result: any;
    try { result = JSON.parse(respText); } catch { result = { mensagem: respText }; }

    if (!focusResp.ok) {
      const errMsg =
        result.mensagem_sefaz || result.mensagem || result.erros?.[0]?.mensagem || `HTTP ${focusResp.status}`;
      console.error('Focus NFe error:', focusResp.status, respText);
      if (emission) {
        await supabase.from('nfe_emissions')
          .update({ status: 'error', error_message: errMsg })
          .eq('id', emission.id);
      }
      return new Response(
        JSON.stringify({ error: errMsg, details: result }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Focus retorna `processando_autorizacao` — o status final precisa ser
    // consultado depois via GET /v2/nfe/:ref (use a função check-nfe-status).
    if (emission) {
      await supabase.from('nfe_emissions')
        .update({
          status: result.status === 'autorizado' ? 'success' : 'pending',
          nfe_number: result.numero || null,
          nfe_key: result.chave_nfe || null,
          nfe_xml_url: result.caminho_xml_nota_fiscal ? `${focusBaseUrl}${result.caminho_xml_nota_fiscal}` : null,
          danfe_url: result.caminho_danfe ? `${focusBaseUrl}${result.caminho_danfe}` : null,
          protocolo: result.protocolo || null,
          emitted_at: result.status === 'autorizado' ? new Date().toISOString() : null,
        })
        .eq('id', emission.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ref,
        status: result.status,
        nfe: result,
        message: result.status === 'autorizado'
          ? 'NF-e autorizada com sucesso'
          : 'NF-e enviada à SEFAZ. Use o histórico para verificar o status final.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro ao emitir NF-e:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
