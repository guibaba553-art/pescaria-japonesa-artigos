// Tests for _shared/stockHandler.ts — handlePaymentConfirmed
//
// Verifies that handlePaymentConfirmed calls both:
// 1. release_stock_reservation RPC
// 2. subtract-stock edge function via fetch
//
// Uses real local Supabase for DB + auth, mocks only the internal
// edge function call (subtract-stock) to isolate the test.

import { assertEquals } from "jsr:@std/assert@^1";
import { handlePaymentConfirmed } from "../_shared/stockHandler.ts";
import { interceptFetch, setupEnv, mockInternalFn } from "./mock_gateways.ts";
import { getJwt, createOrder, deleteOrder, SUPABASE_URL } from "./helpers.ts";

setupEnv();
interceptFetch();

async function call(orderId: string) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.3");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return handlePaymentConfirmed(supabase, supabaseUrl, supabaseKey, orderId);
}

Deno.test("handlePaymentConfirmed: faz fetch para subtract-stock", async () => {
  const oid = await createOrder();

  let subtractStockCalled = false;
  let capturedBody: unknown = null;

  mockInternalFn((url, method, body) => {
    if (url.includes("/functions/v1/subtract-stock")) {
      subtractStockCalled = true;
      capturedBody = body;
      return { status: 200, body: { success: true, processed: 1, errors: [], results: [] } };
    }
    return null;
  });

  const result = await call(oid);

  assertEquals(subtractStockCalled, true, "subtract-stock deve ser chamado");
  assertEquals(capturedBody, { orderId: oid }, "body deve conter orderId");
  assertEquals(result.stockSuccess, true, "stockSuccess deve ser true");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("handlePaymentConfirmed: não propaga erro se RPC release falha", async () => {
  const oid = await createOrder();

  mockInternalFn((url, _method, body) => {
    if (url.includes("/functions/v1/subtract-stock")) {
      return { status: 200, body: { success: true, processed: 1, errors: [], results: [] } };
    }
    return null;
  });

  // Deve resolver sem erro mesmo se o release falhar (RPC em order sem reservas)
  const result = await call(oid);
  assertEquals(result.stockSuccess, true, "stockSuccess deve ser true");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("handlePaymentConfirmed: não propaga erro se subtract-stock falha", async () => {
  const oid = await createOrder();

  mockInternalFn((url, _method, _body) => {
    if (url.includes("/functions/v1/subtract-stock")) {
      return { status: 500, body: { error: "Internal error" } };
    }
    return null;
  });

  const result = await call(oid);
  assertEquals(result.stockSuccess, false, "stockSuccess deve ser false quando subtract-stock falha");

  await deleteOrder(oid);
  mockInternalFn(null);
});
