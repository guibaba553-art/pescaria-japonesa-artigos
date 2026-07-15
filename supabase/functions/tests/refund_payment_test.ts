/**
 * Testes para a Edge Function refund-payment (refatorada com refundGateway).
 *
 * Requer: supabase start (banco local real para auth + DB)
 * Rode com: npm run test:functions
 */

Deno.env.set("DENO_TEST", "1");

import {
  assertEquals,
  assertStringIncludes,
  assertExists,
  assert,
} from "jsr:@std/assert@^1";
import { handleRequest } from "../refund-payment/index.ts";
import {
  interceptFetch,
  setupEnv,
  mockAsaas,
  mockMercadopago,
  asaas,
  mp,
} from "./mock_gateways.ts";
import { getJwt, createOrder, deleteOrder, SUPABASE_URL, ANON_KEY, TEST_USER_ID } from "./helpers.ts";

setupEnv();
interceptFetch();

async function call(body: Record<string, unknown>): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${await getJwt()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }));
}

async function getRefunds(orderId: string) {
  const jwt = await getJwt();
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/payment_refunds?order_id=eq.${orderId}&select=*`,
    {
      headers: {
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${jwt}`,
      },
    },
  );
  return await resp.json();
}

// ── Validação de entrada ───────────────────────────────────────────────────

Deno.test("refund: sem orderId → 400", async () => {
  const r = await call({});
  assertEquals(r.status, 400);
});

Deno.test("refund: pedido inexistente → 404", async () => {
  const r = await call({ orderId: crypto.randomUUID() });
  assertEquals(r.status, 404);
});

Deno.test("refund: pedido sem payment_gateway → 400", async () => {
  const oid = await createOrder({ payment_gateway: null, payment_id: null, asaas_payment_id: null, status: "cancelado" });
  const r = await call({ orderId: oid });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "não possui gateway");
});

Deno.test("refund: gateway não suportado → 400", async () => {
  const oid = await createOrder({ payment_gateway: "stripe", payment_id: "pi_123", status: "cancelado" });
  const r = await call({ orderId: oid });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "não suporta reembolso");
});

Deno.test("refund: sem asaas_payment_id no Asaas → 400", async () => {
  const oid = await createOrder({ payment_gateway: "asaas", asaas_payment_id: null, status: "cancelado" });
  const r = await call({ orderId: oid });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "asaas_payment_id");
});

// ── Refund via Asaas ───────────────────────────────────────────────────────

Deno.test("refund: Asaas — estorno total com sucesso", async () => {
  const oid = await createOrder({
    payment_gateway: "asaas",
    asaas_payment_id: "pay_asaas_test_001",
    payment_id: "pay_asaas_test_001",
    status: "devolvido",
    total_amount: 49.90,
  });

  mockAsaas((url) => {
    if (url.includes("/refund")) return asaas.refundOk();
    return null;
  });

  const r = await call({ orderId: oid });
  const data = await r.json();

  // Verificar resposta
  assertEquals(r.status, 200, `Esperado 200, recebido ${r.status}: ${JSON.stringify(data)}`);
  assertEquals(data.success, true);
  assertEquals(data.gateway, "asaas");
  assertEquals(data.status, "approved");
  assertExists(data.refundId);

  // Verificar registro no banco
  const refunds = await getRefunds(oid);
  assert(refunds.length >= 1, "Deveria ter registro em payment_refunds");
  assertEquals(refunds[0].gateway, "asaas");
  assertEquals(refunds[0].status, "approved");
  assertEquals(Number(refunds[0].amount), 49.90);

  await deleteOrder(oid);
  mockAsaas(null);
});

Deno.test("refund: Asaas — falha do gateway mapeada corretamente", async () => {
  const oid = await createOrder({
    payment_gateway: "asaas",
    asaas_payment_id: "pay_asaas_fail",
    payment_id: "pay_asaas_fail",
    status: "devolvido",
  });

  mockAsaas((url) => {
    if (url.includes("/refund")) return asaas.refundFail("Saldo insuficiente para estorno");
    return null;
  });

  const r = await call({ orderId: oid });
  const data = await r.json();
  assertEquals(r.status, 400);
  assertStringIncludes(data.error, "Gateway rejeitou");
  assertStringIncludes(data.details, "Saldo insuficiente");

  // Deve registrar como rejected
  const refunds = await getRefunds(oid);
  assert(refunds.length >= 1, "Deveria ter registro mesmo na falha");
  assertEquals(refunds[0].status, "rejected");
  assertEquals(refunds[0].gateway, "asaas");
  assertStringIncludes(refunds[0].error_message ?? "", "Saldo insuficiente");

  await deleteOrder(oid);
  mockAsaas(null);
});

