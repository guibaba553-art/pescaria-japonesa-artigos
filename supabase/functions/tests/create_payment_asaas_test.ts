Deno.env.set("DENO_TEST", "1");

import { assertEquals, assertStringIncludes, assertExists, assert } from "jsr:@std/assert@^1";
import { handleRequest } from "../create-payment-asaas/index.ts";
import { interceptFetch, setupEnv, mockAsaas, asaas } from "./mock_gateways.ts";
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

// ── Validation ──

Deno.test("rejeita sem orderId", async () => {
  const r = await call({});
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "Missing required fields");
});

Deno.test("rejeita sem creditCard nem token", async () => {
  const r = await call({ orderId: "x", installmentCount: 1, remoteIp: "127.0.0.1", customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" } });
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "Either creditCardToken");
});

Deno.test("pedido inexistente → 404", async () => {
  const r = await call({ orderId: crypto.randomUUID(), installmentCount: 1, remoteIp: "127.0.0.1", customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" }, creditCardToken: "x" });
  assertEquals(r.status, 404);
});

Deno.test("pedido já pago → 400", async () => {
  const oid = await createOrder({ status: "em_preparo" });
  const r = await call({ orderId: oid, installmentCount: 1, remoteIp: "127.0.0.1", customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" }, creditCardToken: "x" });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertEquals((await r.json()).error, "Este pedido já foi pago.");
});

Deno.test("max tentativas → 400", async () => {
  const oid = await createOrder({ payment_attempts: 3 });
  const r = await call({ orderId: oid, installmentCount: 1, remoteIp: "127.0.0.1", customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" }, creditCardToken: "x" });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "Número máximo");
});

Deno.test("cobrança duplicada P29 → 400", async () => {
  const oid = await createOrder({ asaas_payment_id: "pay_existing" });
  const r = await call({ orderId: oid, installmentCount: 1, remoteIp: "127.0.0.1", customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" }, creditCardToken: "x" });
  await deleteOrder(oid);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "já possui uma cobrança");
});

// ── Tokenization (mocked Asaas) ──

Deno.test("tokenização com customer.id (correção 2026-06-11)", async () => {
  const oid = await createOrder();
  mockAsaas((url) => {
    if (url.includes("/customers") && !url.includes("/customers/cus_")) return asaas.customerCreate("cus_001");
    if (url.includes("/customers/cus_")) return asaas.customerGet("cus_001");
    if (url.includes("tokenizeCreditCard")) return asaas.tokenizeOk("tok_new");
    if (url.includes("/payments")) return asaas.paymentOk();
    return null;
  });

  const r = await call({
    orderId: oid, installmentCount: 1, saveCard: false, remoteIp: "127.0.0.1",
    customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" },
    creditCard: { holderName: "JOÃO", number: "4111111111111111", expiryMonth: "12", expiryYear: "30", ccv: "123" },
    creditCardHolderInfo: { name: "T", email: "t@t.com", cpfCnpj: "123", postalCode: "12345678", addressNumber: "100", phone: "11" },
  });

  await deleteOrder(oid);
  mockAsaas(null);
  assertEquals(r.status, 200);
});

Deno.test("tokeniza sem saveCard (correção 2026-06-11)", async () => {
  const oid = await createOrder();
  mockAsaas((url) => {
    if (url.includes("/customers")) return asaas.customerCreate("cus_002");
    if (url.includes("tokenizeCreditCard")) return asaas.tokenizeOk("tok_ns");
    if (url.includes("/payments")) return asaas.paymentOk();
    return null;
  });

  const r = await call({
    orderId: oid, installmentCount: 1, saveCard: false, remoteIp: "127.0.0.1",
    customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" },
    creditCard: { holderName: "JOÃO", number: "4111111111111111", expiryMonth: "12", expiryYear: "30", ccv: "123" },
    creditCardHolderInfo: { name: "T", email: "t@t.com", cpfCnpj: "123", postalCode: "12345678", addressNumber: "100", phone: "11" },
  });
  await deleteOrder(oid);
  mockAsaas(null);
  assertEquals(r.status, 200);
});

Deno.test("tokenização falha → erro", async () => {
  const oid = await createOrder();
  mockAsaas((url) => {
    if (url.includes("/customers")) return asaas.customerCreate("cus_003");
    if (url.includes("tokenizeCreditCard")) return asaas.tokenizeFail("Bandeira inválida");
    return null;
  });

  const r = await call({
    orderId: oid, installmentCount: 1, saveCard: false, remoteIp: "127.0.0.1",
    customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" },
    creditCard: { holderName: "JOÃO", number: "4111111111111111", expiryMonth: "12", expiryYear: "30", ccv: "123" },
    creditCardHolderInfo: { name: "T", email: "t@t.com", cpfCnpj: "123", postalCode: "12345678", addressNumber: "100", phone: "11" },
  });
  await deleteOrder(oid);
  mockAsaas(null);
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "Pagamento temporariamente indisponível");
});

// ── P09: validação skip com token ──

Deno.test("P09 não valida cartão com token (correção 2026-06-11)", async () => {
  const oid = await createOrder();
  mockAsaas((url) => {
    if (url.includes("/customers")) return asaas.customerCreate("cus_004");
    if (url.includes("/payments")) return asaas.paymentOk();
    return null;
  });

  const r = await call({
    orderId: oid, installmentCount: 1, remoteIp: "127.0.0.1",
    customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" },
    creditCardToken: "tok_real", // token presente → P09 deve pular
    creditCard: { holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "" },
    creditCardHolderInfo: { name: "", email: "", cpfCnpj: "", postalCode: "", addressNumber: "", phone: "" },
  });
  await deleteOrder(oid);
  mockAsaas(null);
  const data = await r.json();
  // Não deve ser erro de validação de cartão
  if (r.status === 400) assert(!data.error?.includes("Número do cartão"), "P09 should skip");
  assertEquals(r.status, 200);
});

// ── P01: UUID token lookup ──

Deno.test("P01 lookup de token por UUID", async () => {
  const jwt = await getJwt();
  const sr = await fetch(`http://127.0.0.1:54321/rest/v1/saved_payment_methods`, {
    method: "POST",
    headers: { "apikey": "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH", "Authorization": `Bearer ${jwt}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000001", payment_method: "credit_card", asaas_credit_card_token: "tok_db_xyz", card_brand: "VISA", card_last4: "4242", cardholder_name: "T", card_exp_month: "12", card_exp_year: "30" }),
  });
  const sid = ((await sr.json()) as any)[0]?.id;
  const oid = await createOrder();

  mockAsaas((url) => {
    if (url.includes("/customers/cus_")) return asaas.customerGet("cus_005");
    if (url.includes("/customers")) return asaas.customerCreate("cus_005");
    if (url.includes("/payments")) return asaas.paymentOk();
    if (url.includes("tokenizeCreditCard")) return asaas.tokenizeOk("tok_from_lookup");
    return null;
  });

  const r = await call({
    orderId: oid, installmentCount: 1, remoteIp: "127.0.0.1",
    customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" },
    creditCardToken: sid,
    creditCard: { holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "" },
    creditCardHolderInfo: { name: "", email: "", cpfCnpj: "", postalCode: "", addressNumber: "", phone: "" },
  });

  await deleteOrder(oid);
  if (sid) await fetch(`http://127.0.0.1:54321/rest/v1/saved_payment_methods?id=eq.${sid}`, { method: "DELETE", headers: { "apikey": "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH", "Authorization": `Bearer ${jwt}` } });
  mockAsaas(null);

  const data = await r.json();
  assert(data.error !== "Cartão salvo não encontrado.", "P01 lookup should not fail with 'Cartão salvo não encontrado'");
  // Should be successful (200) or at least not a "not found" error
  assert(r.status === 200 || r.status === 201, `Expected 200, got ${r.status}: ${JSON.stringify(data)}`);
});

// ── Payment declined ──

Deno.test("cartão recusado retorna attemptsRemaining", async () => {
  const oid = await createOrder();
  mockAsaas((url) => {
    if (url.includes("/customers")) return asaas.customerCreate("cus_006");
    if (url.includes("/payments")) return asaas.paymentFail("Recusado pela operadora.");
    return null;
  });

  const r = await call({
    orderId: oid, installmentCount: 1, remoteIp: "127.0.0.1",
    customerData: { name: "T", email: "t@t.com", cpfCnpj: "123", phone: "11" },
    creditCardToken: "tok_bad",
    creditCard: { holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "" },
    creditCardHolderInfo: { name: "", email: "", cpfCnpj: "", postalCode: "", addressNumber: "", phone: "" },
  });
  await deleteOrder(oid);
  mockAsaas(null);
  assertEquals(r.status, 400);
  const data = await r.json();
  assertExists(data.attemptsRemaining);
});
