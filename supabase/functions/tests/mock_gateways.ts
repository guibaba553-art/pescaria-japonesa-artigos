/**
 * Mock external payment gateways (Asaas, AbacatePay) for edge function tests.
 *
 * Intercepts global `fetch` calls to external APIs, returning fake responses.
 * Supabase REST/Auth calls pass through to the real local instance.
 */

const _originalFetch = globalThis.fetch.bind(globalThis);

type MockFn = (url: string, method: string, body: unknown) => { status: number; body: unknown } | null;

let _asaasMock: MockFn | null = null;
let _abacateMock: MockFn | null = null;
let _internalMock: MockFn | null = null;

export function mockAsaas(fn: MockFn | null) { _asaasMock = fn; }
export function mockAbacatePay(fn: MockFn | null) { _abacateMock = fn; }
/** Generic mock for any URL not caught by gateway mocks (e.g. internal edge functions) */
export function mockInternalFn(fn: MockFn | null) { _internalMock = fn; }

export function interceptFetch() {
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.href;
    const method = init?.method ?? "GET";
    let body: unknown;
    if (init?.body && typeof init.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }

    if (url.includes("api-sandbox.asaas.com") || url.includes("api.asaas.com")) {
      const r = _asaasMock?.(url, method, body);
      if (r) return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Asaas mock not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    if (url.includes("api.abacatepay.com")) {
      const r = _abacateMock?.(url, method, body);
      if (r) return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AbacatePay mock not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Generic internal mock (for subtract-stock, etc.)
    if (_internalMock) {
      const r = _internalMock(url, method, body);
      if (r) return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
    }

    return _originalFetch(input, init);
  };
}

export function restoreFetch() { globalThis.fetch = _originalFetch; }

export function setupEnv() {
  Deno.env.set("DENO_TEST", "1");
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU");
  Deno.env.set("ASAAS_API_KEY", "test_mocked_key");
  Deno.env.set("ASAAS_ENVIRONMENT", "sandbox");
  Deno.env.set("ABACATEPAY_API_KEY", "test_mocked_abacatepay_key");
}

function jsonStatus(status: number, body: unknown) { return { status, body }; }

export const asaas = {
  tokenizeOk: (token = "tok_mock_abc") => jsonStatus(200, { creditCardToken: token, creditCardNumber: "4242", creditCardBrand: "VISA" }),
  tokenizeFail: (msg = "Cartão inválido") => jsonStatus(400, { errors: [{ code: "invalid_card", description: msg }] }),
  paymentOk: (overrides: Record<string, unknown> = {}) => jsonStatus(200, { id: "pay_001", status: "CONFIRMED", value: 49.90, netValue: 47.41, installmentCount: 1, creditCardBrandName: "VISA", creditCard: { brand: "VISA", lastFourDigits: "4242", creditCardToken: "tok_from_payment" }, ...overrides }),
  paymentFail: (msg = "Cartão recusado.") => jsonStatus(400, { errors: [{ code: "invalid_card", description: msg }] }),
  customerCreate: (id = "cus_mock_001") => jsonStatus(200, { id, name: "Test", email: "t@t.com", cpfCnpj: "123" }),
  customerGet: (id = "cus_mock_001") => jsonStatus(200, { id, name: "Test" }),
  pixPaymentOk: () => jsonStatus(200, { id: "pay_pix_001", status: "PENDING" }),
  pixQrCode: () => jsonStatus(200, { encodedImage: "iVBORw0KGgo...", payload: "00020126580014BR.GOV.BCB.PIX...", expirationDate: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
};

export const abacatepay = {
  pixOk: () => jsonStatus(200, { success: true, data: { id: "chg_001", brCode: "000201...", brCodeBase64: "iVBORw...", expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), amount: 100, platformFee: 0 } }),
};