Deno.test("refund: Asaas — estorno parcial com sucesso", async () => {
  const oid = await createOrder({
    payment_gateway: "asaas",
    asaas_payment_id: "pay_asaas_partial",
    payment_id: "pay_asaas_partial",
    status: "devolvido",
    total_amount: 100.00,
  });

  mockAsaas((url) => {
    if (url.includes("/refund")) return asaas.refundOk({ value: 50.00 });
    return null;
  });

  const r = await call({ orderId: oid, amount: 50.00 });
  assertEquals(r.status, 200);
  const data = await r.json();
  assertEquals(data.success, true);
  assertEquals(data.amount, 50.00);

  // Pegar o refund id do primeiro registro e verificar
  const refunds = await getRefunds(oid);
  assertEquals(Number(refunds[0].amount), 50.00);

  await deleteOrder(oid);
  mockAsaas(null);
});

// ── Refund via Mercado Pago ─────────────────────────────────────────────────

Deno.test("refund: Mercado Pago — estorno total com sucesso", async () => {
  const oid = await createOrder({
    payment_gateway: "mercadopago",
    payment_id: "mp_pay_001",
    asaas_payment_id: null,
    status: "devolvido",
    total_amount: 49.90,
  });

  mockMercadopago((url) => {
    if (url.includes("/refunds")) return mp.refundOk();
    return null;
  });

  const r = await call({ orderId: oid });
  const data = await r.json();
  assertEquals(r.status, 200, `Esperado 200, recebido ${r.status}: ${JSON.stringify(data)}`);
  assertEquals(data.success, true);
  assertEquals(data.gateway, "mercadopago");
  assertEquals(data.status, "approved");

  const refunds = await getRefunds(oid);
  assert(refunds.length >= 1, "Deveria ter registro em payment_refunds");
  assertEquals(refunds[0].gateway, "mercadopago");
  assertEquals(refunds[0].status, "approved");
  assertEquals(Number(refunds[0].amount), 49.90);

  await deleteOrder(oid);
  mockMercadopago(null);
});

Deno.test("refund: Mercado Pago — estorno parcial com sucesso", async () => {
  const oid = await createOrder({
    payment_gateway: "mercadopago",
    payment_id: "mp_pay_partial",
    asaas_payment_id: null,
    status: "devolvido",
    total_amount: 100.00,
  });

  mockMercadopago((url) => {
    if (url.includes("/refunds")) return mp.refundOk();
    return null;
  });

  const r = await call({ orderId: oid, amount: 30.00 });
  assertEquals(r.status, 200);
  const data = await r.json();
  assertEquals(data.success, true);
  assertEquals(data.amount, 30.00);

  const refunds = await getRefunds(oid);
  assertEquals(Number(refunds[0].amount), 30.00);

  await deleteOrder(oid);
  mockMercadopago(null);
});

Deno.test("refund: Mercado Pago — falha do gateway", async () => {
  const oid = await createOrder({
    payment_gateway: "mercadopago",
    payment_id: "mp_pay_fail",
    asaas_payment_id: null,
    status: "devolvido",
  });

  mockMercadopago((url) => {
    if (url.includes("/refunds")) return mp.refundFail("Cannot refund this payment");
    return null;
  });

  const r = await call({ orderId: oid });
  assertEquals(r.status, 400);
  const data = await r.json();
  assertStringIncludes(data.error, "Gateway rejeitou");

  const refunds = await getRefunds(oid);
  assert(refunds.length >= 1);
  assertEquals(refunds[0].status, "rejected");
  assertEquals(refunds[0].gateway, "mercadopago");

  await deleteOrder(oid);
  mockMercadopago(null);
});

// ── Proteção contra duplicidade ────────────────────────────────────────────

Deno.test("refund: pedido já totalmente estornado → 400", async () => {
  const oid = await createOrder({
    payment_gateway: "asaas",
    asaas_payment_id: "pay_already_refunded",
    payment_id: "pay_already_refunded",
    status: "devolvido",
    total_amount: 49.90,
  });

  // Primeiro estorno
  mockAsaas((url) => {
    if (url.includes("/refund")) return asaas.refundOk();
    return null;
  });

  const r1 = await call({ orderId: oid });
  assertEquals(r1.status, 200);

  // Segundo estorno — deve ser bloqueado
  const r2 = await call({ orderId: oid });
  assertEquals(r2.status, 400);
  assertStringIncludes((await r2.json()).error, "totalmente estornado");

  await deleteOrder(oid);
  mockAsaas(null);
});

// ── Limpeza ────────────────────────────────────────────────────────────────
// Nota: mocks são limpos individualmente em cada teste.
// restoreFetch() NÃO é chamado aqui — outros testes dependem do intercept.
