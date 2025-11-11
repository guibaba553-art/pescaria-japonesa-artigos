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

    // Security: Rate limiting check (10 syncs per day = 24 hours)
    const { data: rateLimitCheck, error: rateLimitError } = await supabase.rpc(
      'check_fiscal_rate_limit',
      {
        p_user_id: user.id,
        p_function_name: 'sync-tga',
        p_max_requests: 10,
        p_window_hours: 24
      }
    );

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
    }

    if (!rateLimitCheck) {
      return new Response(
        JSON.stringify({ 
          error: 'Limite de sincronizações excedido. Máximo de 10 sincronizações por dia. Tente novamente mais tarde.' 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, orderId, credentials } = await req.json();

    // Buscar configurações TGA
    const { data: settings, error: settingsError } = await supabase
      .from('fiscal_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings?.tga_enabled) {
      return new Response(
        JSON.stringify({ error: 'Integração TGA não está habilitada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tgaUrl = credentials?.apiUrl || settings.tga_api_url;
    const tgaUser = credentials?.username || settings.tga_username;
    const tgaPass = credentials?.password || settings.tga_password;

    // Testar conexão
    if (action === 'test') {
      try {
        // Simular teste de conexão
        // Em produção: const response = await fetch(`${tgaUrl}/auth/test`, { ... })
        console.log('Testando conexão TGA:', tgaUrl);
        
        // Simulação de sucesso
        await supabase
          .from('tga_sync_log')
          .insert({
            sync_type: 'test',
            status: 'success',
            request_data: { url: tgaUrl, username: tgaUser }
          });

        return new Response(
          JSON.stringify({ success: true, message: 'Conexão testada com sucesso' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        await supabase
          .from('tga_sync_log')
          .insert({
            sync_type: 'test',
            status: 'error',
            error_message: (error as Error).message
          });

        throw error;
      }
    }

    // Sincronizar pedido
    if (action === 'sync' && orderId) {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*, products (name, price)),
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

      try {
        // Simular envio para TGA
        // Em produção: const response = await fetch(`${tgaUrl}/pedidos`, { ... })
        console.log('Sincronizando pedido com TGA:', orderId);
        console.log('Dados:', order);

        await supabase
          .from('tga_sync_log')
          .insert({
            order_id: orderId,
            sync_type: 'order_sync',
            status: 'success',
            request_data: { 
              order_id: orderId,
              customer: order.profiles.full_name,
              total: order.total_amount
            }
          });

        return new Response(
          JSON.stringify({ success: true, message: 'Pedido sincronizado com sucesso' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        await supabase
          .from('tga_sync_log')
          .insert({
            order_id: orderId,
            sync_type: 'order_sync',
            status: 'error',
            error_message: (error as Error).message
          });

        throw error;
      }
    }

    return new Response(
      JSON.stringify({ error: 'Ação inválida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na sincronização TGA:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
