Deno.env.set("DENO_TEST", "1");

import { assertEquals, assertStringIncludes, assertExists } from "jsr:@std/assert@^1";
import { handleRequest } from "../create-abacatepay-pix/index.ts";
import { interceptFetch, setupEnv, mockAbacatePay, abacatepay } from "./mock_gateways.ts";
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
  const r = await call({ amount: 100 });
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "Invalid input");
});

Deno.test("sem amount → 400", async () => {
  const r = await call({ orderId: "x" });
  assertEquals(r.status, 400);
});

Deno.test("pedido inexistente → 404", async () => {
  const r = await call({ orderId: crypto.randomUUID(), amount: 100 });
  assertEquals(r.status, 404);
});

Deno.test("pix_attempts >= 3 → 400 (correção 2026-06-11)", async () => {
  const oid = await createOrder({ pix_attempts: 3 });
  const r = await call({ orderId: oid, amount: 100 });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "Número máximo de regenerações");
});

Deno.test("PIX já ativo → 400", async () => {
  const oid = await createOrder({ payment_id: "charge_existing" });
  const r = await call({ orderId: oid, amount: 100 });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "já possui um PIX");
});

Deno.test("lê pix_attempts com sucesso (correção 2026-06-11)", async () => {
  const oid = await createOrder();
  mockAbacatePay(() => abacatepay.pixOk());
  const r = await call({ orderId: oid, amount: 4990, description: "Test" });
  await deleteOrder(oid);
  mockAbacatePay(null);
  assertEquals(r.status, 200);
  const data = await r.json();
  assertEquals(data.success, true);
  assertExists(data.data.brCode);
});

Deno.test("geração PIX bem-sucedida", async () => {
  const oid = await createOrder();
  mockAbacatePay(() => abacatepay.pixOk());
  const r = await call({ orderId: oid, amount: 4990, description: "Test", customerName: "T", customerEmail: "t@t.com" });
  await deleteOrder(oid);
  mockAbacatePay(null);
  assertEquals(r.status, 200);
  assertEquals((await r.json()).success, true);
});
