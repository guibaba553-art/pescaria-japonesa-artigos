Deno.env.set("DENO_TEST", "1");
Deno.env.set("MERCADO_PAGO_ACCESS_TOKEN", "TEST-123456789");

import { assertEquals, assertStringIncludes, assertExists } from "jsr:@std/assert@^1";
import { handleRequest } from "../create-mercadopago-pix/index.ts";
import { interceptFetch, setupEnv, mockMercadopago, mp } from "./mock_gateways.ts";
import { getJwt, createOrder, deleteOrder } from "./helpers.ts";

setupEnv();
interceptFetch();

async function call(body: Record<string, unknown>): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Authorization": `Bearer ${await getJwt()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

Deno.test("sem orderId → 400", async () => {
  const r = await call({});
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "orderId");
});

Deno.test("pedido inexistente → 404", async () => {
  const r = await call({ orderId: crypto.randomUUID() });
  assertEquals(r.status, 404);
});

Deno.test("pix_attempts >= 3 → 400 (correção 2026-06-11)", async () => {
  const oid = await createOrder({ pix_attempts: 3 });
  const r = await call({ orderId: oid });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "Número máximo de regenerações");
});

Deno.test("PIX já ativo → 400", async () => {
  const oid = await createOrder({ payment_id: "pay_existing" });
  const r = await call({ orderId: oid });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "PIX em processamento");
});

Deno.test("cria PIX com sucesso", async () => {
  const oid = await createOrder();
  mockMercadopago((url) => {
    if (url.includes("api.mercadopago.com")) return mp.pixOk();
    return null;
  });

  const r = await call({ orderId: oid });
  await deleteOrder(oid);
  mockMercadopago(null);
  assertEquals(r.status, 200);
  const data = await r.json();
  assertEquals(data.success, true);
  assertExists(data.data.brCode);
});
