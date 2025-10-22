import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { amount, paymentMethod, items, cardData, installments, userEmail, userCpf, userName, orderId } = await req.json();
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
        transaction_amount: Number(amount.toFixed(2)),
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

      // Salvar dados do PIX no pedido para acesso posterior
      if (orderId) {
        const pixExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
        
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            payment_id: data.id.toString(),
            qr_code: data.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64,
            ticket_url: data.point_of_interaction?.transaction_data?.ticket_url,
            pix_expiration: pixExpiration.toISOString()
          })
          .eq('id', orderId);
          
        if (updateError) {
          console.error('Error saving PIX data to order:', updateError);
        } else {
          console.log('PIX data saved to order successfully');
        }
      }

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
        transaction_amount: Number(amount.toFixed(2)),
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
          'X-Idempotency-Key': `card-${Date.now()}-${Math.random()}`,
        },
        body: JSON.stringify(cardPayment),
      });

      const data = await response.json();
      
      console.log('Card payment created:', data);
      
      if (!response.ok) {
        console.error('Mercado Pago error:', data);
        
        // Mapear erros específicos
        let errorMessage = data.message || 'Erro ao processar pagamento com cartão';
        let errorDetails = '';
        
        if (data.cause && data.cause.length > 0) {
          const cause = data.cause[0];
          errorDetails = cause.description || '';
          
          // Mapear códigos de erro específicos
          if (cause.code === 2006) {
            errorMessage = 'Token do cartão inválido';
            errorDetails = 'Verifique os dados do cartão e tente novamente';
          }
        }
        
        return new Response(
          JSON.stringify({ 
            error: errorMessage,
            details: errorDetails,
            status: data.status,
            statusDetail: data.status_detail,
            success: false 
          }),
          { 
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Verificar se o pagamento foi rejeitado
      if (data.status === 'rejected') {
        let rejectionReason = 'Pagamento rejeitado';
        let rejectionDetails = '';
        
        // Mapear motivos de rejeição
        const statusDetail = data.status_detail;
        if (statusDetail === 'cc_rejected_bad_filled_card_number') {
          rejectionReason = 'Número do cartão incorreto';
          rejectionDetails = 'Verifique o número do cartão e tente novamente';
        } else if (statusDetail === 'cc_rejected_bad_filled_date') {
          rejectionReason = 'Data de validade inválida';
          rejectionDetails = 'Verifique a data de validade do cartão';
        } else if (statusDetail === 'cc_rejected_bad_filled_security_code') {
          rejectionReason = 'CVV incorreto';
          rejectionDetails = 'Verifique o código de segurança do cartão';
        } else if (statusDetail === 'cc_rejected_insufficient_amount') {
          rejectionReason = 'Saldo insuficiente';
          rejectionDetails = 'O cartão não possui saldo suficiente';
        } else if (statusDetail === 'cc_rejected_invalid_installments') {
          rejectionReason = 'Parcelamento não disponível';
          rejectionDetails = 'O cartão não aceita este parcelamento';
        } else if (statusDetail === 'cc_rejected_max_attempts') {
          rejectionReason = 'Limite de tentativas excedido';
          rejectionDetails = 'Aguarde alguns minutos antes de tentar novamente';
        } else if (statusDetail.includes('cc_rejected')) {
          rejectionReason = 'Cartão rejeitado';
          rejectionDetails = statusDetail.replace('cc_rejected_', '').replace(/_/g, ' ');
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            error: rejectionReason,
            details: rejectionDetails,
            paymentId: data.id,
            status: data.status,
            statusDetail: data.status_detail,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
