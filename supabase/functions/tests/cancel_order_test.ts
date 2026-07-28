// Tests for cancel-order
//
// Verifies that admins can cancel orders, employees with can_access_orders=true
// can cancel, and employees without orders permission are denied.
// Uses real local Supabase for DB + auth, mocks external gateways and RPCs.

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { handleRequest } from "../cancel-order/index.ts";
import { interceptFetch, setupEnv, mockInternalFn } from "./mock_gateways.ts";
import { createOrder, createOrderService, deleteOrder, getJwt, getEmployeeJwt, ensureEmployeeUser, SUPABASE_URL, ANON_KEY, SERVICE_KEY } from "./helpers.ts";

setupEnv();
interceptFetch();

async function call(body: Record<string, unknown>, token?: string): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token ?? await getJwt()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }));
}

function mockRPCs() {
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

async function createOrderForTest(status = "aguardando_pagamento") {
  const oid = await createOrder({ status: "aguardando_pagamento" });
  if (oid && status !== "aguardando_pagamento") {
    const jwt = await getJwt();
    const updateResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}`, {
      method: "PATCH",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await updateResp.text();
  }
  return oid;
}

Deno.test("cancel-order: admin pode cancelar pedido", async () => {
  await getJwt();
  // Clean up stale orders from previous runs
  await deleteAllOrdersForUser("00000000-0000-0000-0000-000000000001");
  const oid = await createOrderForTest("em_preparo");
  if (!oid) throw new Error("createOrder retornou undefined");
  const jwt = await getJwt();
  mockRPCs();

  const r = await call({ orderId: oid, cancellation_reason: "cancelado_admin" }, jwt);
  const data = await r.json();
  assertEquals(r.status, 200, `Esperado 200, recebido ${r.status}: ${JSON.stringify(data)}`);
  assertEquals(data.success, true, "success deve ser true");

  const checkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}&select=status,cancellation_reason`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` } },
  );
  const [updated] = await checkResp.json();
  assertEquals(updated?.status, "cancelado");
  assertEquals(updated?.cancellation_reason, "cancelado_admin");

  await deleteOrder(oid);
  mockInternalFn(null);
});

async function deleteAllOrdersForUser(userId: string) {
  const svcHeaders = { apikey: ANON_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/orders?user_id=eq.${userId}`, {
    method: "DELETE",
    headers: svcHeaders,
  });
  await resp.text();
}

async function createOrderServiceForTest(status: string, userId: string) {
  // Clean up any stale orders for this user first
  await deleteAllOrdersForUser(userId);
  const oid = await createOrderService({ user_id: userId });
  if (oid && status !== "aguardando_pagamento") {
    const jwt = await getJwt();
    const updateResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}`, {
      method: "PATCH",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await updateResp.text();
  }
  return oid;
}

Deno.test("cancel-order: funcionário com can_access_orders=true pode cancelar", async () => {
  await getJwt();
  mockRPCs();

  const { id: empId } = await ensureEmployeeUser("emp-orders@teste.com", "teste123", { can_access_orders: true });

  const oid = await createOrderServiceForTest("em_preparo", empId);
  if (!oid) throw new Error("createOrderService retornou undefined");

  const employeeJwt = await getEmployeeJwt("emp-orders@teste.com", "teste123");

  const r = await call({ orderId: oid, cancellation_reason: "cancelado_admin" }, employeeJwt);
  const data = await r.json();
  assertEquals(r.status, 200, `Esperado 200, recebido ${r.status}: ${JSON.stringify(data)}`);
  assertEquals(data.success, true, "success deve ser true");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("cancel-order: funcionário sem can_access_orders não pode cancelar", async () => {
  await getJwt();
  mockRPCs();

  const { id: empId } = await ensureEmployeeUser("emp-noorders@teste.com", "teste123", { can_access_orders: false });
  const oid = await createOrderServiceForTest("em_preparo", empId);
  if (!oid) throw new Error("createOrderService retornou undefined");

  const employeeJwt = await getEmployeeJwt("emp-noorders@teste.com", "teste123");

  const r = await call({ orderId: oid, cancellation_reason: "cancelado_admin" }, employeeJwt);
  assertEquals(r.status, 403, "deve retornar 403");
  const data = await r.json();
  assertStringIncludes(data.error, "cancelar pedido");

  await deleteOrder(oid);
  mockInternalFn(null);
});
