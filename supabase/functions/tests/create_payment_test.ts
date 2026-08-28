Deno.env.set("DENO_TEST", "1");

import { assertEquals, assertExists } from "jsr:@std/assert@^1";
import { handleRequest } from "../create-payment/index.ts";
import { interceptFetch, setupEnv, mockMercadopago, mockInternalFn } from "./mock_gateways.ts";
import { SERVICE_KEY, SUPABASE_URL, TEST_USER_ID } from "./helpers.ts";

setupEnv();
interceptFetch();

const PRODUTO_ID = "11111111-1111-1111-1111-111111111111";
const CPF_VALIDO = "11144477735";

// GoTrue local não permite remover o e-mail do usuário; para simular a sessão
// WhatsApp OTP mockamos apenas a fronteira GoTrue (mesmo padrão de
// tokenize_card_test.ts) — DB e serialização permanecem reais.
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

function mockSessaoEProdutos() {
  mockInternalFn((url) => {
    if (url.includes("/auth/v1/user")) return { status: 200, body: usuarioSemEmail() };
    if (url.includes("/rest/v1/products")) {
      return {
        status: 200,
        body: [{
          id: PRODUTO_ID,
          price: 49.9,
          sale_price: null,
          on_sale: false,
          sale_ends_at: null,
          sale_limit_qty: null,
          sale_sold_qty: null,
          min_sale_price: null,
        }],
      };
    }
    if (url.includes("/rest/v1/product_variations")) return { status: 200, body: [] };
    return null;
  });
}

async function limparRateLimit() {
  const svc = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` };
  await fetch(`${SUPABASE_URL}/rest/v1/payment_rate_limits?user_id=eq.${TEST_USER_ID}`, {
    method: "DELETE",
    headers: svc,
  });
}

// create-payment bloqueia PIX com token TEST- (isTestMode); usamos token de
// produção mockado e restauramos o valor original ao final.
async function comTokenProducao<T>(fn: () => Promise<T>): Promise<T> {
  const prevToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const prevSim = Deno.env.get("SIMULATE_PAYMENTS");
  Deno.env.set("MERCADO_PAGO_ACCESS_TOKEN", "APP_USR-mock-producao");
  if (prevSim === undefined) Deno.env.delete("SIMULATE_PAYMENTS");
  try {
    return await fn();
  } finally {
    if (prevToken === undefined) Deno.env.delete("MERCADO_PAGO_ACCESS_TOKEN");
    else Deno.env.set("MERCADO_PAGO_ACCESS_TOKEN", prevToken);
    if (prevSim !== undefined) Deno.env.set("SIMULATE_PAYMENTS", prevSim);
  }
}

function callAsSessaoMockada(body: Record<string, unknown>): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Authorization": "Bearer mock-jwt-sem-email", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

const itemPadrao = [{ id: PRODUTO_ID, name: "Vara de Pesca Teste", quantity: 1, price: 49.9 }];

Deno.test("telefone não confirmado → 403 PHONE_NOT_CONFIRMED (guarda server-side)", async () => {
  mockInternalFn((url) => {
    if (url.includes("/auth/v1/user")) {
      return { status: 200, body: { ...usuarioSemEmail(), phone_confirmed_at: null } };
    }
    return null;
  });
  const r = await callAsSessaoMockada({
    amount: 49.9,
    paymentMethod: "pix",
    items: itemPadrao,
    userName: "Cliente WhatsApp",
    userCpf: CPF_VALIDO,
  });
  mockInternalFn(null);
  assertEquals(r.status, 403);
  assertEquals((await r.json()).error, "PHONE_NOT_CONFIRMED");
});

Deno.test("PIX sem userEmail usa placeholder server-side no payer.email do MP", async () => {
  await limparRateLimit();
  mockSessaoEProdutos();
  let payerEmailCapturado: string | undefined;
  let mpChamado = false;
  mockMercadopago((_url, _m, body) => {
    mpChamado = true;
    payerEmailCapturado = (body as Record<string, any>)?.payer?.email;
    return {
      status: 201,
      body: { id: 9876543210, status: "pending", point_of_interaction: { transaction_data: { qr_code: "br.code.mock", qr_code_base64: "iVBORw0KGgo=" } } },
    };
  });

  try {
    const r = await comTokenProducao(() => callAsSessaoMockada({
      amount: 49.9,
      paymentMethod: "pix",
      items: itemPadrao,
      userName: "Cliente WhatsApp",
      userCpf: CPF_VALIDO,
    }));

    assertEquals(r.status, 200);
    const data = await r.json();
    assertEquals(data.success, true);
    assertExists(data.qrCode);
    assertEquals(mpChamado, true);
    assertEquals(payerEmailCapturado, `nao-informado.${TEST_USER_ID}@japapesca.com`);
  } finally {
    mockMercadopago(null);
    mockInternalFn(null);
    await limparRateLimit();
  }
});

Deno.test("cartão sem userEmail usa placeholder server-side no payer.email do MP", async () => {
  await limparRateLimit();
  mockSessaoEProdutos();
  let payerEmailCapturado: string | undefined;
  let pagamentoEnviado = false;
  mockMercadopago((url, _m, body) => {
    if (url.includes("/v1/payment_methods/search")) {
      return { status: 200, body: { results: [{ id: "visa", payment_type_id: "credit_card" }] } };
    }
    if (url.includes("/v1/payment_methods/installments")) {
      return { status: 200, body: [] };
    }
    if (url.endsWith("/v1/payments")) {
      pagamentoEnviado = true;
      payerEmailCapturado = (body as Record<string, any>)?.payer?.email;
      return {
        status: 201,
        body: { id: "mp_card_1", status: "approved", status_detail: "accredited", payment_type_id: "credit_card" },
      };
    }
    return null;
  });

  try {
    const r = await comTokenProducao(() => callAsSessaoMockada({
      amount: 49.9,
      paymentMethod: "credit",
      items: itemPadrao,
      installments: 1,
      cardData: {
        token: "tok_mock_1",
        paymentMethodId: "visa",
        cardNumber: "4111111111111111",
        cardholderName: "Cliente Teste",
        expirationDate: "12/30",
        securityCode: "123",
      },
    }));

    assertEquals(r.status, 200);
    const data = await r.json();
    assertEquals(data.success, true);
    assertEquals(pagamentoEnviado, true);
    assertEquals(payerEmailCapturado, `nao-informado.${TEST_USER_ID}@japapesca.com`);
  } finally {
    mockMercadopago(null);
    mockInternalFn(null);
    await limparRateLimit();
  }
});
