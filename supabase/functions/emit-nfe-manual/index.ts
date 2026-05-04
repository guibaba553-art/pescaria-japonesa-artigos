import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cleanDoc = (doc?: string | null): string => (doc || '').replace(/\D/g, '');

interface ManualItem {
  descricao: string;
  ncm: string;
  cfop: string;
  unidade?: string;
  quantidade: number;
  valor_unitario: number;
  cest?: string;
  csosn?: string;
  origem?: string;
  codigo?: string;
}

interface ManualBody {
  serie?: number;
  numero?: number;                 // opcional — se não vier, Focus atribui
  finalidade: 1 | 2 | 3 | 4;       // 1 normal, 2 complementar, 3 ajuste, 4 devolução
  natureza_operacao: string;
  presenca_comprador?: number;     // 0..9 (default 1 — presencial)
  modalidade_frete?: number;       // 0..9 (default 9 — sem frete)
  consumidor_final?: 0 | 1;        // default 1
  // Ref a NF-e original (obrigatório p/ devolução/complementar)
  chave_referenciada?: string;
  // Destinatário
  destinatario: {
    tipo: 'cpf' | 'cnpj' | 'consumidor';
    documento?: string;
    nome?: string;
    inscricao_estadual?: string;
    indicador_ie?: 1 | 2 | 9;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  };
  items: ManualItem[];
  forma_pagamento?: string;        // 01,03,04,17,90,99 (default 90 — sem pagamento)
  observacoes?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleCheck } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'employee']);
    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: rl } = await supabase.rpc('check_fiscal_rate_limit', {
      p_user_id: user.id, p_function_name: 'emit-nfe-manual', p_max_requests: 30, p_window_hours: 1,
    });
    if (!rl) {
      return new Response(JSON.stringify({ error: 'Limite de emissões manuais excedido (30/h).' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as ManualBody;

    if (!body.items?.length) {
      return new Response(JSON.stringify({ error: 'Adicione ao menos 1 item' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!body.natureza_operacao?.trim()) {
      return new Response(JSON.stringify({ error: 'Natureza da operação é obrigatória' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if ((body.finalidade === 4 || body.finalidade === 2) && !body.chave_referenciada) {
      return new Response(JSON.stringify({
        error: 'Para Devolução ou Complementar é obrigatório informar a chave da NF-e referenciada (44 dígitos).'
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: focusSettings } = await supabase.from('focus_nfe_settings').select('*').limit(1).maybeSingle();
    if (!focusSettings?.enabled) {
      return new Response(JSON.stringify({ error: 'Focus NFe não está habilitada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: company } = await supabase.from('company_fiscal_data').select('*').limit(1).maybeSingle();
    if (!company) {
      return new Response(JSON.stringify({ error: 'Dados fiscais da empresa não cadastrados' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isProducao = focusSettings.ambiente === 'producao';
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

    // ---------- ITEMS ----------
    const focusItems = body.items.map((it, idx) => {
      const ncm = (it.ncm || '').replace(/\D/g, '');
      if (ncm.length !== 8) throw new Error(`NCM inválido no item ${idx + 1} ("${it.descricao}"). Use 8 dígitos.`);
      const qtd = Number(it.quantidade);
      const vUn = Number(it.valor_unitario);
      if (!(qtd > 0)) throw new Error(`Quantidade inválida no item ${idx + 1}`);
      if (!(vUn >= 0)) throw new Error(`Valor unitário inválido no item ${idx + 1}`);
      return {
        numero_item: idx + 1,
        codigo_produto: (it.codigo || `ITEM${idx + 1}`).substring(0, 30),
        descricao: it.descricao,
        codigo_ncm: ncm,
        cfop: it.cfop,
        unidade_comercial: it.unidade || 'UN',
        quantidade_comercial: qtd.toFixed(4),
        valor_unitario_comercial: vUn.toFixed(2),
        valor_unitario_tributavel: vUn.toFixed(2),
        unidade_tributavel: it.unidade || 'UN',
        quantidade_tributavel: qtd.toFixed(4),
        valor_bruto: (qtd * vUn).toFixed(2),
        icms_origem: it.origem || focusSettings.origem_padrao || '0',
        icms_situacao_tributaria: it.csosn || focusSettings.csosn_padrao || '102',
        ...(it.cest ? { cest: it.cest.replace(/\D/g, '') } : {}),
      };
    });
    const totalProdutos = focusItems.reduce((s, it) => s + Number(it.valor_bruto), 0);

    // ---------- DATA ----------
    const issuerUf = (company.uf || '').toUpperCase();
    const tz = issuerUf === 'AC' ? '-05:00'
      : ['AM', 'MT', 'MS', 'RO', 'RR'].includes(issuerUf) ? '-04:00' : '-03:00';
    const now = new Date();
    const tzMs = Number(tz.slice(0, 3)) * 60 * 60 * 1000;
    const local = new Date(now.getTime() + tzMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dataEmissao =
      `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
      `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${tz}`;

    // ---------- DESTINATÁRIO ----------
    const dest = body.destinatario;
    const docDest = cleanDoc(dest.documento);
    const destBlock: Record<string, unknown> = {};
    if (dest.tipo === 'cpf') {
      if (docDest.length !== 11) throw new Error('CPF do destinatário inválido');
      destBlock.cpf_destinatario = docDest;
      destBlock.indicador_inscricao_estadual_destinatario = 9;
    } else if (dest.tipo === 'cnpj') {
      if (docDest.length !== 14) throw new Error('CNPJ do destinatário inválido');
      destBlock.cnpj_destinatario = docDest;
      destBlock.indicador_inscricao_estadual_destinatario = dest.indicador_ie ?? (dest.inscricao_estadual ? 1 : 9);
      if (dest.inscricao_estadual && (dest.indicador_ie ?? 1) === 1) {
        destBlock.inscricao_estadual_destinatario = dest.inscricao_estadual.replace(/\D/g, '');
      }
    } else {
      // consumidor não identificado — só permitido se não for devolução/complementar
      destBlock.indicador_inscricao_estadual_destinatario = 9;
    }
    if (dest.nome) destBlock.nome_destinatario = dest.nome;
    if (dest.logradouro) destBlock.logradouro_destinatario = dest.logradouro;
    if (dest.numero) destBlock.numero_destinatario = dest.numero;
    if (dest.complemento) destBlock.complemento_destinatario = dest.complemento;
    if (dest.bairro) destBlock.bairro_destinatario = dest.bairro;
    if (dest.municipio) destBlock.municipio_destinatario = dest.municipio;
    if (dest.uf) destBlock.uf_destinatario = dest.uf.toUpperCase();
    if (dest.cep) destBlock.cep_destinatario = cleanDoc(dest.cep);

    const ufDest = (dest.uf || issuerUf).toUpperCase();
    const isInter = ufDest !== issuerUf;

    const serie = String(body.serie ?? focusSettings.serie_nfe ?? 1);
    const formaPag = body.forma_pagamento || (body.finalidade === 4 ? '90' : '99');

    const payload: Record<string, unknown> = {
      natureza_operacao: body.natureza_operacao,
      data_emissao: dataEmissao,
      data_entrada_saida: dataEmissao,
      tipo_documento: 1,
      finalidade_emissao: body.finalidade,
      serie,
      ...(body.numero ? { numero: String(body.numero) } : {}),
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
      ...destBlock,
      presenca_comprador: body.presenca_comprador ?? 1,
      modalidade_frete: body.modalidade_frete ?? 9,
      local_destino: isInter ? 2 : 1,
      consumidor_final: body.consumidor_final ?? 1,
      valor_produtos: totalProdutos.toFixed(2),
      valor_total: totalProdutos.toFixed(2),
      items: focusItems,
      formas_pagamento: [{ forma_pagamento: formaPag, valor_pagamento: totalProdutos.toFixed(2) }],
      ...(body.chave_referenciada ? { notas_referenciadas: [{ chave_nfe: body.chave_referenciada.replace(/\D/g, '') }] } : {}),
      ...(body.observacoes ? { informacoes_adicionais_contribuinte: body.observacoes } : {}),
    };

    const ref = `manual-${user.id.substring(0, 8)}-${Date.now()}`;

    const { data: emission } = await supabase.from('nfe_emissions').insert({
      order_id: '00000000-0000-0000-0000-000000000000',
      status: 'pending',
      modelo: '55',
      ambiente: focusSettings.ambiente,
      tipo: body.finalidade === 4 ? 'devolucao' : 'saida',
      ref_focus: ref,
      valor_total: totalProdutos,
      products_count: focusItems.length,
    }).select().single();

    const auth = btoa(`${focusToken}:`);
    const url = `${focusBaseUrl}/v2/nfe?ref=${encodeURIComponent(ref)}`;
    console.log('[emit-nfe-manual] POST', { ref, serie, finalidade: body.finalidade, items: focusItems.length });
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    let result: any;
    try { result = JSON.parse(txt); } catch { result = { mensagem: txt }; }

    if (!r.ok) {
      const errMsg = result.mensagem_sefaz || result.mensagem || result.erros?.[0]?.mensagem || `HTTP ${r.status}`;
      console.error('[emit-nfe-manual] error', r.status, txt);
      if (emission) {
        await supabase.from('nfe_emissions').update({ status: 'error', error_message: errMsg }).eq('id', emission.id);
      }
      return new Response(JSON.stringify({ error: errMsg, details: result }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (emission) {
      await supabase.from('nfe_emissions').update({
        status: result.status === 'autorizado' ? 'success' : 'pending',
        nfe_number: result.numero || null,
        nfe_key: result.chave_nfe || null,
        nfe_xml_url: result.caminho_xml_nota_fiscal ? `${focusBaseUrl}${result.caminho_xml_nota_fiscal}` : null,
        danfe_url: result.caminho_danfe ? `${focusBaseUrl}${result.caminho_danfe}` : null,
        protocolo: result.protocolo || null,
        emitted_at: result.status === 'autorizado' ? new Date().toISOString() : null,
      }).eq('id', emission.id);
    }

    return new Response(JSON.stringify({
      success: true, ref, status: result.status, nfe: result,
      message: result.status === 'autorizado'
        ? 'NF-e autorizada com sucesso'
        : 'NF-e enviada à SEFAZ. Use o histórico para verificar o status final.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[emit-nfe-manual] erro:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
