// Tests for cleanup-old-messages (order cancellation part)
//
// Verifies that the function cancels (updates status to 'cancelado') old unpaid orders
// instead of deleting them. Uses real local Supabase for DB.

import { assertEquals, assert } from "jsr:@std/assert@^1";
import { handleRequest } from "../cleanup-old-messages/index.ts";
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

const THREE_DAYS_PLUS = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
const ONE_DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

Deno.test("cancela pedido antigo (> 3 dias) aguardando pagamento — seta status como cancelado (não deleta)", async () => {
  // Create an order from 4 days ago awaiting payment
  const oldOid = await createOrder({ created_at: THREE_DAYS_PLUS, status: "aguardando_pagamento" });

  // Mock internal RPCs that may not exist in test DB
  mockInternalFn((url) => {
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
  assertEquals(body.success, true, "success deve ser true");
  assert(body.cancelledOrdersCount >= 1, "deve ter cancelado ao menos 1 pedido");

  // Verify the old order still exists and its status is 'cancelado' (not deleted)
  const jwt = await getJwt();
  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oldOid}&select=id,status,cancellation_reason`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` },
  });
  const [updatedOrder] = await checkResp.json();
  assertEquals(updatedOrder?.status, "cancelado", "status deve ser cancelado, não deletado");
  assertEquals(updatedOrder?.cancellation_reason, "prazo_expirado", "deve ter cancellation_reason prazo_expirado");

  // Cleanup
  await deleteOrder(oldOid);
  mockInternalFn(null);
});

Deno.test("não afeta pedido recente (< 3 dias)", async () => {
  const recentOid = await createOrder({ created_at: ONE_DAY_AGO, status: "aguardando_pagamento" });

  mockInternalFn((url) => {
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

  // Verify the recent order is still 'aguardando_pagamento'
  const jwt = await getJwt();
  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${recentOid}&select=id,status`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` },
  });
  const [order] = await checkResp.json();
  assertEquals(order?.status, "aguardando_pagamento", "pedido recente não deve ser afetado");

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
