import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ABACATEPAY_API = "https://api.abacatepay.com/v2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse input
    const { orderId, items, methods, successUrl, returnUrl } = await req.json();

    if (!orderId || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid input: orderId and items required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify order ownership
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("user_id, total_amount")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ABACATEPAY_API_KEY");
    if (!apiKey) {
      throw new Error("ABACATEPAY_API_KEY not configured");
    }

    // Create products in AbacatePay for each cart item
    const checkoutItems: Array<{ id: string; quantity: number }> = [];
    for (const item of items) {
      const externalId = `${item.id}-${item.variationId || "default"}`;

      const productResp = await fetch(`${ABACATEPAY_API}/products/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          externalId,
          name: item.name.substring(0, 120),
          price: Math.round(item.price * 100), // convert to cents
          currency: "BRL",
          description: item.variationId ? `Variação: ${item.variationId}` : undefined,
        }),
      });

      const productData = await productResp.json();

      if (!productResp.ok || !productData.success) {
        console.error("Failed to create product in AbacatePay", productData);
        return new Response(
          JSON.stringify({
            error: "Erro ao criar produtos no gateway",
            details: productData.error || "Erro desconhecido",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      checkoutItems.push({
        id: productData.data.id,
        quantity: item.quantity,
      });
    }

    // Create checkout in AbacatePay
    const checkoutBody: Record<string, unknown> = {
      items: checkoutItems,
      methods: methods || ["PIX", "CARD"],
      externalId: orderId,
    };

    if (successUrl) checkoutBody.completionUrl = successUrl;
    if (returnUrl) checkoutBody.returnUrl = returnUrl;

    const checkoutResp = await fetch(`${ABACATEPAY_API}/checkouts/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(checkoutBody),
    });

    const checkoutData = await checkoutResp.json();

    if (!checkoutResp.ok || !checkoutData.success) {
      console.error("AbacatePay checkout error", checkoutResp.status, checkoutData);
      return new Response(
        JSON.stringify({
          error: "Erro ao criar checkout",
          details: checkoutData.error || "Erro desconhecido",
        }),
        { status: checkoutResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Save checkout reference on order
    const billing = checkoutData.data;
    await supabase
      .from("orders")
      .update({
        payment_id: billing.id,
        payment_method: methods?.includes("CARD") ? "credit_card" : "abacatepay_checkout",
      })
      .eq("id", orderId);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url: billing.url,
          id: billing.id,
          amount: billing.amount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-abacatepay-checkout error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
