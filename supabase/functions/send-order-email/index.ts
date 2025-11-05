import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderEmailRequest {
  orderId: string;
  type: 'confirmation' | 'status_update' | 'tracking';
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, type }: OrderEmailRequest = await req.json();

    console.log(`📧 Enviando email tipo ${type} para pedido ${orderId}`);

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar dados do pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          quantity,
          price_at_purchase,
          products (name, image_url)
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error(`Pedido não encontrado: ${orderError?.message}`);
    }

    // Buscar dados do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', order.user_id)
      .single();

    const { data: { user } } = await supabase.auth.admin.getUserById(order.user_id);

    if (!user?.email) {
      throw new Error('Email do usuário não encontrado');
    }

    const customerName = profile?.full_name || user.email.split('@')[0];

    // Mapear status para português
    const statusMap: Record<string, string> = {
      'aguardando_pagamento': 'Aguardando Pagamento',
      'em_preparo': 'Em Preparação',
      'enviado': 'Enviado',
      'entregado': 'Entregue',
      'cancelado': 'Cancelado'
    };

    let subject = '';
    let html = '';

    // Gerar conteúdo do email baseado no tipo
    if (type === 'confirmation') {
      subject = `Pedido #${orderId.slice(0, 8)} Confirmado - JAPAS Pesca`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Pedido Confirmado! 🎣</h1>
          <p>Olá <strong>${customerName}</strong>,</p>
          <p>Seu pedido foi recebido com sucesso!</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin-top: 0;">Detalhes do Pedido</h2>
            <p><strong>Número:</strong> #${orderId.slice(0, 8)}</p>
            <p><strong>Status:</strong> ${statusMap[order.status]}</p>
            <p><strong>Total:</strong> R$ ${(order.total_amount + order.shipping_cost).toFixed(2)}</p>
            <p><strong>Endereço:</strong> ${order.shipping_address}</p>
          </div>

          <h3>Itens do Pedido:</h3>
          <ul>
            ${order.order_items.map((item: any) => `
              <li>${item.products.name} - ${item.quantity}x R$ ${item.price_at_purchase.toFixed(2)}</li>
            `).join('')}
          </ul>

          <p style="margin-top: 30px;">Você receberá atualizações sobre o status do seu pedido.</p>
          <p>Obrigado por comprar conosco!</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">JAPAS Pesca - Sua loja de artigos de pesca</p>
        </div>
      `;
    } else if (type === 'status_update') {
      subject = `Pedido #${orderId.slice(0, 8)} - ${statusMap[order.status]}`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Atualização do Pedido</h1>
          <p>Olá <strong>${customerName}</strong>,</p>
          <p>O status do seu pedido foi atualizado!</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Pedido:</strong> #${orderId.slice(0, 8)}</p>
            <p><strong>Novo Status:</strong> <span style="color: #2563eb; font-size: 18px;">${statusMap[order.status]}</span></p>
            ${order.tracking_code ? `<p><strong>Código de Rastreio:</strong> ${order.tracking_code}</p>` : ''}
          </div>

          ${order.status === 'enviado' ? `
            <p>Seu pedido está a caminho! ${order.tracking_code ? 'Use o código de rastreio para acompanhar a entrega.' : ''}</p>
          ` : ''}

          ${order.status === 'entregado' ? `
            <p>Seu pedido foi entregue! Esperamos que aproveite seus produtos. 🎉</p>
            <p>Não esqueça de avaliar seus produtos na nossa loja!</p>
          ` : ''}
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">JAPAS Pesca - Sua loja de artigos de pesca</p>
        </div>
      `;
    } else if (type === 'tracking') {
      subject = `Código de Rastreio - Pedido #${orderId.slice(0, 8)}`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Código de Rastreio Disponível! 📦</h1>
          <p>Olá <strong>${customerName}</strong>,</p>
          <p>Seu pedido já está em trânsito!</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Pedido:</strong> #${orderId.slice(0, 8)}</p>
            <p><strong>Código de Rastreio:</strong></p>
            <p style="font-size: 24px; font-weight: bold; color: #2563eb;">${order.tracking_code}</p>
          </div>

          <p>Você pode acompanhar sua entrega no site dos Correios:</p>
          <a href="https://rastreamento.correios.com.br/app/index.php" 
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Rastrear Pedido
          </a>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">JAPAS Pesca - Sua loja de artigos de pesca</p>
        </div>
      `;
    }

    // Enviar email
    const emailResponse = await resend.emails.send({
      from: "JAPAS Pesca <onboarding@resend.dev>",
      to: [user.email],
      subject: subject,
      html: html,
    });

    console.log("✅ Email enviado com sucesso:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("❌ Erro ao enviar email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
