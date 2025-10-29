import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  orderId: z.string().uuid('Invalid order ID format')
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Validate input
    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input', 
          details: validationResult.error.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { orderId } = validationResult.data;
    console.log('Subtracting stock for order:', orderId);
    
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client for user authentication check
    const userToken = authHeader.replace('Bearer ', '');
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(userToken);
    
    if (authError || !user) {
      console.error('Invalid token:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin or employee (this function should only be called by authorized personnel)
    const { data: roles } = await supabaseUser
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAuthorized = roles?.some(r => r.role === 'admin' || r.role === 'employee');
    
    if (!isAuthorized) {
      console.error('User not authorized - requires admin or employee role');
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only administrators and employees can subtract stock' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
