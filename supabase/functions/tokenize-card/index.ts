// Asaas credit card tokenization edge function
// POST /v3/creditCard/tokenizeCreditCard → save token to DB

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { findOrCreateCustomer } from '../_shared/asaasCustomer.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  
  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: 'Invalid auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    
    // Parse body
    const { cardNumber, holderName, expiryMonth, expiryYear, ccv, postalCode, addressNumber } = await req.json();
    if (!cardNumber || !holderName || !expiryMonth || !expiryYear || !ccv) {
      return new Response(JSON.stringify({ error: 'Missing required fields: cardNumber, holderName, expiryMonth, expiryYear, ccv' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!postalCode || !addressNumber) {
      return new Response(JSON.stringify({ error: 'Missing required fields: postalCode, addressNumber' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    // Asaas config
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
    if (!asaasApiKey) throw new Error('ASAAS_API_KEY não configurada');
    const asaasEnv = Deno.env.get('ASAAS_ENVIRONMENT') || 'sandbox';
    const baseUrl = asaasEnv === 'production' ? 'https://api.asaas.com' : 'https://api-sandbox.asaas.com';
    
    // Fetch profile for Asaas customer
    const { data: profile } = await supabase.from('profiles').select('full_name, cpf, phone').eq('id', user.id).single();
    
    // Find or create Asaas customer
    const customer = await findOrCreateCustomer(
      supabase,
      user.id,
      {
        name: profile?.full_name || holderName,
        email: user.email || '',
        cpfCnpj: profile?.cpf || '',
        phone: profile?.phone || '',
      },
      asaasApiKey,
      asaasEnv,
    );
    
    // Tokenize via Asaas
    const tokenizeResponse = await fetch(`${baseUrl}/v3/creditCard/tokenizeCreditCard`, {
      method: 'POST',
      headers: { 'access_token': asaasApiKey, 'Content-Type': 'application/json', 'User-Agent': 'JapasPesca/1.0.0' },
      body: JSON.stringify({
        customer: customer.id,
        creditCard: { holderName, number: cardNumber, expiryMonth, expiryYear, ccv },
        creditCardHolderInfo: {
          name: profile?.full_name || holderName,
          email: user.email || '',
          cpfCnpj: profile?.cpf || '',
          postalCode: postalCode || '',
          addressNumber: addressNumber || '',
          addressComplement: null,
          phone: profile?.phone || '',
          mobilePhone: profile?.phone || '',
        },
      }),
    });
    
    const tokenizeResult = await tokenizeResponse.json();
    
    if (!tokenizeResponse.ok) {
      const errorMsg = tokenizeResult?.errors?.[0]?.description || tokenizeResult?.error || 'Erro ao tokenizar cartão';
      return new Response(JSON.stringify({ success: false, error: errorMsg }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    return new Response(JSON.stringify({ success: true, creditCardToken: tokenizeResult.creditCardToken }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Erro em tokenize-card:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

if (!Deno.env.get("DENO_TEST")) {
  serve(handleRequest);
}
