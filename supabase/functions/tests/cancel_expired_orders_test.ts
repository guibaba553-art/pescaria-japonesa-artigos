// Tests for cancel-expired-orders
//
// Verifies that the function correctly identifies and cancels orders
// that have been awaiting payment for more than 1 hour (new cutoff).
// Uses real local Supabase for DB + auth, mocks internal edge function
// calls (send-transactional-email) and RPCs that may not exist in test DB.

import { assertEquals, assert } from "jsr:@std/assert@^1";
import { handleRequest } from "../cancel-expired-orders/index.ts";
import { interceptFetch, setupEnv, mockInternalFn } from "./mock_gateways.ts";
import { createOrder, deleteOrder, getJwt, SUPABASE_URL, ANON_KEY } from "./helpers.ts";

setupEnv();
interceptFetch();

// Set CRON_SECRET so the function accepts our calls
const CRON_SECRET = "test-cron-secret-123";
Deno.env.set("CRON_SECRET", CRON_SECRET);

async function call(): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CRON_SECRET}`,
      "Content-Type": "application/json",
    },
  }));
}

const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const THIRTY_MIN_AGO = new Date(Date.now() - 30 * 60 * 1000).toISOString();

Deno.test("cancela pedido com created_at > 1h atrás", async () => {
  // Create an order with created_at 2h ago (should be expired by new 1h cutoff)
  const oldOid = await createOrder({ created_at: TWO_HOURS_AGO });
  
  // Mock internal edge function calls (send-transactional-email) and RPCs
  // that may not have proper fixtures in test DB
  mockInternalFn((url) => {
    if (url.includes("/functions/v1/send-transactional-email")) {
      return { status: 200, body: { success: true } };
    }
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null; // pass through to real Supabase for everything else
  });

  const r = await call();
  assertEquals(r.status, 200, "deve retornar 200");

  const body = await r.json();
  assertEquals(body.success, true, "success deve ser true");
  // Pode haver outros pedidos expirados no banco de testes
  assert(body.processed >= 1, "deve ter processado ao menos 1 pedido");

  // Verify the old order was cancelled with reason
  const cancelResult = body.results?.find((res: any) => res.orderId === oldOid);
  assertEquals(cancelResult?.cancelled, true, "pedido antigo deve ser cancelado");

  // Verify cancellation_reason was set to prazo_expirado
  const jwt = await getJwt();
  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oldOid}&select=status,cancellation_reason`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` },
  });
  const [updatedOrder] = await checkResp.json();
  assertEquals(updatedOrder?.status, "cancelado", "status deve ser cancelado");
  assertEquals(updatedOrder?.cancellation_reason, "prazo_expirado", "cancellation_reason deve ser prazo_expirado");

  await deleteOrder(oldOid);
  mockInternalFn(null);
});

Deno.test("não cancela pedido com created_at < 30 min", async () => {
  const recentOid = await createOrder({ created_at: THIRTY_MIN_AGO });

  mockInternalFn((url) => {
    if (url.includes("/functions/v1/send-transactional-email")) {
      return { status: 200, body: { success: true } };
    }
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null;
  });

  const r = await call();
  assertEquals(r.status, 200, "deve retornar 200");

  const body = await r.json();
  // The recent order should NOT appear in processed results
  const recentResult = body.results?.find((res: any) => res.orderId === recentOid);
  assertEquals(recentResult, undefined, "pedido recente não deve ser processado");

  // If there are other expired orders from previous tests, processed may be > 0
  // But our recent order specifically should not be among them

  await deleteOrder(recentOid);
  mockInternalFn(null);
});

Deno.test("rejeita requisição sem CRON_SECRET", async () => {
  const r = await handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }));
  assertEquals(r.status, 401, "sem auth deve retornar 401");
});
