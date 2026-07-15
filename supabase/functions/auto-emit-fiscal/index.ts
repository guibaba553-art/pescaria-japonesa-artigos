// auto-emit-fiscal
// Chamada pelo trigger AFTER INSERT em orders (apenas PDV com pix/credit/debit).
// Carrega o pedido, itens, cliente e dispara emit-nfce (ou emit-nfe se CNPJ)
// internamente, garantindo a emissão mesmo se o navegador do operador fechar.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const pmMap: Record<string, 'cartao_credito' | 'cartao_debito' | 'pix'> = {
  credit: 'cartao_credito',
  debit: 'cartao_debito',
  pix: 'pix',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Apenas chamadas autenticadas com a service role key (trigger via pg_net)
    const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!SERVICE_ROLE || auth !== SERVICE_ROLE) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = body?.order_id;
    if (!orderId || typeof orderId !== 'string') {
      return new Response(JSON.stringify({ error: 'order_id obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Carrega pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, source, payment_method, total_amount, customer_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Pedido não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Só processa PDV com pix/credit/debit
    if (order.source !== 'pdv' || !['pix', 'credit', 'debit'].includes(String(order.payment_method))) {
      return new Response(JSON.stringify({ skipped: true, reason: 'not_applicable' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Idempotência: se já existe emissão recente para esse pedido, sai.
    const { data: existing } = await supabase
      .from('nfe_emissions')
      .select('id, status')
      .eq('order_id', orderId)
      .in('status', ['success', 'pending', 'processing'])
      .limit(1)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ skipped: true, reason: 'already_emitted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Carrega itens (com retry — o trigger pode disparar antes dos itens serem inseridos)
    let items: any[] | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data } = await supabase
        .from('order_items')
        .select('quantity, price_at_purchase, product_id, products(name, ncm, cfop, csosn, origem, unidade_comercial, cest)')
        .eq('order_id', orderId);
      if (data && data.length > 0) { items = data; break; }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Pedido sem itens após aguardar 10s' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Carrega cliente, se houver
    let customer: { cpf?: string; cnpj?: string; nome?: string } | undefined;
    let isCnpj = false;
    let preferredEmission: 'nfce' | 'nfe' | null = null;
    let fullCustomer: any = null;
    if (order.customer_id) {
      const { data: c } = await supabase
        .from('customers')
        .select('full_name, cpf, cnpj, company_name, inscricao_estadual, cep, street, number, complemento, neighborhood, municipio, uf, preferred_emission_type')
        .eq('id', order.customer_id)
        .maybeSingle();
      if (c) {
        fullCustomer = c as any;
        preferredEmission = ((c as any).preferred_emission_type as any) || null;
        const cnpj = String((c as any).cnpj || '').replace(/\D/g, '');
        const cpf = String((c as any).cpf || '').replace(/\D/g, '');
        if (cnpj.length === 14) {
          isCnpj = true;
          customer = {
            cnpj,
            nome: (c as any).company_name || c.full_name || undefined,
          };
        } else if (cpf.length === 11) {
          customer = {
            cpf,
            nome: c.full_name || undefined,
          };
        }
      }
    }

    // Decide modelo: respeita preferência do cliente; caso ausente, usa CNPJ → NF-e, CPF/sem doc → NFC-e
    const useNfe = preferredEmission === 'nfe' || (preferredEmission == null && isCnpj);

    // NF-e — delega para emit-nfe (suporta CPF e CNPJ)
    if (useNfe && fullCustomer) {
      const manualCustomer = {
        cnpj: customer?.cnpj,
        cpf: customer?.cpf,
        full_name: fullCustomer.full_name,
        company_name: fullCustomer.company_name,
        inscricao_estadual: fullCustomer.inscricao_estadual,
        cep: fullCustomer.cep,
        street: fullCustomer.street,
        number: fullCustomer.number,
        complemento: fullCustomer.complemento,
        neighborhood: fullCustomer.neighborhood,
        municipio: fullCustomer.municipio,
        uf: fullCustomer.uf,
      };
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/emit-nfe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE}`,
          'x-internal-secret': SERVICE_ROLE,
        },
        body: JSON.stringify({
          orderId,
          manualCustomer,
          _internal_user_id: order.user_id,
        }),
      });
      const text = await resp.text();
      return new Response(text, {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // NFC-e — payload completo
    const payload = {
      order_id: orderId,
      payment_method: pmMap[String(order.payment_method)],
      total_amount: Number(order.total_amount),
      customer,
      items: items.map((it: any) => ({
        product_id: it.product_id,
        name: it.products?.name || 'Produto',
        quantity: Number(it.quantity),
        unit_price: Number(it.price_at_purchase),
        ncm: it.products?.ncm || undefined,
        cfop: it.products?.cfop || undefined,
        csosn: it.products?.csosn || undefined,
        origem: it.products?.origem || undefined,
        unidade: it.products?.unidade_comercial || undefined,
        cest: it.products?.cest || undefined,
      })),
      _internal_user_id: order.user_id,
    };

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/emit-nfce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'x-internal-secret': SERVICE_ROLE,
      },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('auto-emit-fiscal error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'Erro desconhecido' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
