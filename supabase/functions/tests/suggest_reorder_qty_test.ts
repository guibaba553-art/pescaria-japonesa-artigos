// Tests for suggest_reorder_qty: 60-day sales velocity quantity suggestion
//
// Dependencies:
// - A running local Supabase instance (supabase start)
// - The auto-reorder migration applied
//
// Run with: deno test --allow-net supabase/functions/tests/suggest_reorder_qty_test.ts

import { assertEquals } from "jsr:@std/assert@^1";
import { setupEnv } from "./mock_gateways.ts";

setupEnv();

type SupabaseClient = ReturnType<ReturnType<typeof createClientFn>>;
const createClientFn = () => null as any; // placeholder — real import below

// ─── Helpers ──────────────────────────────────────────────

async function getClient(): Promise<SupabaseClient> {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.3");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as SupabaseClient;
}

async function callSuggestQty(
  supabase: SupabaseClient,
  productId: string,
  currentStock: number,
  minStock: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("suggest_reorder_qty", {
    p_product_id: productId,
    p_current_stock: currentStock,
    p_min_stock: minStock,
  });
  if (error) throw error;
  return data as number;
}

async function ensureProduct(supabase: SupabaseClient, product: {
  id: string; name: string; stock: number; min_stock: number;
}): Promise<void> {
  const { error } = await supabase.from("products").upsert(
    {
      id: product.id, name: product.name, description: "Test",
      price: 10, category: "Test", stock: product.stock,
      min_stock: product.min_stock,
    },
    { onConflict: "id", ignoreDuplicates: false },
  );
  if (error) throw error;
}

async function createTestOrder(
  supabase: SupabaseClient,
  productId: string,
  quantity: number,
  daysAgo: number,
  status: string,
): Promise<void> {
  const orderDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  const { data: orderData, error: orderErr } = await supabase
    .from("orders")
    .insert({
      user_id: "00000000-0000-0000-0000-000000000001",
      total_amount: 49.90,
      shipping_cost: 0,
      shipping_address: "Rua Teste, 123",
      shipping_cep: "12345678",
      status: status,
      delivery_type: "pickup",
      payment_attempts: 0,
      pix_attempts: 0,
      created_at: orderDate,
    })
    .select("id")
    .single();
  if (orderErr) throw orderErr;

  const { error: itemErr } = await supabase
    .from("order_items")
    .insert({
      order_id: orderData.id,
      product_id: productId,
      quantity: quantity,
      unit_price: 10,
    });
  if (itemErr) throw itemErr;
}

async function cleanupTestData(supabase: SupabaseClient, productId: string): Promise<void> {
  const { data: items } = await supabase
    .from("order_items")
    .select("order_id")
    .eq("product_id", productId);

  const orderIds = [...new Set((items ?? []).map((i: any) => i.order_id))];

  if (orderIds.length > 0) {
    await supabase.from("order_items").delete().in("order_id", orderIds);
    await supabase.from("orders").delete().in("id", orderIds);
  }
}

// ─── Fixtures ─────────────────────────────────────────────

const PRODUCT_ID = "00000000-0000-0000-0000-000000000010";

// ─── Tests ────────────────────────────────────────────────

Deno.test("suggest_reorder_qty: calcula quantidade com vendas 60d", async () => {
  const supabase = await getClient();

  await ensureProduct(supabase, { id: PRODUCT_ID, name: "Qty Test", stock: 5, min_stock: 10 });

  // 120 units sold in last 60 days
  await createTestOrder(supabase, PRODUCT_ID, 60, 5, "entregado");
  await createTestOrder(supabase, PRODUCT_ID, 40, 15, "enviado");
  await createTestOrder(supabase, PRODUCT_ID, 20, 30, "em_preparo");

  // sold_60d = 120, per_day = 2, target_30d = 60
  // need = MAX(60 - 5, 10 - 5, 1) = 55
  const result = await callSuggestQty(supabase, PRODUCT_ID, 5, 10);
  assertEquals(result, 55, "Deve sugerir 55 para 120 vendas/60d com stock=5, min=10");

  await cleanupTestData(supabase, PRODUCT_ID);
});

Deno.test("suggest_reorder_qty: fallback quando sem vendas 60d", async () => {
  const supabase = await getClient();

  await ensureProduct(supabase, { id: PRODUCT_ID, name: "No Sales", stock: 3, min_stock: 10 });

  // Expected: MAX(min_stock - current_stock, 1) = MAX(10-3, 1) = 7
  const result = await callSuggestQty(supabase, PRODUCT_ID, 3, 10);
  assertEquals(result, 7, "Deve retornar min_stock - current_stock quando não há vendas");
});

Deno.test("suggest_reorder_qty: mínimo de 1", async () => {
  const supabase = await getClient();

  await ensureProduct(supabase, { id: PRODUCT_ID, name: "Min Floor", stock: 20, min_stock: 10 });

  // Expected: MAX(10-20, 1) = 1
  const result = await callSuggestQty(supabase, PRODUCT_ID, 20, 10);
  assertEquals(result, 1, "Deve retornar no mínimo 1");

  // stock = min_stock, sem vendas → MAX(0, 1) = 1
  const result2 = await callSuggestQty(supabase, PRODUCT_ID, 10, 10);
  assertEquals(result2, 1, "Deve retornar 1 mesmo quando stock = min_stock e sem vendas");
});
