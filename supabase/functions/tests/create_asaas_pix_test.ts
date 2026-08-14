Deno.env.set("DENO_TEST", "1");

import { assertEquals, assertStringIncludes, assertExists } from "jsr:@std/assert@^1";
import { handleRequest } from "../create-asaas-pix/index.ts";
import { interceptFetch, setupEnv, mockAsaas, asaas } from "./mock_gateways.ts";
import { getJwt, createOrder, deleteOrder, SUPABASE_URL, ANON_KEY } from "./helpers.ts";

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
  assertStringIncludes((await r.json()).error, "Missing required field");
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
  const oid = await createOrder({ asaas_payment_id: "pay_existing" });
  const r = await call({ orderId: oid });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "já possui um PIX");
});

Deno.test("lê pix_attempts com sucesso (correção 2026-06-11)", async () => {
  const oid = await createOrder();
  mockAsaas((url) => {
    if (url.includes("/customers") && !url.includes("/customers/cus_")) return asaas.customerCreate("cus_pix");
    if (url.includes("/customers/cus_")) return asaas.customerGet("cus_pix");
    if (url.includes("pixQrCode")) return asaas.pixQrCode();
    if (url.includes("/payments")) return asaas.pixPaymentOk();
    return null;
  });

  const r = await call({ orderId: oid });
  await deleteOrder(oid);
  mockAsaas(null);
  assertEquals(r.status, 200);
  const data = await r.json();
  assertEquals(data.success, true);
  assertExists(data.data.brCode);
});

Deno.test("grava asaas_payment_id no pedido após PIX criado", async () => {
  const oid = await createOrder();
  mockAsaas((url) => {
    if (url.includes("/customers") && !url.includes("/customers/cus_")) return asaas.customerCreate("cus_pix");
    if (url.includes("/customers/cus_")) return asaas.customerGet("cus_pix");
    if (url.includes("pixQrCode")) return asaas.pixQrCode();
    if (url.includes("/payments")) return asaas.pixPaymentOk();
    return null;
  });

  const r = await call({ orderId: oid });
  mockAsaas(null);

  assertEquals(r.status, 200);

  // Verifica que o ID do pagamento foi persistido no pedido
  const jwt = await getJwt();
  const q = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}&select=asaas_payment_id,payment_gateway`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` },
  });
  const rows = await q.json();
  await deleteOrder(oid);

  assertEquals(rows[0]?.asaas_payment_id, "pay_pix_001");
  assertEquals(rows[0]?.payment_gateway, "asaas");
});
