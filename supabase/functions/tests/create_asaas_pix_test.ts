Deno.env.set("DENO_TEST", "1");

import { assertEquals, assertStringIncludes, assertExists } from "jsr:@std/assert@^1";
import { handleRequest } from "../create-asaas-pix/index.ts";
import { interceptFetch, setupEnv, mockAsaas, mockInternalFn, asaas } from "./mock_gateways.ts";
import { getJwt, createOrder, deleteOrder, SERVICE_KEY, SUPABASE_URL, ANON_KEY, TEST_USER_ID } from "./helpers.ts";

setupEnv();
interceptFetch();

async function call(body: Record<string, unknown>): Promise<Response> {
  return callAs(await getJwt(), body);
}

async function callAs(jwt: string, body: Record<string, unknown>): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Authorization": `Bearer ${jwt}`, "Content-Type": "application/json" },
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

const ADMIN_EMAIL = "admin@pescaria.com";

// GoTrue local não permite login de e-mail não confirmado nem remover o e-mail
// do usuário (PATCH email:"" sem suporte). Para simular a sessão WhatsApp OTP
// (identidade sem e-mail), mockamos apenas a fronteira GoTrue — GET /auth/v1/user
// devolve usuário SEM e-mail; DB, lógica da EF e serialização permanecem reais.
function usuarioSemEmail(): Record<string, unknown> {
  return {
    id: TEST_USER_ID,
    aud: "authenticated",
    email: null,
    email_confirmed_at: null,
    phone: "+5511999999999",
    phone_confirmed_at: new Date().toISOString(),
    user_metadata: { full_name: "Cliente WhatsApp" },
  };
}

// Garante que o fluxo passe pelo POST /customers (payload observável): se o
// profile já tiver asaas_customer_id de execuções anteriores, a EF só faz GET.
async function withAsaasCustomerIdResetado(fn: () => Promise<void>) {
  const svc = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
  const cur = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}&select=asaas_customer_id`, { headers: svc });
  const prev = (await cur.json())[0]?.asaas_customer_id ?? null;
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}`, {
    method: "PATCH", headers: svc, body: JSON.stringify({ asaas_customer_id: null }),
  });
  try {
    await fn();
  } finally {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}`, {
      method: "PATCH", headers: svc, body: JSON.stringify({ asaas_customer_id: prev }),
    });
  }
}

function capturarCustomerCreate(fn: (body: Record<string, unknown> | null) => void) {
  mockAsaas((url, _method, body) => {
    if (typeof body === "object" && body !== null && "cpfCnpj" in body) fn(body as Record<string, unknown>);
    if (url.includes("/customers") && !url.includes("/customers/cus_")) return asaas.customerCreate("cus_pix");
    if (url.includes("/customers/cus_")) return asaas.customerGet("cus_pix");
    if (url.includes("pixQrCode")) return asaas.pixQrCode();
    if (url.includes("/payments")) return asaas.pixPaymentOk();
    return null;
  });
}

Deno.test("usuário sem e-mail: customer NÃO envia chave email (correção string vazia)", async () => {
  await withAsaasCustomerIdResetado(async () => {
    const oid = await createOrder();

    mockInternalFn((url) => {
      if (url.includes("/auth/v1/user")) return { status: 200, body: usuarioSemEmail() };
      return null;
    });
    let capturedBody: Record<string, unknown> | null = null;
    capturarCustomerCreate((b) => { capturedBody = b; });

    const r = await callAs("mock-jwt-sem-email", { orderId: oid });

    await deleteOrder(oid);
    mockAsaas(null);
    mockInternalFn(null);

    assertEquals(r.status, 200);
    assertExists(capturedBody);
    assertEquals("email" in (capturedBody as Record<string, unknown>), false);
  });
});

Deno.test("usuário com e-mail confirmado: customer mantém email da sessão (payload igual)", async () => {
  await withAsaasCustomerIdResetado(async () => {
    const oid = await createOrder();
    let capturedBody: Record<string, unknown> | null = null;
    capturarCustomerCreate((b) => { capturedBody = b; });

    const r = await call({ orderId: oid });

    await deleteOrder(oid);
    mockAsaas(null);

    assertEquals(r.status, 200);
    assertExists(capturedBody);
    assertEquals((capturedBody as Record<string, unknown>).email, ADMIN_EMAIL);
  });
});

// PATCH em profiles.card_contact_email com save/restore (mesmo padrão de
// tokenize_card_test.ts).
async function comCardContactEmail(email: string | null, fn: () => Promise<void>) {
  const svc = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
  const cur = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}&select=card_contact_email`, { headers: svc });
  const prev = ((await cur.json())[0] as Record<string, unknown> | undefined)?.card_contact_email ?? null;
  const patch = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}`, {
    method: "PATCH", headers: svc, body: JSON.stringify({ card_contact_email: email }),
  });
  if (!patch.ok) throw new Error(`PATCH card_contact_email falhou: ${patch.status} ${await patch.text()}`);
  try {
    await fn();
  } finally {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}`, {
      method: "PATCH", headers: svc, body: JSON.stringify({ card_contact_email: prev }),
    });
  }
}

Deno.test("usuário sem authEmail mas com card_contact_email salvo: escada usa o contato salvo", async () => {
  await comCardContactEmail("salvo@contato.com", async () => {
    await withAsaasCustomerIdResetado(async () => {
      const oid = await createOrder();

      mockInternalFn((url) => {
        if (url.includes("/auth/v1/user")) return { status: 200, body: usuarioSemEmail() };
        return null;
      });
      let capturedBody: Record<string, unknown> | null = null;
      capturarCustomerCreate((b) => { capturedBody = b; });

      const r = await callAs("mock-jwt-sem-email", { orderId: oid });

      await deleteOrder(oid);
      mockAsaas(null);
      mockInternalFn(null);

      assertEquals(r.status, 200);
      assertExists(capturedBody);
      assertEquals((capturedBody as Record<string, unknown>).email, "salvo@contato.com");
    });
  });
});
