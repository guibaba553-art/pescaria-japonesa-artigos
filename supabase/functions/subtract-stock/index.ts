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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { orderId } = await req.json();
    
    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'Order ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Subtracting stock for order:', orderId);

    // Buscar itens do pedido com informações sobre variações
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('Error fetching order items:', itemsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch order items' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!orderItems || orderItems.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No items found for this order' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Subtrair estoque de cada produto/variação
    const updates = [];
    for (const item of orderItems) {
      // Primeiro verificar se é uma variação (product_variations) ou produto direto (products)
      const { data: variation } = await supabase
        .from('product_variations')
        .select('stock, product_id')
        .eq('id', item.product_id)
        .maybeSingle();

      if (variation) {
        // É uma variação - subtrair estoque da tabela product_variations
        const newStock = Math.max(0, variation.stock - item.quantity);
        
        const { error: updateError } = await supabase
          .from('product_variations')
          .update({ stock: newStock })
          .eq('id', item.product_id);

        if (updateError) {
          console.error('Error updating stock for variation:', item.product_id, updateError);
        } else {
          updates.push({
            type: 'variation',
            variation_id: item.product_id,
            product_id: variation.product_id,
            old_stock: variation.stock,
            new_stock: newStock,
            quantity_removed: item.quantity
          });
          console.log(`Stock updated for variation ${item.product_id}: ${variation.stock} -> ${newStock}`);
        }
      } else {
        // É um produto direto - subtrair estoque da tabela products
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('stock')
          .eq('id', item.product_id)
          .single();

        if (productError || !product) {
          console.error('Error fetching product:', item.product_id, productError);
          continue;
        }

        const newStock = Math.max(0, product.stock - item.quantity);
        
        const { error: updateError } = await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.product_id);

        if (updateError) {
          console.error('Error updating stock for product:', item.product_id, updateError);
        } else {
          updates.push({
            type: 'product',
            product_id: item.product_id,
            old_stock: product.stock,
            new_stock: newStock,
            quantity_removed: item.quantity
          });
          console.log(`Stock updated for product ${item.product_id}: ${product.stock} -> ${newStock}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        updates,
        message: `Stock updated for ${updates.length} items`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in subtract-stock:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
