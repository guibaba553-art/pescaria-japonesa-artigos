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

    if (settingsError || !settings?.nfe_enabled) {
      return new Response(
        JSON.stringify({ error: 'Sistema de NF-e não está habilitado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Separar itens que vão na nota dos que não vão
    const nfeItems = order.order_items.filter((item: any) => 
      item.products.include_in_nfe !== false
    );
    
    // Calcular valor total dos itens que vão na nota (SEM desconto)
    const nfeItemsTotal = nfeItems.reduce((sum: number, item: any) => 
      sum + (item.price_at_purchase * item.quantity), 0
    );

    // Aplicar desconto de 10% nos itens da nota
    const discountPercent = 0.10; // 10%
    const nfeItemsWithDiscount = nfeItemsTotal * (1 - discountPercent);
    const discountAmount = nfeItemsTotal - nfeItemsWithDiscount;

    // Frete na NF-e = Total do Pedido - Itens com Desconto
    // Isso compensa o desconto aplicado nos itens
    const totalShipping = Number(order.total_amount) - nfeItemsWithDiscount;

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
    console.log('Valor original dos itens:', nfeItemsTotal);
    console.log('Desconto aplicado (10%):', discountAmount);
    console.log('Valor dos itens COM desconto:', nfeItemsWithDiscount);
    console.log('Total do pedido:', order.total_amount);
    console.log('Frete na NF-e (absorve o desconto):', totalShipping);
    console.log('Dados do pedido:', order);

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
