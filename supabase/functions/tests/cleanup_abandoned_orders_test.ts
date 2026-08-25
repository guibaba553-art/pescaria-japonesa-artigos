// Tests for cleanup-abandoned-orders
//
// Cancela pedidos abandonados (>5min sem pagamento) e zumbis Asaas (>2h),
// liberando reserva de estoque e limites de promoção. Usa Supabase local real.

import { assertEquals } from "jsr:@std/assert@^1";
import { handleRequest } from "../cleanup-abandoned-orders/index.ts";
import { interceptFetch, setupEnv, mockInternalFn } from "./mock_gateways.ts";
import { createOrder, deleteOrder, getJwt, SUPABASE_URL, ANON_KEY, SERVICE_KEY } from "./helpers.ts";

setupEnv();
interceptFetch();

async function call(token?: string): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token ?? "no-token"}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  }));
}

async function backdateOrder(id: string, minutesAgo: number) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString() }),
  });
  if (!resp.ok) throw new Error(`backdateOrder failed: ${resp.status}`);
}

function mockRpcsOk() {
  mockInternalFn((url) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null;
  });
}

async function getOrderStatus(id: string, token: string): Promise<string> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}&select=status,cancellation_reason`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${token}` },
  });
  const [row] = await resp.json();
  return row?.status ?? "";
}

Deno.test("sem autenticação → 401", async () => {
  const r = await call();
  assertEquals(r.status, 401);
});

Deno.test("cancela abandonado (>5min, sem payment_id/asaas_payment_id) e libera reservas", async () => {
  const oid = await createOrder({ delivery_type: "pickup" });
  await backdateOrder(oid, 10);
  const jwt = await getJwt();

  mockRpcsOk();
  const r = await call(jwt);
  const body = await r.json();

  assertEquals(r.status, 200);
  assertEquals(body.success, true);
  assertEquals(body.cancelled, [oid]);
  assertEquals(body.failed, []);
  assertEquals(await getOrderStatus(oid, jwt), "cancelado");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("cancela zumbi asaas (>2h com asaas_payment_id)", async () => {
  const oid = await createOrder({ asaas_payment_id: "pay_zombie_001" });
  await backdateOrder(oid, 130);
  const jwt = await getJwt();

  mockRpcsOk();
  const r = await call(jwt);
  const body = await r.json();

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, [oid]);
  assertEquals(await getOrderStatus(oid, jwt), "cancelado");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("NÃO cancela pedido recente (<5min) sem pagamento", async () => {
  const oid = await createOrder();
  const jwt = await getJwt();

  mockRpcsOk();
  const r = await call(jwt);
  const body = await r.json();

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, []);
  assertEquals(await getOrderStatus(oid, jwt), "aguardando_pagamento");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("NÃO cancela pedido com payment_id recente (<2h)", async () => {
  const oid = await createOrder({ payment_id: "pay_recent_001" });
  await backdateOrder(oid, 10);
  const jwt = await getJwt();

  mockRpcsOk();
  const r = await call(jwt);
  const body = await r.json();

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, []);
  assertEquals(await getOrderStatus(oid, jwt), "aguardando_pagamento");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("rpc de liberação de estoque falha → failed e NÃO cancela", async () => {
  const oid = await createOrder();
  await backdateOrder(oid, 10);
  const jwt = await getJwt();

  mockInternalFn((url, method) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 500, body: { message: "rpc down" } };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/orders") && !url.includes("order_items") && method === "PATCH") {
      throw new Error("PATCH não deveria ser chamado quando a liberação de estoque falha");
    }
    return null;
  });

  const r = await call(jwt);
  const body = await r.json();

  mockInternalFn(null);

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, []);
  assertEquals(body.failed.length, 1);
  assertEquals(body.failed[0].orderId, oid);
  assertEquals(body.failed[0].error, "rpc down");
  assertEquals(await getOrderStatus(oid, jwt), "aguardando_pagamento");

  await deleteOrder(oid);
});

Deno.test("rpc de liberação de promo falha → failed e NÃO cancela", async () => {
  const oid = await createOrder();
  await backdateOrder(oid, 10);
  const jwt = await getJwt();

  mockInternalFn((url, method) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status:500, body: { message: "promo rpc down" } };
    }
    if (url.includes("/rest/v1/order_items") && method === "GET") {
      return { status: 200, body: [{ product_id: "prod-cleanup-001", variation_id: null, quantity: 1 }] };
    }
    if (url.includes("/rest/v1/orders") && !url.includes("order_items") && method === "PATCH") {
      throw new Error("PATCH não deveria ser chamado quando a liberação de promo falha");
    }
    return null;
  });

  const r = await call(jwt);
  const body = await r.json();

  mockInternalFn(null);

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, []);
  assertEquals(body.failed.length, 1);
  assertEquals(body.failed[0].orderId, oid);
  assertEquals(body.failed[0].error, "promo rpc down");
  assertEquals(await getOrderStatus(oid, jwt), "aguardando_pagamento");

  await deleteOrder(oid);
});

Deno.test("update falha → failed", async () => {
  const oid = await createOrder();
  await backdateOrder(oid, 10);
  const jwt = await getJwt();

  mockInternalFn((url, method) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/orders") && !url.includes("order_items") && method === "PATCH") {
      return { status: 400, body: { message: "update blocked" } };
    }
    return null;
  });

  const r = await call(jwt);
  const body = await r.json();

  mockInternalFn(null);

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, []);
  assertEquals(body.failed.length, 1);
  assertEquals(body.failed[0].orderId, oid);
  assertEquals(body.failed[0].error, "update blocked");
  assertEquals(await getOrderStatus(oid, jwt), "aguardando_pagamento");

  await deleteOrder(oid);
});

Deno.test("NÃO cancela pedido com status entregado (pdv) backdated", async () => {
  const oid = await createOrder({ status: "entregado", source: "pdv" });
  await backdateOrder(oid, 10);
  const jwt = await getJwt();

  mockRpcsOk();
  const r = await call(jwt);
  const body = await r.json();

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, []);
  assertEquals(body.failed, []);
  assertEquals(await getOrderStatus(oid, jwt), "entregado");

  await deleteOrder(oid);
  mockInternalFn(null);
});
