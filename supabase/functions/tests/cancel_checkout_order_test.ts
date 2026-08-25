// Tests for cancel-checkout-order
//
// Verifies that the function cancels (updates status to 'cancelado') the order
// instead of deleting it. Uses real local Supabase for DB + auth.

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { handleRequest } from "../cancel-checkout-order/index.ts";
import { interceptFetch, setupEnv, mockInternalFn, mockMercadopago } from "./mock_gateways.ts";
import { createOrder, deleteOrder, getJwt, SUPABASE_URL, ANON_KEY } from "./helpers.ts";

setupEnv();
interceptFetch();
Deno.env.set("MERCADO_PAGO_ACCESS_TOKEN", "TEST-mock-token");

function call(body: Record<string, unknown>, token?: string): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token ?? "no-token"}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }));
}

Deno.test("cancela pedido aguardando pagamento — seta status como cancelado (não deleta)", async () => {
  // Create an order awaiting payment
  const oid = await createOrder({ status: "aguardando_pagamento" });
  const jwt = await getJwt();

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

  const r = await call({ orderId: oid }, jwt);
  assertEquals(r.status, 200, "deve retornar 200");

  const body = await r.json();
  assertEquals(body.success, true, "success deve ser true");

  // Verify the order still exists and its status is 'cancelado' (not deleted)
  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}&select=id,status,cancellation_reason`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` },
  });
  const [updatedOrder] = await checkResp.json();
  assertEquals(updatedOrder?.status, "cancelado", "status deve ser cancelado, não deletado");
  assertEquals(updatedOrder?.cancellation_reason, "cancelado_pelo_cliente", "deve ter cancellation_reason");

  // Cleanup: delete the cancelled order from test DB
  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("rejeita pedido sem ordemId", async () => {
  const jwt = await getJwt();
  const r = await call({}, jwt);
  assertEquals(r.status, 400, "sem orderId deve retornar 400");
  const body = await r.json();
  assertStringIncludes(body.error || "", "orderId");
});

Deno.test("rejeita pedido sem autenticação", async () => {
  const r = await call({ orderId: "00000000-0000-0000-0000-000000000000" });
  assertEquals(r.status, 401, "sem auth deve retornar 401");
});

Deno.test("não cancela pedido que já não está aguardando pagamento", async () => {
  const oid = await createOrder({ status: "entregado", source: "pdv" });
  const jwt = await getJwt();

  mockInternalFn((url) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null;
  });

  const r = await call({ orderId: oid }, jwt);
  assertEquals(r.status, 200, "deve retornar 200");
  const body = await r.json();
  assertEquals(body.success, false, "success deve ser false");
  assertEquals(body.status, "entregado", "deve retornar status atual");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("pedido com payment_id mercadopago → chama cancellations no MP antes de cancelar", async () => {
  const oid = await createOrder({
    status: "aguardando_pagamento",
    payment_id: "9876543210",
    payment_gateway: "mercadopago",
  });
  const jwt = await getJwt();

  const mpCalls: { url: string; method: string }[] = [];
  mockMercadopago((url, method) => {
    mpCalls.push({ url, method });
    if (url.includes("/cancellations")) {
      return { status: 200, body: { id: 9876543210, status: "cancelled" } };
    }
    return null;
  });

  mockInternalFn((url) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null;
  });

  const r = await call({ orderId: oid }, jwt);

  mockMercadopago(null);
  mockInternalFn(null);

  assertEquals(r.status, 200);
  assertEquals((await r.json()).success, true);
  assertEquals(
    mpCalls.some((c) => c.url.includes("/v1/payments/9876543210/cancellations") && c.method === "POST"),
    true,
    "deve chamar POST /v1/payments/{id}/cancellations",
  );

  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}&select=status`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` },
  });
  const [updatedOrder] = await checkResp.json();
  assertEquals(updatedOrder.status, "cancelado");

  await deleteOrder(oid);
});

Deno.test("pedido sem payment_id → não chama o MP", async () => {
  const oid = await createOrder({ status: "aguardando_pagamento" });
  const jwt = await getJwt();

  const mpCalls: { url: string }[] = [];
  mockMercadopago((url) => {
    mpCalls.push({ url });
    return null;
  });

  mockInternalFn((url) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null;
  });

  const r = await call({ orderId: oid }, jwt);

  mockMercadopago(null);
  mockInternalFn(null);

  assertEquals(r.status, 200);
  assertEquals((await r.json()).success, true);
  assertEquals(mpCalls.length, 0, "não deve chamar o MP sem payment_id");

  await deleteOrder(oid);
});

Deno.test("falha do MP não bloqueia o cancelamento do pedido", async () => {
  const oid = await createOrder({
    status: "aguardando_pagamento",
    payment_id: "9876543211",
    payment_gateway: "mercadopago",
  });
  const jwt = await getJwt();

  mockMercadopago(() => ({ status: 400, body: { message: "cannot cancel" } }));

  mockInternalFn((url) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null;
  });

  const r = await call({ orderId: oid }, jwt);

  mockMercadopago(null);
  mockInternalFn(null);

  assertEquals(r.status, 200);
  assertEquals((await r.json()).success, true, "cancelamento deve prosseguir mesmo com MP falhando");

  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}&select=status`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` },
  });
  const [updatedOrder] = await checkResp.json();
  assertEquals(updatedOrder.status, "cancelado");

  await deleteOrder(oid);
});
