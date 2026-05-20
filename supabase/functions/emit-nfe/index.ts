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
  const UF_RE = /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/;
  const ufMatch = safe.toUpperCase().match(UF_RE);
  const cepMatch = safe.match(/(\d{5}-?\d{3})/);

  // "Rua X, 123 - Centro, Cidade - UF, 78000-000"
  const parts = safe.split(/[,\-]/).map((s) => s.trim()).filter(Boolean);

  // Localiza município pelo segmento imediatamente antes do UF (evita capturar "SUL", "NORTE" etc.)
  let municipio = '';
  if (ufMatch) {
    const ufIdx = parts.findIndex((p) => p.toUpperCase() === ufMatch[1]);
    if (ufIdx > 0) municipio = parts[ufIdx - 1];
  }
  // Se não conseguimos identificar um município com confiança a partir da string,
  // deixamos VAZIO para que os dados estruturados do cliente possam preencher.
  // (Antes caía num fallback "CUIABA" que sobrescrevia clientes de outras cidades.)

  // Detecta placeholders como "Venda Presencial" — não devem virar logradouro real
  const looksLikePlaceholder = parts.length <= 1 && !ufMatch && !cepMatch;

  return {
    logradouro: looksLikePlaceholder ? '' : (parts[0] || ''),
    numero: looksLikePlaceholder ? '' : ((parts[1] || '').replace(/\D/g, '') || ''),
    bairro: looksLikePlaceholder ? '' : (parts[2] || ''),
    municipio,
    uf: ufMatch ? ufMatch[1] : '',
    cep: cepMatch ? cleanDoc(cepMatch[1]) : '',
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
    // Aceita: (1) Bearer de admin/employee OU (2) service_role (chamada interna,
    // ex. payment-webhook para emissão automática após pagamento aprovado).
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isServiceRole = !!token && token === serviceRoleKey;

    let userIdForRateLimit: string | null = null;

    if (!isServiceRole) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

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

      userIdForRateLimit = user.id;

      // ---------- RATE LIMIT (somente para usuários humanos) ----------
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
    } else {
      console.log('[emit-nfe] Chamada interna via service_role (emissão automática)');
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
    // Para NF-e (modelo 55) os dados do destinatário são OBRIGATÓRIOS:
    // nome, CPF/CNPJ e endereço completo (logradouro, número, bairro, município, UF e CEP).
    // Se o pedido tiver customer_id, usamos os dados estruturados de `customers`;
    // caso contrário, usamos o profile + shipping_address parseado.
    let destNome = (profile?.full_name || '').trim();
    let destCpf = cleanDoc(profile?.cpf);
    let destCnpj = '';
    let destIE = '';
    const addr = parseAddress(order.shipping_address);

    // Helper: trata "00000000" e strings vazias como ausente
    const isBlank = (v?: string | null) => {
      const s = String(v || '').trim();
      return !s || s === '00000000' || s.toUpperCase() === 'NAO INFORMADO';
    };

    // Prioridade 1: campos estruturados gravados no próprio pedido
    if (!isBlank(order.shipping_street)) addr.logradouro = order.shipping_street;
    if (!isBlank(order.shipping_number)) addr.numero = order.shipping_number;
    if (!isBlank(order.shipping_complement)) addr.complemento = order.shipping_complement;
    if (!isBlank(order.shipping_neighborhood)) addr.bairro = order.shipping_neighborhood;
    if (!isBlank(order.shipping_city)) addr.municipio = order.shipping_city;
    if (!isBlank(order.shipping_uf)) addr.uf = order.shipping_uf;
    if (!isBlank(order.shipping_cep)) addr.cep = cleanDoc(order.shipping_cep);
    if (!isBlank(order.shipping_recipient_name)) destNome = (order.shipping_recipient_name || '').trim();

    // Prioridade 2: dados estruturados do customer
    if (order.customer_id) {
      const { data: cust } = await supabase
        .from('customers')
        .select('full_name, company_name, cpf, cnpj, inscricao_estadual, cep, street, number, neighborhood, municipio, uf, complemento')
        .eq('id', order.customer_id)
        .maybeSingle();
      if (cust) {
        destNome = (cust.company_name || cust.full_name || destNome || '').trim();
        destCpf = cleanDoc(cust.cpf);
        destCnpj = cleanDoc(cust.cnpj);
        destIE = (cust.inscricao_estadual || '').trim();
        if (isBlank(addr.logradouro) && !isBlank(cust.street)) addr.logradouro = cust.street!;
        if (isBlank(addr.numero) && !isBlank(cust.number)) addr.numero = cust.number!;
        if (isBlank(addr.bairro) && !isBlank(cust.neighborhood)) addr.bairro = cust.neighborhood!;
        if (isBlank(addr.cep) && !isBlank(cust.cep)) addr.cep = cleanDoc(cust.cep);
        if (isBlank(addr.municipio) && !isBlank(cust.municipio)) addr.municipio = cust.municipio!;
        if (isBlank(addr.uf) && !isBlank(cust.uf)) addr.uf = cust.uf!;
        if (isBlank(addr.complemento) && !isBlank(cust.complemento)) addr.complemento = cust.complemento!;
      }
    }


    const hasCpf = destCpf.length === 11;
    const hasCnpj = destCnpj.length === 14;

    const computeMissing = () => {
      const m: string[] = [];
      if (!destNome) m.push('nome');
      if (!hasCpf && !hasCnpj) m.push('CPF ou CNPJ');
      if (!addr.logradouro || addr.logradouro === 'NAO INFORMADO') m.push('logradouro');
      if (!addr.numero) m.push('número');
      if (!addr.bairro) m.push('bairro');
      if (!addr.municipio) m.push('município');
      if (!addr.uf) m.push('UF');
      if (!addr.cep || addr.cep === '00000000' || addr.cep.length !== 8) m.push('CEP');
      return m;
    };

    let missingClient = computeMissing();

    // Fallback automático: se faltar endereço/CEP e o cliente tem CNPJ,
    // consulta a Focus por CNPJ pra preencher os campos faltantes e
    // grava de volta no cadastro do cliente para reaproveitar.
    const needsAddress = missingClient.some((f) =>
      ['logradouro', 'número', 'bairro', 'município', 'UF', 'CEP'].includes(f)
    );
    if (needsAddress && hasCnpj) {
      try {
        const isProducaoLookup = focusSettings.ambiente === 'producao';
        const lookupToken = isProducaoLookup
          ? Deno.env.get('FOCUS_NFE_TOKEN_PRINCIPAL')
          : Deno.env.get('FOCUS_NFE_TOKEN_HOMOLOGACAO');
        const lookupBase = isProducaoLookup
          ? 'https://api.focusnfe.com.br'
          : 'https://homologacao.focusnfe.com.br';
        if (lookupToken) {
          const lookupAuth = btoa(`${lookupToken}:`);
          const ac = new AbortController();
          const t = setTimeout(() => ac.abort(), 15000);
          const r = await fetch(`${lookupBase}/v2/cnpjs/${destCnpj}?completo=1`, {
            headers: { Authorization: `Basic ${lookupAuth}` },
            signal: ac.signal,
          }).catch(() => null);
          clearTimeout(t);
          if (r && r.ok) {
            const d: any = await r.json().catch(() => ({}));
            const end = d.endereco || {};
            const fillIf = (cur: string, val: any) =>
              (!cur || cur === 'NAO INFORMADO') && val ? String(val).trim() : cur;
            addr.logradouro = fillIf(addr.logradouro, end.logradouro || d.logradouro);
            addr.numero = fillIf(addr.numero, end.numero || d.numero);
            addr.bairro = fillIf(addr.bairro, end.bairro || d.bairro);
            addr.municipio = fillIf(addr.municipio, end.nome_municipio || end.municipio || d.municipio);
            addr.uf = fillIf(addr.uf, end.uf || d.uf);
            const cepFound = String(end.cep || d.cep || '').replace(/\D/g, '');
            if ((!addr.cep || addr.cep.length !== 8) && cepFound.length === 8) addr.cep = cepFound;
            if (!destNome) destNome = (d.razao_social || d.nome || '').trim();

            // Persiste no cadastro do cliente para próximas emissões
            if (order.customer_id) {
              await supabase.from('customers').update({
                street: addr.logradouro || null,
                number: addr.numero || null,
                neighborhood: addr.bairro || null,
                municipio: addr.municipio || null,
                uf: addr.uf || null,
                cep: addr.cep || null,
              }).eq('id', order.customer_id);
            }
            missingClient = computeMissing();
          }
        }
      } catch (e) {
        console.warn('Fallback CNPJ lookup falhou:', (e as Error).message);
      }
    }

    // Fallback ViaCEP: se temos CEP mas faltam logradouro/bairro/município/UF,
    // consulta ViaCEP (gratuito) e completa. Funciona pra CPF e CNPJ.
    const stillNeedsStreetParts = () => {
      const m = computeMissing();
      return m.some((f) => ['logradouro', 'bairro', 'município', 'UF'].includes(f));
    };
    if (stillNeedsStreetParts() && addr.cep && addr.cep.length === 8) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 8000);
        const r = await fetch(`https://viacep.com.br/ws/${addr.cep}/json/`, { signal: ac.signal }).catch(() => null);
        clearTimeout(t);
        if (r && r.ok) {
          const v: any = await r.json().catch(() => ({}));
          if (!v.erro) {
            if (isBlank(addr.logradouro) && v.logradouro) addr.logradouro = String(v.logradouro).trim();
            if (isBlank(addr.bairro) && v.bairro) addr.bairro = String(v.bairro).trim();
            if (isBlank(addr.municipio) && v.localidade) addr.municipio = String(v.localidade).trim();
            if (isBlank(addr.uf) && v.uf) addr.uf = String(v.uf).trim().toUpperCase();
            if (isBlank(addr.complemento) && v.complemento) addr.complemento = String(v.complemento).trim();

            if (order.customer_id) {
              await supabase.from('customers').update({
                street: addr.logradouro || null,
                neighborhood: addr.bairro || null,
                municipio: addr.municipio || null,
                uf: addr.uf || null,
                complemento: addr.complemento || null,
              }).eq('id', order.customer_id);
            }
            missingClient = computeMissing();
          }
        }
      } catch (e) {
        console.warn('Fallback ViaCEP falhou:', (e as Error).message);
      }
    }

    // Último recurso: número fica "S/N" quando o resto do endereço está completo
    if (missingClient.includes('número')
      && !isBlank(addr.logradouro) && !isBlank(addr.bairro)
      && !isBlank(addr.municipio) && !isBlank(addr.uf) && addr.cep?.length === 8) {
      addr.numero = 'S/N';
      if (order.customer_id) {
        await supabase.from('customers').update({ number: 'S/N' }).eq('id', order.customer_id);
      }
      missingClient = computeMissing();
    }




    if (missingClient.length > 0) {
      return new Response(
        JSON.stringify({
          error:
            'Dados do cliente incompletos para emissão de NF-e. Faltam: ' +
            missingClient.join(', ') +
            '. Vincule um cliente completo ao pedido antes de emitir.',
          missing_client_fields: missingClient,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
        // PIS — obrigatório. CST 49 = Outras operações (Simples Nacional)
        pis_situacao_tributaria: '49',
        // COFINS — obrigatório
        cofins_situacao_tributaria: '49',
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
    // Controlamos o número da NF-e localmente para evitar dessincronia com a SEFAZ
    // (Rejeição 539 - duplicidade). O contador `proximo_numero_nfe` é incrementado
    // a cada emissão. Em caso de duplicidade, basta ajustar esse campo nas
    // configurações fiscais para o próximo número livre na SEFAZ.
    const nfeSeries = String(focusSettings.serie_nfe || 1);
    const nfeNumero = Number(focusSettings.proximo_numero_nfe || 1);

    // ---------- PAYLOAD ----------
    // Soma a partir das strings já arredondadas (.toFixed(2)) para casar exatamente
    // com o que a SEFAZ recalcula a partir do XML enviado.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const totalProdutos = round2(
      focusItems.reduce((sum, it) => sum + Number(it.valor_bruto), 0)
    );
    const valorFrete = round2(Number(order.shipping_cost || 0));
    const valorTotal = round2(totalProdutos + valorFrete);
    const valorTotalStr = valorTotal.toFixed(2);

    const buildPayload = (dataEmissao: string): Record<string, unknown> => ({
      natureza_operacao: 'Venda de mercadoria',
      data_emissao: dataEmissao,
      data_entrada_saida: dataEmissao,
      tipo_documento: 1,
      finalidade_emissao: 1,
      serie: nfeSeries,
      numero: String(nfeNumero),
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

      // Destinatário
      nome_destinatario: destNome,
      ...(hasCnpj
        ? { cnpj_destinatario: destCnpj }
        : { cpf_destinatario: destCpf }),
      logradouro_destinatario: addr.logradouro,
      numero_destinatario: addr.numero,
      bairro_destinatario: addr.bairro,
      municipio_destinatario: addr.municipio,
      uf_destinatario: addr.uf,
      cep_destinatario: addr.cep,
      // Indicador IE: 1=Contribuinte (com IE), 2=Isento (PJ sem IE), 9=Não contribuinte (PF)
      indicador_inscricao_estadual_destinatario: (() => {
        if (!hasCnpj) return 9;
        const ieDigits = (destIE || '').replace(/\D/g, '');
        return ieDigits.length > 0 ? 1 : 2;
      })(),
      ...((() => {
        const ieDigits = (destIE || '').replace(/\D/g, '');
        return hasCnpj && ieDigits.length > 0 ? { inscricao_estadual_destinatario: ieDigits } : {};
      })()),


      presenca_comprador: 2,    // operação não presencial — internet
      modalidade_frete: 0,      // por conta do emitente
      local_destino: isInterestadual ? 2 : 1,
      consumidor_final: 1,

      valor_frete: valorFrete.toFixed(2),
      valor_produtos: totalProdutos.toFixed(2),
      valor_total: valorTotalStr,

      items: focusItems,
      formas_pagamento: [
        {
          forma_pagamento: '99',
          valor_pagamento: valorTotalStr,
        },
      ],
    });

    const userPrefix = (userIdForRateLimit || 'service0').substring(0, 8);
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
    const ac = new AbortController();
    const focusTimeout = setTimeout(() => ac.abort(), 25000);
    let focusResp: Response;
    try {
      focusResp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
    } catch (err) {
      clearTimeout(focusTimeout);
      const msg = (err as Error).name === 'AbortError'
        ? 'Tempo de resposta da Focus excedido (25s). Tente novamente.'
        : `Falha ao chamar Focus: ${(err as Error).message}`;
      if (emission) {
        await supabase.from('nfe_emissions').update({ status: 'error', error_message: msg }).eq('id', emission.id);
      }
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    clearTimeout(focusTimeout);

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

    // Incrementa o contador local de NF-e (a Focus aceitou o envio).
    await supabase
      .from('focus_nfe_settings')
      .update({ proximo_numero_nfe: nfeNumero + 1 })
      .eq('id', focusSettings.id);

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
