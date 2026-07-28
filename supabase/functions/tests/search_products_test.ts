Deno.env.set("DENO_TEST", "1");

import { assertEquals, assertGreater, assert } from "jsr:@std/assert@^1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SUPABASE_URL, ANON_KEY, TEST_USER_ID } from "./helpers.ts";
import { setupEnv } from "./mock_gateways.ts";

setupEnv();

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function searchProducts(query: string, category?: string | null) {
  const { data, error } = await supabaseAdmin.rpc("search_products", {
    search_query: query,
    category_filter: category ?? null,
  });
  if (error) throw error;
  return (data ?? []) as { id: string; score: number }[];
}

Deno.test("search_products — exact name match returns product", async () => {
  const results = await searchProducts("Carretilha Shimano");
  assertGreater(results.length, 0);
  assertEquals(results[0].score > 0.8, true);
});

Deno.test("search_products — typo match returns product (fuzzy)", async () => {
  // "Shimanno" instead of "Shimano"
  const results = await searchProducts("Shimanno");
  // With trigram similarity, this should still find Shimano
  assertGreater(results.length, 0);
});

Deno.test("search_products — 1-2 char query returns results via ilike", async () => {
  const results = await searchProducts("Ca");
  assertGreater(results.length, 0);
});

Deno.test("search_products — empty query returns empty", async () => {
  const results = await searchProducts("");
  assertEquals(results.length, 0);
});

Deno.test("search_products — category filter works", async () => {
  const allResults = await searchProducts("Vara");
  const filteredResults = await searchProducts("Vara", "Varas");
  assert(filteredResults.length <= allResults.length);
  // Products in filtered results should be fewer or equal (not zero necessarily, but shouldn't be more)
});

Deno.test("search_products — pdv_only products excluded", async () => {
  const results = await searchProducts("algumproduto");
  for (const r of results) {
    const { data } = await supabaseAdmin.from("products").select("pdv_only").eq("id", r.id).single();
    assertEquals(data?.pdv_only, false);
  }
});

Deno.test("search_products — zero-stock products excluded", async () => {
  const results = await searchProducts("linha");
  for (const r of results) {
    const { data } = await supabaseAdmin.from("products").select("stock").eq("id", r.id).single();
    assertGreater(data?.stock ?? 0, 0);
  }
});

Deno.test("search_products — accent insensitive", async () => {
  const resultsAccented = await searchProducts("varão");
  const resultsPlain = await searchProducts("varao");
  assertEquals(resultsAccented.length, resultsPlain.length);
});

Deno.test("search_products — results ordered by score descending", async () => {
  const results = await searchProducts("Shimano");
  if (results.length >= 2) {
    assert(results[0].score >= results[1].score);
  }
});

Deno.test("search_products — brand search returns products", async () => {
  const results = await searchProducts("Shimano");
  assertGreater(results.length, 0);
});
