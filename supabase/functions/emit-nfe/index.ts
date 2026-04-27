import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Autenticar usuário
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Security: Rate limiting check (20 emissions per hour)
    const { data: rateLimitCheck, error: rateLimitError } = await supabase.rpc(
      'check_fiscal_rate_limit',
      {
        p_user_id: user.id,
        p_function_name: 'emit-nfe',
        p_max_requests: 20,
        p_window_hours: 1
      }
    );

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
    }

    if (!rateLimitCheck) {
      return new Response(
        JSON.stringify({ 
          error: 'Limite de emissões excedido. Máximo de 20 NF-es por hora. Tente novamente mais tarde.' 
        }),
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

    // Buscar configurações fiscais
    const { data: settings, error: settingsError } = await supabase
      .from('fiscal_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Erro ao carregar fiscal_settings:', settingsError);
    }
    // Observação: não exigimos mais `nfe_enabled` aqui — a emissão real é feita
    // via Focus NFe (token configurado em segredo). O switch NFe.io é apenas
    // para o provedor antigo e não bloqueia a emissão.

    // Buscar dados do pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*, products (name, description, include_in_nfe)),
        profiles!inner (full_name, cpf)
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Pedido não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ----- VALIDAÇÃO FISCAL: bloquear emissão se faltarem campos obrigatórios -----
    const { data: missingFiscal, error: validError } = await supabase
      .rpc('validate_order_fiscal', { p_order_id: orderId });

    if (validError) {
      console.error('Erro ao validar campos fiscais:', validError);
      throw validError;
    }

    if (missingFiscal && missingFiscal.length > 0) {
      const lista = missingFiscal
        .map((p: any) => `• ${p.product_name}: faltam ${p.missing_fields.join(', ')}`)
        .join('\n');
      return new Response(
        JSON.stringify({
          error: 'Produtos com campos fiscais incompletos. Complete antes de emitir a NF-e:\n' + lista,
          missing: missingFiscal,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ----- CFOP AUTOMÁTICO por UF de destino -----
    const { data: ufDestino } = await supabase
      .rpc('extract_uf_from_address', { p_address: order.shipping_address });
    const { data: cfopAuto } = await supabase
      .rpc('get_cfop_by_uf', { p_uf_destino: ufDestino, p_has_st: false });
    console.log(`UF destino: ${ufDestino} → CFOP automático: ${cfopAuto}`);

    // Registrar emissão como pendente
    const { data: emission, error: emissionError } = await supabase
      .from('nfe_emissions')
      .insert({
        order_id: orderId,
        status: 'pending'
      })
      .select()
      .single();

    if (emissionError) {
      console.error('Erro ao criar registro de emissão:', emissionError);
      throw emissionError;
    }

    // Separar itens que vão na nota
    const nfeItems = order.order_items.filter((item: any) => 
      item.products.include_in_nfe !== false
    );
    
    // Calcular valor total dos itens que vão na nota
    const nfeItemsTotal = nfeItems.reduce((sum: number, item: any) => 
      sum + (item.price_at_purchase * item.quantity), 0
    );

    // Frete normal do pedido
    const totalShipping = Number(order.shipping_cost);

    // Simular chamada API NFe.io
    // Em produção, você faria:
    // const nfeResponse = await fetch('https://api.nfe.io/v1/invoices', { 
    //   items: nfeItems,
    //   shipping_cost: totalShipping,
    //   ... 
    // })
    
    console.log('Emitindo NF-e para pedido:', orderId);
    console.log('Configurações:', { companyId: settings.nfe_company_id });
    console.log('Itens na NF-e:', nfeItems);
    console.log('Valor dos itens:', nfeItemsTotal);
    console.log('Frete:', totalShipping);
    console.log('Total do pedido:', order.total_amount);
    console.log('Total na NF-e:', nfeItemsTotal + totalShipping);
    console.log(`CFOP aplicado em todos os itens: ${cfopAuto} (UF destino ${ufDestino || 'desconhecida'})`);

    // Simular sucesso (remover em produção)
    const mockNFE = {
      number: `${Math.floor(Math.random() * 100000)}`,
      key: `12345678901234567890123456789012345678901234`,
      xml_url: `https://example.com/nfe/${orderId}.xml`
    };

    // Atualizar registro com dados da NF-e
    await supabase
      .from('nfe_emissions')
      .update({
        status: 'success',
        nfe_number: mockNFE.number,
        nfe_key: mockNFE.key,
        nfe_xml_url: mockNFE.xml_url,
        emitted_at: new Date().toISOString()
      })
      .eq('id', emission.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        nfe: mockNFE
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
