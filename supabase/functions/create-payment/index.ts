import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { amount, paymentMethod, items, cardData, installments, userEmail, userCpf, userName } = await req.json();
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');

    if (!accessToken) {
      throw new Error('MERCADO_PAGO_ACCESS_TOKEN not configured');
    }

    console.log('Creating payment:', { amount, paymentMethod, items });
    console.log('Access token starts with TEST:', accessToken.startsWith('TEST-'));
    
    // Modo simulação para testes (quando credenciais reais não funcionam)
    const isTestMode = accessToken.startsWith('TEST-');
    const simulatePayment = Deno.env.get('SIMULATE_PAYMENTS') === 'true';

    // Para PIX
    if (paymentMethod === 'pix') {
      // Modo simulação
      if (simulatePayment) {
        console.log('SIMULATION MODE: Generating mock PIX payment');
        const mockQRCode = '00020126580014br.gov.bcb.pix0136' + crypto.randomUUID() + '5204000053039865802BR5925JAPA PESCA6009SAO PAULO62070503***6304';
        
        return new Response(
          JSON.stringify({
            success: true,
            paymentId: `SIM-${Date.now()}`,
            qrCode: mockQRCode,
            qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            simulated: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pixPayment = {
        transaction_amount: amount,
        description: items.map((item: any) => `${item.name} x${item.quantity}`).join(', '),
        payment_method_id: 'pix',
        payer: {
          email: userEmail || 'cliente@japapesca.com',
          first_name: userName?.split(' ')[0] || 'Cliente',
          last_name: userName?.split(' ').slice(1).join(' ') || 'JAPA',
          identification: {
            type: 'CPF',
            number: userCpf?.replace(/\D/g, '') || '00000000000'
          }
        },
      };

      console.log('PIX payment payload:', JSON.stringify(pixPayment, null, 2));

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `pix-${Date.now()}-${Math.random()}`,
        },
        body: JSON.stringify(pixPayment),
      });

      const data = await response.json();
      
      console.log('Mercado Pago response status:', response.status);
      console.log('Mercado Pago response:', JSON.stringify(data, null, 2));
      
      if (!response.ok) {
        console.error('Mercado Pago API Error:', {
          status: response.status,
          data: data
        });
        
        // Mensagem de erro específica
        let errorMessage = 'Erro ao criar pagamento PIX';
        if (response.status === 403 && data.code === 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES') {
          errorMessage = 'Credenciais do Mercado Pago sem permissão. Verifique se sua conta tem PIX habilitado ou use o modo simulação.';
        }
        
        return new Response(
          JSON.stringify({ 
            error: errorMessage,
            details: {
              status: response.status,
              code: data.code,
              message: data.message
            },
            success: false 
          }),
          { 
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      console.log('PIX payment created successfully');

      return new Response(
        JSON.stringify({
          success: true,
          paymentId: data.id,
          qrCode: data.point_of_interaction?.transaction_data?.qr_code,
          qrCodeBase64: data.point_of_interaction?.transaction_data?.qr_code_base64,
          ticketUrl: data.point_of_interaction?.transaction_data?.ticket_url,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Para cartão de crédito/débito
    if (paymentMethod === 'credit' || paymentMethod === 'debit') {
      const cardPayment = {
        transaction_amount: amount,
        token: cardData.token,
        description: items.map((item: any) => `${item.name} x${item.quantity}`).join(', '),
        installments: parseInt(installments) || 1,
        payment_method_id: cardData.paymentMethodId,
        payer: {
          email: userEmail || 'cliente@japapesca.com',
        },
      };

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cardPayment),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('Mercado Pago error:', data);
        throw new Error(data.message || 'Payment creation failed');
      }

      console.log('Card payment created:', data);

      return new Response(
        JSON.stringify({
          success: true,
          paymentId: data.id,
          status: data.status,
          statusDetail: data.status_detail,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid payment method');

  } catch (error) {
    console.error('Error in create-payment function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
