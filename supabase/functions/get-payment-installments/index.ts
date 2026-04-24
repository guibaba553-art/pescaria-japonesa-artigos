import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const requestSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(1000000, 'Amount exceeds maximum'),
  cardNumber: z.string().min(6).max(19),
  paymentMethod: z.enum(['credit', 'debit']).default('credit'),
});

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const buildFallbackOptions = (amount: number) => [{
  installments: 1,
  installmentAmount: Number(amount.toFixed(2)),
  totalAmount: Number(amount.toFixed(2)),
  label: `1x de ${formatCurrency(amount)} à vista`,
}];

const detectCardBrand = (cardNumber: string, method: 'credit' | 'debit'): string | null => {
  const num = cardNumber.replace(/\D/g, '');
  const first6 = num.substring(0, 6);
  const first4 = num.substring(0, 4);
  const first2 = num.substring(0, 2);
  const first1 = num.substring(0, 1);

  if (first1 === '4') return method === 'debit' ? 'debvisa' : 'visa';

  const n2 = parseInt(first2);
  const n4 = parseInt(first4);
  if ((n2 >= 51 && n2 <= 55) || (n4 >= 2221 && n4 <= 2720)) {
    return method === 'debit' ? 'debmaster' : 'master';
  }

  const eloBins = ['401178', '401179', '438935', '457631', '457632', '504175', '627780', '636297', '636368'];
  if (eloBins.some((bin) => first6.startsWith(bin))) {
    return method === 'debit' ? 'debelo' : 'elo';
  }

  if (first6.startsWith('606282') || first6.startsWith('384100') || first6.startsWith('384140') || first6.startsWith('384160')) {
    return 'hipercard';
  }

  if (first2 === '34' || first2 === '37') return 'amex';
  if ((n2 === 30 && parseInt(num.substring(2, 3)) <= 5) || first2 === '36' || first2 === '38') return 'diners';

  return null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required', success: false }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    if (!accessToken) throw new Error('MERCADO_PAGO_ACCESS_TOKEN not configured');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication', success: false }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({
        error: 'Invalid input',
        details: parsed.error.errors.map((issue) => issue.message),
        success: false,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = parsed.data;
    const txAmount = Number(data.amount.toFixed(2));
    const cleanCardNumber = data.cardNumber.replace(/\D/g, '');
    const fallbackOptions = buildFallbackOptions(txAmount);

    if (data.paymentMethod === 'debit' || txAmount < 1 || cleanCardNumber.length < 6) {
      return new Response(JSON.stringify({ success: true, options: fallbackOptions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let paymentMethodId = detectCardBrand(cleanCardNumber, data.paymentMethod);
    if (!paymentMethodId) {
      try {
        const binResp = await fetch(
          `https://api.mercadopago.com/v1/payment_methods/search?bin=${cleanCardNumber.substring(0, 8)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (binResp.ok) {
          const binData = await binResp.json();
          const results = Array.isArray(binData?.results) ? binData.results : [];
          paymentMethodId = results.find((item: any) => item.payment_type_id === 'credit_card')?.id ?? results[0]?.id ?? null;
        }
      } catch (error) {
        console.error('Failed to detect card brand via BIN API:', error);
      }
    }

    if (!paymentMethodId) {
      return new Response(JSON.stringify({ success: true, options: fallbackOptions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const installmentsUrl = new URL('https://api.mercadopago.com/v1/payment_methods/installments');
    installmentsUrl.searchParams.set('amount', txAmount.toFixed(2));
    installmentsUrl.searchParams.set('bin', cleanCardNumber.substring(0, 6));
    installmentsUrl.searchParams.set('payment_method_id', paymentMethodId);

    const installmentsResp = await fetch(installmentsUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!installmentsResp.ok) {
      console.error('Installments API returned status:', installmentsResp.status);
      return new Response(JSON.stringify({ success: true, options: fallbackOptions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const installmentsData = await installmentsResp.json();
    const installmentOption = Array.isArray(installmentsData)
      ? installmentsData.find((option: any) => option.payment_method_id === paymentMethodId) ?? installmentsData[0]
      : null;

    const options = Array.isArray(installmentOption?.payer_costs)
      ? installmentOption.payer_costs
          .map((cost: any) => {
            const installments = Number(cost.installments);
            const installmentAmount = Number(cost.installment_amount ?? txAmount / installments);
            const totalAmount = Number(cost.total_amount ?? installmentAmount * installments);

            if (!Number.isFinite(installments) || installments < 1) return null;

            return {
              installments,
              installmentAmount: Number(installmentAmount.toFixed(2)),
              totalAmount: Number(totalAmount.toFixed(2)),
              label: `${installments}x de ${formatCurrency(installmentAmount)}${installments === 1 ? ' à vista' : ''}`,
            };
          })
          .filter(Boolean)
      : [];

    return new Response(JSON.stringify({
      success: true,
      options: options.length > 0 ? options : fallbackOptions,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in get-payment-installments:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});