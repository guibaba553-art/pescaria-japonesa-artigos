import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { processAsaasCreditCardPayment } from '../_shared/asaasPayment.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const timeoutId = setTimeout(() => {
    console.error('Function timed out after 60s');
  }, 60_000);

  try {
    const body = await req.json();
    return await processAsaasCreditCardPayment(req, body, {
      checkDuplicateCharge: false,
      checkTimeWindow: true,
      forceInstallmentFields: true,
    });
  } catch (error) {
    console.error('Erro em retry-payment-asaas:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } finally {
    clearTimeout(timeoutId);
  }
});
