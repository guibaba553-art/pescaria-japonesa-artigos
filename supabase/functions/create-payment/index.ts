import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema for payment request
const paymentRequestSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(1000000, 'Amount exceeds maximum'),
  paymentMethod: z.enum(['pix', 'credit', 'debit']),
  items: z.array(z.object({
    id: z.string().uuid('Invalid product ID'),
    name: z.string(),
    quantity: z.number().int().positive(),
    price: z.number().positive('Price must be positive'),
    variationId: z.string().uuid().optional(),
  })).min(1, 'At least one item required'),
  cardData: z.object({
    token: z.string(),
    paymentMethodId: z.string(),
  }).nullable().optional(),
  installments: z.union([z.string(), z.number()]).optional(),
  userEmail: z.string().email('Invalid email').optional(),
  userCpf: z.string().optional(),
  userName: z.string().optional(),
  orderId: z.string().uuid('Invalid order ID').optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let rawData;
    
    try {
      const text = await req.text();
      console.log('Request body received:', text);
      
      if (!text || text.trim() === '') {
        console.error('Empty request body');
        return new Response(
          JSON.stringify({ 
            error: 'Empty request body', 
            details: ['Request body cannot be empty']
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
        );
      }
      
      rawData = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON in request body', 
          details: ['Request body must be valid JSON']
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }
    
    // Validate input
    const validationResult = paymentRequestSchema.safeParse(rawData);
    if (!validationResult.success) {
      console.error('Payment validation failed:', validationResult.error.issues[0].message);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid payment data', 
          details: validationResult.error.errors.map(e => e.message)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }
    
    const data = validationResult.data;
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!accessToken) {
      throw new Error('MERCADO_PAGO_ACCESS_TOKEN not configured');
    }

    console.log('Creating payment - Method:', data.paymentMethod, 'Amount:', data.amount);
    
    // SECURITY: Verify prices against database to prevent price manipulation
    let verifiedAmount = 0;
    for (const item of data.items) {
      let dbPrice: number;
      
      if (item.variationId) {
        // Verify variation price - need to check parent product's sale status
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('on_sale, sale_price, price')
          .eq('id', item.id)
          .single();
          
        if (productError || !product) {
          console.error('Invalid product:', item.id);
          return new Response(
            JSON.stringify({ error: 'Invalid product', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
          );
        }
        
        const { data: variation, error } = await supabase
          .from('product_variations')
          .select('price')
          .eq('id', item.variationId)
          .eq('product_id', item.id)
          .single();
        
        if (error || !variation) {
          console.error('Invalid variation:', item.variationId);
          return new Response(
            JSON.stringify({ error: 'Invalid product variation', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
          );
        }
        
        // If parent product has sale, apply discount to variation price
        let variationPrice = Number(variation.price);
        if (product.on_sale && product.sale_price !== null) {
          const discountPercent = 1 - (Number(product.sale_price) / Number(product.price));
          variationPrice = variationPrice * (1 - discountPercent);
        }
        
        dbPrice = variationPrice;
      } else {
        // Verify product price
        const { data: product, error } = await supabase
          .from('products')
          .select('price, sale_price, on_sale')
          .eq('id', item.id)
          .single();
        
        if (error || !product) {
          console.error('Invalid product:', item.id);
          return new Response(
            JSON.stringify({ error: 'Invalid product', success: false }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
          );
        }
        
        dbPrice = product.on_sale && product.sale_price ? Number(product.sale_price) : Number(product.price);
      }
      
      // Verify client-provided price matches database (allow 0.01 difference for rounding)
      if (Math.abs(Number(item.price) - dbPrice) > 0.01) {
        console.error('Price mismatch - Client:', item.price, 'DB:', dbPrice);
        return new Response(
          JSON.stringify({ error: 'Price verification failed. Please refresh and try again.', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
        );
      }
      
      verifiedAmount += dbPrice * item.quantity;
    }
    
    // Verify total amount matches verified prices
    if (Math.abs(data.amount - verifiedAmount) > 0.01) {
      console.error('Total amount mismatch - Client:', data.amount, 'Verified:', verifiedAmount);
      return new Response(
        JSON.stringify({ error: 'Amount verification failed. Please refresh and try again.', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }
    
    console.log('Price verification passed - Verified amount:', verifiedAmount);
    
    const isTestMode = accessToken.startsWith('TEST-');
    const simulatePayment = Deno.env.get('SIMULATE_PAYMENTS') === 'true';

    // Para PIX
    if (data.paymentMethod === 'pix') {
      // Modo simulação
      if (simulatePayment) {
        console.log('Simulation mode: PIX payment');
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
        transaction_amount: Number(data.amount.toFixed(2)),
        description: data.items.map((item: any) => `${item.name} x${item.quantity}`).join(', ').substring(0, 100),
        payment_method_id: 'pix',
        payer: {
          email: data.userEmail || 'cliente@japapesca.com',
          first_name: data.userName?.split(' ')[0] || 'Cliente',
          last_name: data.userName?.split(' ').slice(1).join(' ') || 'JAPA',
          identification: {
            type: 'CPF',
            number: data.userCpf?.replace(/\D/g, '') || '00000000000'
          }
        },
      };

      console.log('Creating PIX payment');

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `pix-${Date.now()}-${Math.random()}`,
        },
        body: JSON.stringify(pixPayment),
      });

      const responseData = await response.json();
      
      console.log('Mercado Pago PIX response status:', response.status);
      
      if (!response.ok) {
        console.error('Mercado Pago API Error - Status:', response.status, 'Code:', responseData.code);
        
        let errorMessage = 'Erro ao criar pagamento PIX';
        if (response.status === 403 && responseData.code === 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES') {
          errorMessage = 'Credenciais do Mercado Pago sem permissão. Verifique se sua conta tem PIX habilitado.';
        }
        
        return new Response(
          JSON.stringify({ 
            error: errorMessage,
            success: false 
          }),
          { 
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      console.log('PIX payment created successfully - ID:', responseData.id);

      // Salvar dados do PIX no pedido
      if (data.orderId) {
        const pixExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            payment_id: responseData.id.toString(),
            qr_code: responseData.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: responseData.point_of_interaction?.transaction_data?.qr_code_base64,
            ticket_url: responseData.point_of_interaction?.transaction_data?.ticket_url,
            pix_expiration: pixExpiration.toISOString()
          })
          .eq('id', data.orderId);
          
        if (updateError) {
          console.error('Error saving PIX data to order');
        } else {
          console.log('PIX data saved to order successfully');
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          paymentId: responseData.id,
          qrCode: responseData.point_of_interaction?.transaction_data?.qr_code,
          qrCodeBase64: responseData.point_of_interaction?.transaction_data?.qr_code_base64,
          ticketUrl: responseData.point_of_interaction?.transaction_data?.ticket_url,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Para cartão de crédito/débito
    if (data.paymentMethod === 'credit' || data.paymentMethod === 'debit') {
      if (!data.cardData?.token) {
        return new Response(
          JSON.stringify({ error: 'Card token required', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
        );
      }

      const cardPayment = {
        transaction_amount: Number(data.amount.toFixed(2)),
        token: data.cardData.token,
        description: data.items.map((item: any) => `${item.name} x${item.quantity}`).join(', ').substring(0, 100),
        installments: parseInt(String(data.installments)) || 1,
        payment_method_id: data.cardData.paymentMethodId,
        payer: {
          email: data.userEmail || 'cliente@japapesca.com',
        },
      };

      console.log('Creating card payment - Type:', data.paymentMethod);

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `card-${Date.now()}-${Math.random()}`,
        },
        body: JSON.stringify(cardPayment),
      });

      const responseData = await response.json();
      
      console.log('Card payment response - Status:', response.status, 'Payment status:', responseData.status);
      
      if (!response.ok) {
        console.error('Mercado Pago error - Status:', response.status);
        
        let errorMessage = responseData.message || 'Erro ao processar pagamento com cartão';
        let errorDetails = '';
        
        if (responseData.cause && responseData.cause.length > 0) {
          const cause = responseData.cause[0];
          errorDetails = cause.description || '';
          
          if (cause.code === 2006) {
            errorMessage = 'Token do cartão inválido';
            errorDetails = 'Verifique os dados do cartão e tente novamente';
          }
        }
        
        return new Response(
          JSON.stringify({ 
            error: errorMessage,
            details: errorDetails,
            success: false 
          }),
          { 
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Atualizar pedido com payment_id
      if (data.orderId && responseData.id) {
        const updateData: any = { payment_id: responseData.id.toString() };
        
        if (responseData.status === 'approved') {
          updateData.status = 'em_preparo';
          console.log('Card payment approved instantly');
        }
        
        const { error: updateError } = await supabase
          .from('orders')
          .update(updateData)
          .eq('id', data.orderId);
          
        if (updateError) {
          console.error('Error updating order');
        } else {
          console.log('Order updated successfully');
        }
      }

      // Verificar se o pagamento foi rejeitado
      if (responseData.status === 'rejected') {
        let rejectionReason = 'Pagamento rejeitado';
        let rejectionDetails = '';
        
        const statusDetail = responseData.status_detail;
        const rejectionMessages: Record<string, [string, string]> = {
          'cc_rejected_bad_filled_card_number': ['Número do cartão incorreto', 'Verifique o número do cartão'],
          'cc_rejected_bad_filled_date': ['Data de validade inválida', 'Verifique a data de validade'],
          'cc_rejected_bad_filled_security_code': ['CVV incorreto', 'Verifique o código de segurança'],
          'cc_rejected_insufficient_amount': ['Saldo insuficiente', 'O cartão não possui saldo suficiente'],
          'cc_rejected_invalid_installments': ['Parcelamento não disponível', 'O cartão não aceita este parcelamento'],
          'cc_rejected_max_attempts': ['Limite de tentativas excedido', 'Aguarde antes de tentar novamente'],
        };

        if (statusDetail && rejectionMessages[statusDetail]) {
          [rejectionReason, rejectionDetails] = rejectionMessages[statusDetail];
        } else if (statusDetail?.includes('cc_rejected')) {
          rejectionDetails = statusDetail.replace('cc_rejected_', '').replace(/_/g, ' ');
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            error: rejectionReason,
            details: rejectionDetails,
            paymentId: responseData.id,
            status: responseData.status,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          paymentId: responseData.id,
          status: responseData.status,
          statusDetail: responseData.status_detail,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid payment method');

  } catch (error) {
    console.error('Error in create-payment:', error instanceof Error ? error.message : 'Unknown error');
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