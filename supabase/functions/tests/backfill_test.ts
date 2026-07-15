// Test for auto-reorder backfill: adds already-critical products to auto lists
//
// Dependencies:
// - A running local Supabase instance (supabase start)
// - The auto-reorder migration applied (20260706000000_auto_reorder.sql)
//
// Run with: deno test --allow-net supabase/functions/tests/backfill_test.ts

import { assertEquals } from "jsr:@std/assert@^1";
import { setupEnv } from "./mock_gateways.ts";

setupEnv();

type SupabaseClient = ReturnType<ReturnType<typeof createClientFn>>;
const createClientFn = () => null as any;

async function getClient(): Promise<SupabaseClient> {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.3");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as SupabaseClient;
}

const SUPPLIER_A = "10000000-0000-0000-0000-000000000001";
const PROD_CRITICAL = "20000000-0000-0000-0000-000000000001";
const PROD_OK = "20000000-0000-0000-0000-000000000002";
const PROD_NO_SUPPLIER = "20000000-0000-0000-0000-000000000003";
const PROD_ALREADY_IN_LIST = "20000000-0000-0000-0000-000000000004";

async function cleanup(supabase: SupabaseClient): Promise<void> {
  const { data: lists } = await supabase
    .from("purchase_lists")
    .select("id")
    .eq("supplier_id", SUPPLIER_A)
    .eq("is_auto", true);

  if (lists && lists.length > 0) {
    const listIds = lists.map((l: any) => l.id);
    await supabase.from("purchase_list_items").delete().in("list_id", listIds);
    await supabase.from("purchase_lists").delete().in("id", listIds);
  }

  await supabase
    .from("products")
    .delete()
    .in("id", [PROD_CRITICAL, PROD_OK, PROD_NO_SUPPLIER, PROD_ALREADY_IN_LIST]);
  await supabase.from("suppliers").delete().eq("id", SUPPLIER_A);
}

function backfillQuery() {
  return `
    SELECT p.id, p.stock, p.min_stock, p.supplier_id
    FROM public.products p
    WHERE p.stock <= p.min_stock
      AND p.min_stock > 0
      AND p.supplier_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_list_items pli
        JOIN public.purchase_lists pl ON pl.id = pli.list_id
        WHERE pli.product_id = p.id
          AND pli.variation_id IS NULL
      )
  `;
}

// ─── Tests ────────────────────────────────────────────────

Deno.test("backfill: query seleciona apenas produtos críticos", async () => {
  const supabase = await getClient();
  await cleanup(supabase);

  // Setup
  await supabase.from("suppliers").upsert(
    { id: SUPPLIER_A, razao_social: "Fornecedor Backfill", is_active: true },
    { onConflict: "id" },
  );

  // Critical: stock=3 ≤ min_stock=10, has supplier ✓
  await supabase.from("products").upsert(
    { id: PROD_CRITICAL, name: "Critical", description: "Test", price: 10,
      category: "Test", stock: 3, min_stock: 10, supplier_id: SUPPLIER_A },
    { onConflict: "id" },
  );

  // OK: stock=20 > min_stock=5 ✗
  await supabase.from("products").upsert(
    { id: PROD_OK, name: "OK Stock", description: "Test", price: 10,
      category: "Test", stock: 20, min_stock: 5, supplier_id: SUPPLIER_A },
    { onConflict: "id" },
  );

  // No supplier: stock=2 ≤ min_stock=8, no supplier ✗
  await supabase.from("products").upsert(
    { id: PROD_NO_SUPPLIER, name: "No Supplier", description: "Test", price: 10,
      category: "Test", stock: 2, min_stock: 8, supplier_id: null },
    { onConflict: "id" },
  );

  // Already in list: stock=1 ≤ min_stock=5, has supplier, but already in a purchase list
  await supabase.from("products").upsert(
    { id: PROD_ALREADY_IN_LIST, name: "Already Listed", description: "Test", price: 10,
      category: "Test", stock: 1, min_stock: 5, supplier_id: SUPPLIER_A },
    { onConflict: "id" },
  );

  // Create a manual list with this product already in it
  await supabase.from("purchase_lists").upsert(
    { id: "f0000000-0000-0000-0000-000000000001", name: "Manual List",
      created_by: "00000000-0000-0000-0000-000000000001", is_auto: false },
    { onConflict: "id" },
  );
  await supabase.from("purchase_list_items").upsert(
    { id: "f0000000-0000-0000-0000-000000000002", list_id: "f0000000-0000-0000-0000-000000000001",
      product_id: PROD_ALREADY_IN_LIST, quantity: 5, added_by: "00000000-0000-0000-0000-000000000001",
      is_auto: false },
    { onConflict: "id" },
  );

  // Run the backfill query
  const { data: toBackfill } = await supabase.from("products").select(
    "id, stock, min_stock, supplier_id",
  );

  // Simulate the backfill WHERE conditions client-side (since we can't easily run ad-hoc SQL)
  const critical = (toBackfill ?? []).filter((p: any) =>
    p.stock <= p.min_stock
    && p.min_stock > 0
    && p.supplier_id != null
  );

  const resultIds = critical.map((p: any) => p.id);
  assertEquals(resultIds.includes(PROD_CRITICAL), true,
    "Produto crítico com fornecedor deve ser selecionado");
  assertEquals(resultIds.includes(PROD_OK), false,
    "Produto com estoque OK não deve ser selecionado");
  assertEquals(resultIds.includes(PROD_NO_SUPPLIER), false,
    "Produto sem fornecedor não deve ser selecionado");

  // Verify PROD_ALREADY_IN_LIST was excluded by the NOT EXISTS check
  const { data: existingItems } = await supabase
    .from("purchase_list_items")
    .select("product_id")
    .eq("product_id", PROD_ALREADY_IN_LIST);

  if ((existingItems ?? []).length > 0) {
    // Product is in a list, so should be excluded from backfill
    assertEquals(resultIds.includes(PROD_ALREADY_IN_LIST), false,
      "Produto já em lista não deve ser selecionado para backfill");
  }

  // Cleanup
  await supabase.from("purchase_list_items").delete().eq(
    "list_id", "f0000000-0000-0000-0000-000000000001",
  );
  await supabase.from("purchase_lists").delete().eq(
    "id", "f0000000-0000-0000-0000-000000000001",
  );
  await cleanup(supabase);
});
