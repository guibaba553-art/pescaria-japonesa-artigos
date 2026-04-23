import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CartItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  ncm?: string;
  cfop?: string;
  csosn?: string;
  origem?: string;
  unidade?: string;
  cest?: string;
}

interface RequestBody {
  items: CartItem[];
  payment_method: 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'outros';
  total_amount: number;
  customer?: {
    cpf?: string;
    cnpj?: string;
    nome?: string;
  };
  order_id?: string;
}

// Mapeia método de pagamento para código Focus NFe
function getPaymentCode(method: string): string {
  const map: Record<string, string> = {
    dinheiro: '01',
    cartao_credito: '03',
    cartao_debito: '04',
    pix: '17',
    outros: '99',
  };
  return map[method] || '99';
}

// Limpa CPF/CNPJ removendo pontuação
function cleanDoc(doc?: string): string {
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

    // Autenticação
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

    // Rate limiting
    const { data: rateLimitCheck } = await supabase.rpc('check_fiscal_rate_limit', {
      p_user_id: user.id,
      p_function_name: 'emit-nfce',
      p_max_requests: 100,
      p_window_hours: 1,
    });

    if (!rateLimitCheck) {
      return new Response(
        JSON.stringify({ error: 'Limite de emissões excedido. Máximo 100 NFC-e por hora.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = (await req.json()) as RequestBody;

    if (!body.items || body.items.length === 0) {
      return new Response(JSON.stringify({ error: 'Itens são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar configurações Focus NFe
    const { data: focusSettings, error: focusError } = await supabase
      .from('focus_nfe_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (focusError || !focusSettings?.enabled) {
      return new Response(
        JSON.stringify({ error: 'Focus NFe não está habilitada nas configurações' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar dados da empresa emitente
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

    // Seleciona o token de acordo com o ambiente configurado
    const focusToken = isProducao
      ? Deno.env.get('FOCUS_NFE_TOKEN_PRODUCAO')
      : Deno.env.get('FOCUS_NFE_TOKEN_HOMOLOGACAO');

    if (!focusToken) {
      return new Response(
        JSON.stringify({
          error: isProducao
            ? 'Token Focus NFe de PRODUÇÃO não configurado'
            : 'Token Focus NFe de HOMOLOGAÇÃO não configurado',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const focusBaseUrl = isProducao
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';

    // Determinar destinatário
    // Se CPF/CNPJ vazio => "consumidor não identificado" (omite bloco destinatário)
    const cpf = cleanDoc(body.customer?.cpf);
    const cnpj = cleanDoc(body.customer?.cnpj);
    const hasIdentification = (cpf && cpf.length === 11) || (cnpj && cnpj.length === 14);

    // Validação SEFAZ: vendas acima de R$ 10.000 exigem CPF/CNPJ
    if (!hasIdentification && body.total_amount > 10000) {
      return new Response(
        JSON.stringify({
          error: 'Vendas acima de R$ 10.000 exigem identificação do consumidor (CPF ou CNPJ)',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Montar itens da NFC-e
    const focusItems = body.items.map((item, idx) => {
      const rawNcm = (item.ncm || focusSettings.ncm_padrao || '').replace(/\D/g, '');
      const ncm = rawNcm.length === 8 ? rawNcm : '';
      if (!ncm) {
        throw new Error(
          `NCM ausente ou inválido no item "${item.name}". Cadastre o NCM (8 dígitos) no produto ou defina um NCM padrão nas Configurações Focus NFe.`
        );
      }
      return {
        numero_item: idx + 1,
        codigo_produto: item.product_id.substring(0, 30),
        descricao: item.name,
        codigo_ncm: ncm,
        cfop: item.cfop || focusSettings.cfop_padrao || '5102',
        unidade_comercial: item.unidade || focusSettings.unidade_padrao || 'UN',
        quantidade_comercial: item.quantity.toFixed(4),
        valor_unitario_comercial: item.unit_price.toFixed(2),
        valor_unitario_tributavel: item.unit_price.toFixed(2),
        unidade_tributavel: item.unidade || focusSettings.unidade_padrao || 'UN',
        quantidade_tributavel: item.quantity.toFixed(4),
        valor_bruto: (item.quantity * item.unit_price).toFixed(2),
        icms_origem: item.origem || focusSettings.origem_padrao || '0',
        icms_situacao_tributaria: item.csosn || focusSettings.csosn_padrao || '102',
        ...(item.cest ? { cest: item.cest } : {}),
      };
    });

    // Referência única para idempotência
    const ref = `nfce-${user.id.substring(0, 8)}-${Date.now()}`;

    // Data de emissão no fuso local da empresa.
    // Para MT, o offset correto é -04:00; forçar -03:00 pode gerar rejeição na SEFAZ.
    // Adicionamos +2 minutos para compensar o tempo de processamento Focus -> SEFAZ
    // (a SEFAZ tolera até ~10 min no futuro, então 2 min é seguro e evita
    // a rejeição "Data-Hora de emissão atrasada" quando o fluxo demora).
    const FUTURE_OFFSET_MINUTES = 2;
    const now = new Date(Date.now() + FUTURE_OFFSET_MINUTES * 60 * 1000);
    const issuerUf = (company.uf || '').toUpperCase();
    const timezoneOffset = issuerUf === 'AC' ? '-05:00' : ['AM', 'MT', 'MS', 'RO', 'RR'].includes(issuerUf) ? '-04:00' : '-03:00';
    const timezoneOffsetMs = Number(timezoneOffset.slice(0, 3)) * 60 * 60 * 1000;
    const localIssuerTime = new Date(now.getTime() + timezoneOffsetMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dataEmissao =
      `${localIssuerTime.getUTCFullYear()}-${pad(localIssuerTime.getUTCMonth() + 1)}-${pad(localIssuerTime.getUTCDate())}` +
      `T${pad(localIssuerTime.getUTCHours())}:${pad(localIssuerTime.getUTCMinutes())}:${pad(localIssuerTime.getUTCSeconds())}${timezoneOffset}`;

    console.log('Data emissão NFC-e:', { dataEmissao, issuerUf, timezoneOffset, futureOffsetMinutes: FUTURE_OFFSET_MINUTES });

    // Payload Focus NFe NFC-e (modelo 65)
    const payload: Record<string, unknown> = {
      natureza_operacao: 'Venda ao consumidor',
      data_emissao: dataEmissao,
      tipo_documento: 1,
      finalidade_emissao: 1,
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
      presenca_comprador: 1, // 1 = Operação presencial (NFC-e)
      modalidade_frete: 9, // 9 = Sem ocorrência de transporte
      local_destino: 1, // 1 = Operação interna
      consumidor_final: 1,
      indicador_inscricao_estadual_destinatario: 9, // 9 = Não contribuinte
      items: focusItems,
      formas_pagamento: [
        {
          forma_pagamento: getPaymentCode(body.payment_method),
          valor_pagamento: body.total_amount.toFixed(2),
        },
      ],
    };

    // Adiciona destinatário SOMENTE se identificado
    // Se vazio => Focus emite como "CONSUMIDOR NÃO IDENTIFICADO" automaticamente
    if (hasIdentification) {
      if (cpf) {
        payload.cpf_destinatario = cpf;
      } else if (cnpj) {
        payload.cnpj_destinatario = cnpj;
      }
      if (body.customer?.nome) {
        payload.nome_destinatario = body.customer.nome;
      }
    }

    console.log('Emitindo NFC-e:', { ref, identified: hasIdentification, total: body.total_amount });

    // Registrar emissão pendente
    const { data: emission, error: emissionError } = await supabase
      .from('nfe_emissions')
      .insert({
        order_id: body.order_id || '00000000-0000-0000-0000-000000000000',
        status: 'pending',
        modelo: '65',
        ambiente: focusSettings.ambiente,
        tipo: 'saida',
        ref_focus: ref,
        valor_total: body.total_amount,
        products_count: body.items.length,
      })
      .select()
      .single();

    if (emissionError) {
      console.error('Erro ao registrar emissão:', emissionError);
    }

    // Chamar Focus NFe
    const url = `${focusBaseUrl}/v2/nfce?ref=${encodeURIComponent(ref)}`;
    const auth = btoa(`${focusToken}:`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { mensagem: responseText || `HTTP ${response.status}` };
    }

    if (!response.ok) {
      console.error('Focus NFe error:', response.status, responseText);

      // 401 = token inválido para o ambiente configurado
      if (response.status === 401) {
        const envLabel = isProducao ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO';
        const errMsg = `Token Focus NFe de ${envLabel} inválido ou não autorizado. Verifique o token cadastrado em Secrets ou troque o ambiente nas Configurações.`;
        if (emission) {
          await supabase.from('nfe_emissions').update({ status: 'error', error_message: errMsg }).eq('id', emission.id);
        }
        return new Response(
          JSON.stringify({ error: errMsg }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (emission) {
        await supabase
          .from('nfe_emissions')
          .update({
            status: 'error',
            error_message: result.mensagem || result.erros?.[0]?.mensagem || JSON.stringify(result),
          })
          .eq('id', emission.id);
      }
      return new Response(
        JSON.stringify({ error: result.mensagem || 'Erro ao emitir NFC-e', details: result }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atualizar emissão com resultado
    if (emission) {
      await supabase
        .from('nfe_emissions')
        .update({
          status: result.status === 'autorizado' ? 'success' : 'pending',
          nfe_number: result.numero || null,
          nfe_key: result.chave_nfe || null,
          nfe_xml_url: result.caminho_xml_nota_fiscal
            ? `${focusBaseUrl}${result.caminho_xml_nota_fiscal}`
            : null,
          danfe_url: result.caminho_danfe
            ? `${focusBaseUrl}${result.caminho_danfe}`
            : null,
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
        consumidor_identificado: hasIdentification,
        nfce: result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro ao emitir NFC-e:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
