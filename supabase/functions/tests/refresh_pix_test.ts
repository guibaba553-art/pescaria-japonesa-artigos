Deno.env.set("DENO_TEST", "1");
Deno.env.set("MERCADO_PAGO_ACCESS_TOKEN", "TEST-123456789");

import { assertEquals, assertExists } from "jsr:@std/assert@^1";
import { handleRequest } from "../refresh-pix/index.ts";
import { interceptFetch, setupEnv, mockAsaas, mockMercadopago, mockInternalFn, asaas, mp } from "./mock_gateways.ts";
import { createOrder, deleteOrder, SERVICE_KEY, SUPABASE_URL, TEST_USER_ID } from "./helpers.ts";

setupEnv();
interceptFetch();

async function callAs(jwt: string, body: Record<string, unknown>): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Authorization": `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

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

const svcHeaders = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

// PATCH em profiles.card_contact_email com save/restore (padrão tokenize_card_test.ts)
async function comCardContactEmail(email: string | null, fn: () => Promise<void>) {
  const cur = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}&select=card_contact_email`, { headers: svcHeaders });
  const prev = ((await cur.json())[0] as Record<string, unknown> | undefined)?.card_contact_email ?? null;
  const patch = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}`, {
    method: "PATCH", headers: svcHeaders, body: JSON.stringify({ card_contact_email: email }),
  });
  if (!patch.ok) throw new Error(`PATCH card_contact_email falhou: ${patch.status} ${await patch.text()}`);
  try {
    await fn();
  } finally {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}`, {
      method: "PATCH", headers: svcHeaders, body: JSON.stringify({ card_contact_email: prev }),
    });
  }
}

// Garante POST /customers (payload observável) no caminho Asaas.
async function resetarAsaasCustomerId() {
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${TEST_USER_ID}`, {
    method: "PATCH", headers: svcHeaders, body: JSON.stringify({ asaas_customer_id: null }),
  });
}

Deno.test("novo PIX Asaas (path 4): sem authEmail mas com card_contact_email salvo → customer usa o contato salvo", async () => {
  await comCardContactEmail("salvo@contato.com", async () => {
    await resetarAsaasCustomerId();
    const oid = await createOrder();

    mockInternalFn((url) => {
      if (url.includes("/auth/v1/user")) return { status: 200, body: usuarioSemEmail() };
      return null;
    });
    let customerPayload: Record<string, unknown> | null = null;
    mockAsaas((url, _method, body) => {
      if (typeof body === "object" && body !== null && "cpfCnpj" in body) customerPayload = body as Record<string, unknown>;
      if (url.includes("/customers") && !url.includes("/customers/cus_")) return asaas.customerCreate("cus_rfx");
      if (url.includes("/customers/cus_")) return asaas.customerGet("cus_rfx");
      if (url.includes("pixQrCode")) return asaas.pixQrCode();
      if (url.includes("/payments")) return asaas.pixPaymentOk();
      return null;
    });

    const r = await callAs("mock-jwt-sem-email", { orderId: oid });

    await deleteOrder(oid);
    mockAsaas(null);
    mockInternalFn(null);

    assertEquals(r.status, 200);
    assertExists(customerPayload);
    assertEquals((customerPayload as Record<string, unknown>).email, "salvo@contato.com");
  });
});

Deno.test("PIX MP existente (path 3): sem authEmail mas com card_contact_email salvo → payer usa o contato salvo", async () => {
  await comCardContactEmail("salvo@contato.com", async () => {
    const oid = await createOrder({ payment_gateway: "mercadopago", payment_id: "pay_mp_refresh" });

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
