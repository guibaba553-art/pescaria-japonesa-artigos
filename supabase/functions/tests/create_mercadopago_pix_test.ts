Deno.env.set("DENO_TEST", "1");
Deno.env.set("MERCADO_PAGO_ACCESS_TOKEN", "TEST-123456789");

import { assertEquals, assertStringIncludes, assertExists } from "jsr:@std/assert@^1";
import { handleRequest } from "../create-mercadopago-pix/index.ts";
import { interceptFetch, setupEnv, mockMercadopago, mockInternalFn, mp } from "./mock_gateways.ts";
import { getJwt, createOrder, deleteOrder, SERVICE_KEY, SUPABASE_URL, TEST_USER_ID } from "./helpers.ts";

setupEnv();
interceptFetch();

async function call(body: Record<string, unknown>): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Authorization": `Bearer ${await getJwt()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function callAs(jwt: string, body: Record<string, unknown>): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Authorization": `Bearer ${jwt}`, "Content-Type": "application/json" },
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

// GoTrue local não permite remover o e-mail do usuário; para simular a sessão
// WhatsApp OTP mockamos apenas a fronteira GoTrue (mesmo padrão de
// tokenize_card_test.ts) — DB e lógica da EF permanecem reais.
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

// PATCH em profiles.card_contact_email com save/restore (padrão tokenize_card_test.ts)
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

Deno.test("usuário sem authEmail mas com card_contact_email salvo: payer usa o contato salvo", async () => {
  await comCardContactEmail("salvo@contato.com", async () => {
    const oid = await createOrder();

    mockInternalFn((url) => {
      if (url.includes("/auth/v1/user")) return { status: 200, body: usuarioSemEmail() };
      return null;
    });
    let payerSent: Record<string, unknown> | null = null;
    mockMercadopago((url, _method, body) => {
      if (url.includes("/v1/payments") && typeof body === "object" && body !== null) {
        payerSent = ((body as Record<string, unknown>).payer ?? null) as Record<string, unknown> | null;
      }
      if (url.includes("api.mercadopago.com")) return mp.pixOk();
      return null;
    });

    const r = await callAs("mock-jwt-sem-email", { orderId: oid });

    await deleteOrder(oid);
    mockMercadopago(null);
    mockInternalFn(null);

    assertEquals(r.status, 200);
    assertExists(payerSent);
    assertEquals((payerSent as Record<string, unknown>).email, "salvo@contato.com");
  });
});
