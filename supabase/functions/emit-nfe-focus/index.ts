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
    if (!authHeader) {
      return jsonResponse({ error: 'Não autorizado' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) return jsonResponse({ error: 'Não autorizado' }, 401);

    // Verificar admin
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return jsonResponse({ error: 'Apenas admins podem emitir NF-e' }, 403);

    // Rate limit
    const { data: rateOk } = await supabase.rpc('check_fiscal_rate_limit', {
      p_user_id: user.id,
      p_function_name: 'emit-nfe-focus',
      p_max_requests: 30,
      p_window_hours: 1
    });
    if (!rateOk) return jsonResponse({ error: 'Limite de 30 emissões por hora excedido' }, 429);

    const body = await req.json();
    const { orderId, modelo = '55' } = body; // 55 = NF-e, 65 = NFC-e

    if (!orderId) return jsonResponse({ error: 'orderId é obrigatório' }, 400);

    // Buscar configurações
    const [{ data: settings }, { data: company }] = await Promise.all([
      supabase.from('focus_nfe_settings').select('*').limit(1).maybeSingle(),
      supabase.from('company_fiscal_data').select('*').limit(1).maybeSingle()
    ]);

    if (!settings?.enabled) return jsonResponse({ error: 'Focus NFe não está habilitado nas configurações' }, 400);
    if (!company) return jsonResponse({ error: 'Cadastre os dados fiscais da empresa primeiro' }, 400);

    const token = settings.ambiente === 'producao'
      ? Deno.env.get('FOCUS_NFE_TOKEN_PRODUCAO')
      : Deno.env.get('FOCUS_NFE_TOKEN_HOMOLOGACAO');

    if (!token) return jsonResponse({ error: `Token Focus NFe (${settings.ambiente}) não configurado` }, 400);

    const baseUrl = settings.ambiente === 'producao' ? FOCUS_URL_PRODUCAO : FOCUS_URL_HOMOLOGACAO;

    // Buscar pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*)), customers(*), profiles(full_name, cpf, phone)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) return jsonResponse({ error: 'Pedido não encontrado' }, 404);

    // Filtrar itens que entram na nota
    const itensFiscais = (order.order_items || []).filter((it: any) => it.products?.include_in_nfe !== false);
    if (itensFiscais.length === 0) return jsonResponse({ error: 'Nenhum item do pedido está marcado para emissão fiscal' }, 400);

    const valorProdutos = itensFiscais.reduce((s: number, it: any) => s + Number(it.price_at_purchase) * Number(it.quantity), 0);
    const valorTotal = valorProdutos + Number(order.shipping_cost || 0);

    // Dados do destinatário
    const cliente = order.customers || order.profiles;
    const cpfCliente = (cliente?.cpf || '').replace(/\D/g, '');

    // Montar payload Focus NFe
    const ref = `${modelo}-${orderId}-${Date.now()}`;
    const cfopPadrao = settings.cfop_padrao || '5102';

    const payload: any = {
      natureza_operacao: 'Venda de mercadoria',
      data_emissao: new Date().toISOString(),
      tipo_documento: 1, // 1 = saída
      finalidade_emissao: 1, // 1 = normal
      consumidor_final: 1,
      presenca_comprador: modelo === '65' ? 1 : 2, // 1=presencial(NFCe), 2=internet(NFe)
      modalidade_frete: 9, // 9 = sem frete
      // Emitente
      cnpj_emitente: company.cnpj.replace(/\D/g, ''),
      nome_emitente: company.razao_social,
      nome_fantasia_emitente: company.nome_fantasia || company.razao_social,
      logradouro_emitente: company.logradouro,
      numero_emitente: company.numero,
      bairro_emitente: company.bairro,
      municipio_emitente: company.municipio,
      uf_emitente: company.uf,
      cep_emitente: company.cep.replace(/\D/g, ''),
      inscricao_estadual_emitente: company.inscricao_estadual,
      regime_tributario_emitente: company.regime_tributario === 'simples_nacional' ? 1 : 3,
      // Itens
      items: itensFiscais.map((it: any, idx: number) => {
        const prod = it.products;
        return {
          numero_item: idx + 1,
          codigo_produto: prod.sku || prod.id.slice(0, 20),
          descricao: prod.name,
          cfop: prod.cfop || cfopPadrao,
          unidade_comercial: prod.unidade_comercial || settings.unidade_padrao || 'UN',
          quantidade_comercial: Number(it.quantity),
          valor_unitario_comercial: Number(it.price_at_purchase).toFixed(4),
          valor_unitario_tributavel: Number(it.price_at_purchase).toFixed(4),
          unidade_tributavel: prod.unidade_comercial || settings.unidade_padrao || 'UN',
          quantidade_tributavel: Number(it.quantity),
          codigo_ncm: prod.ncm || settings.ncm_padrao || '95079000',
          icms_origem: prod.origem || settings.origem_padrao || '0',
          icms_situacao_tributaria: prod.csosn || settings.csosn_padrao || '102',
          inclui_no_total: 1,
        };
      }),
      // Frete (apenas NF-e, NFC-e geralmente sem frete)
      ...(modelo === '55' && Number(order.shipping_cost) > 0 ? { valor_frete: Number(order.shipping_cost).toFixed(2) } : {}),
    };

    // Destinatário (NF-e exige; NFC-e opcional)
    if (modelo === '55' || cpfCliente) {
      payload.nome_destinatario = cliente?.full_name || 'CONSUMIDOR';
      if (cpfCliente.length === 11) payload.cpf_destinatario = cpfCliente;
      if (modelo === '55') {
        payload.logradouro_destinatario = order.shipping_address?.split(',')[0] || 'Não informado';
        payload.numero_destinatario = 'S/N';
        payload.bairro_destinatario = 'Não informado';
        payload.cep_destinatario = (order.shipping_cep || '').replace(/\D/g, '');
        payload.municipio_destinatario = company.municipio;
        payload.uf_destinatario = company.uf;
      }
    }

    // Registrar pendente
    const { data: emission, error: emErr } = await supabase
      .from('nfe_emissions')
      .insert({
        order_id: orderId,
        modelo,
        ambiente: settings.ambiente,
        ref_focus: ref,
        status: 'processing',
        valor_total: valorTotal,
        products_count: itensFiscais.length,
      })
      .select()
      .single();

    if (emErr) throw emErr;

    // Chamar Focus NFe
    const endpoint = modelo === '65' ? `/v2/nfce?ref=${ref}` : `/v2/nfe?ref=${ref}`;
    const focusResp = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${token}:`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const focusData = await focusResp.json();
    console.log('Focus NFe response:', focusResp.status, focusData);

    if (!focusResp.ok && focusResp.status !== 202) {
      const errMsg = focusData?.mensagem || focusData?.erros?.[0]?.mensagem || JSON.stringify(focusData);
      await supabase.from('nfe_emissions').update({
        status: 'error',
        error_message: errMsg,
      }).eq('id', emission.id);
      return jsonResponse({ error: `Focus NFe: ${errMsg}`, details: focusData }, 400);
    }

    // Sucesso (202 = processando, ou já autorizada)
    await supabase.from('nfe_emissions').update({
      status: focusData.status === 'autorizado' ? 'success' : 'processing',
      nfe_number: focusData.numero,
      nfe_key: focusData.chave_nfe,
      nfe_xml_url: focusData.caminho_xml_nota_fiscal ? `${baseUrl}${focusData.caminho_xml_nota_fiscal}` : null,
      danfe_url: focusData.caminho_danfe ? `${baseUrl}${focusData.caminho_danfe}` : null,
      protocolo: focusData.protocolo,
      emitted_at: focusData.status === 'autorizado' ? new Date().toISOString() : null,
    }).eq('id', emission.id);

    return jsonResponse({
      success: true,
      ref,
      status: focusData.status,
      message: focusData.status === 'autorizado'
        ? 'Nota fiscal emitida com sucesso!'
        : 'Nota enviada à SEFAZ. Aguardando autorização (consulte em alguns segundos).',
      nfe: focusData,
    });

  } catch (error: any) {
    console.error('Erro ao emitir NF-e:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
