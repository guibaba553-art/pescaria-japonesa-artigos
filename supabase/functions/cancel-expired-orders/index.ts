import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderItem {
  product_id: string;
  variation_id: string | null;
  quantity: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find orders awaiting payment older than 24h
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: expiredOrders, error: fetchError } = await supabase
      .from("orders")
      .select("id, user_id, total_amount, created_at, payment_id")
      .eq("status", "aguardando_pagamento")
      .lt("created_at", cutoff);

    if (fetchError) {
      console.error("Failed to fetch expired orders", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orders = expiredOrders ?? [];
    console.log(`Found ${orders.length} expired orders to cancel`);

    const results: Array<{
      orderId: string;
      cancelled: boolean;
      emailSent: boolean;
      error?: string;
    }> = [];

    for (const order of orders) {
      const orderId = order.id as string;
      try {
        // 1) Update status to cancelled
        const { error: updateErr } = await supabase
          .from("orders")
          .update({ status: "cancelado" })
          .eq("id", orderId)
          .eq("status", "aguardando_pagamento"); // re-check to avoid race

        if (updateErr) {
          throw new Error(`update status: ${updateErr.message}`);
        }

        // 2) Restore stock for each item (sale_revert, only if a sale movement exists)
        const { data: items } = await supabase
          .from("order_items")
          .select("product_id, variation_id, quantity")
          .eq("order_id", orderId);

        for (const item of (items ?? []) as OrderItem[]) {
          // Check if stock was actually deducted (sale movement exists)
          const { data: existingSale } = await supabase
            .from("stock_movements")
            .select("id")
            .eq("order_id", orderId)
            .eq("product_id", item.product_id)
            .in("movement_type", ["sale", "pdv_sale"])
            .limit(1)
            .maybeSingle();

          if (!existingSale) continue;

          // Check if already reverted
          const { data: existingRevert } = await supabase
            .from("stock_movements")
            .select("id")
            .eq("order_id", orderId)
            .eq("product_id", item.product_id)
            .eq("movement_type", "sale_revert")
            .limit(1)
            .maybeSingle();

          if (existingRevert) continue;

          await supabase.rpc("apply_stock_movement", {
            p_product_id: item.product_id,
            p_variation_id: item.variation_id,
            p_quantity_delta: item.quantity,
            p_movement_type: "sale_revert",
            p_order_id: orderId,
            p_reason: "Pedido cancelado automaticamente — pagamento não confirmado em 24h",
          });
        }

        // 3) Send email notification
        let emailSent = false;
        try {
          // Fetch user email from auth
          const { data: userData } = await supabase.auth.admin.getUserById(
            order.user_id as string,
          );
          const recipientEmail = userData?.user?.email;

          if (recipientEmail) {
            // Fetch profile name
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", order.user_id)
              .maybeSingle();

            const customerName = profile?.full_name?.split(" ")[0] || undefined;
            const totalAmount = `R$ ${Number(order.total_amount).toFixed(2).replace(".", ",")}`;
            const orderNumber = orderId.slice(0, 8).toUpperCase();

            const { error: emailErr } = await supabase.functions.invoke(
              "send-transactional-email",
              {
                body: {
                  templateName: "order-cancelled",
                  recipientEmail,
                  idempotencyKey: `order-cancelled-${orderId}`,
                  templateData: {
                    customerName,
                    orderNumber,
                    totalAmount,
                    paymentMethod: "Mercado Pago",
                  },
                },
              },
            );

            if (emailErr) {
              console.error(`Email error for order ${orderId}`, emailErr);
            } else {
              emailSent = true;
            }
          }
        } catch (emailErr) {
          console.error(`Failed to send email for order ${orderId}`, emailErr);
        }

        results.push({ orderId, cancelled: true, emailSent });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to cancel order ${orderId}`, msg);
        results.push({ orderId, cancelled: false, emailSent: false, error: msg });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: orders.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("cancel-expired-orders error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
