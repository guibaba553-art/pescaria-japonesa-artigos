Deno.env.set("DENO_TEST", "1");

import { assertEquals, assertStringIncludes, assertExists } from "jsr:@std/assert@^1";
import { handleRequest } from "../tokenize-card/index.ts";
import { interceptFetch, setupEnv, mockAsaas, asaas } from "./mock_gateways.ts";
import { getJwt } from "./helpers.ts";

setupEnv();
interceptFetch();

async function call(body: Record<string, unknown>): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Authorization": `Bearer ${await getJwt()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

Deno.test("sem cardNumber → 400", async () => {
  const r = await call({ holderName: "T", expiryMonth: "12", expiryYear: "30", ccv: "123", postalCode: "89223005", addressNumber: "277" });
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "Missing required fields");
});

Deno.test("sem holderName → 400", async () => {
  const r = await call({ cardNumber: "4111111111111111", expiryMonth: "12", expiryYear: "30", ccv: "123", postalCode: "89223005", addressNumber: "277" });
  assertEquals(r.status, 400);
});

Deno.test("sem postalCode → 400", async () => {
  const r = await call({ cardNumber: "4111111111111111", holderName: "T", expiryMonth: "12", expiryYear: "30", ccv: "123", addressNumber: "277" });
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "Missing required fields");
});

Deno.test("sem addressNumber → 400", async () => {
  const r = await call({ cardNumber: "4111111111111111", holderName: "T", expiryMonth: "12", expiryYear: "30", ccv: "123", postalCode: "89223005" });
  assertEquals(r.status, 400);
  assertStringIncludes((await r.json()).error, "Missing required fields");
});

Deno.test("envia customer.id + postalCode + addressNumber ao Asaas", async () => {
  let customerSent = "";
  let holderInfoSent: Record<string, unknown> = {};
  mockAsaas((url, _method, body) => {
    if (url.includes("/customers") && !url.includes("/customers/cus_")) return asaas.customerCreate("cus_tok");
    if (url.includes("/customers/cus_")) return asaas.customerGet("cus_tok");
    if (url.includes("tokenizeCreditCard")) {
      customerSent = String((body as any)?.customer ?? "");
      holderInfoSent = (body as any)?.creditCardHolderInfo ?? {};
      return asaas.tokenizeOk("tok_ok");
    }
    return null;
  });

  const r = await call({ cardNumber: "4111111111111111", holderName: "T", expiryMonth: "12", expiryYear: "30", ccv: "123", postalCode: "89223005", addressNumber: "277" });
  mockAsaas(null);
  assertEquals(r.status, 200);
  const data = await r.json();
  assertEquals(data.success, true);
  assertEquals(data.creditCardToken, "tok_ok");
  assertEquals(customerSent.startsWith("cus_"), true, `customer should start with cus_, got: ${customerSent}`);
  assertEquals(holderInfoSent.postalCode, "89223005", "postalCode deve ser enviado ao Asaas");
  assertEquals(holderInfoSent.addressNumber, "277", "addressNumber deve ser enviado ao Asaas");
});

Deno.test("tokenização falha → erro do Asaas", async () => {
  mockAsaas((url) => {
    if (url.includes("/customers") && !url.includes("/customers/cus_")) return asaas.customerCreate("cus_fail");
    if (url.includes("/customers/cus_")) return asaas.customerGet("cus_fail");
    if (url.includes("tokenizeCreditCard")) return asaas.tokenizeFail("Bandeira não suportada");
    return null;
  });

  const r = await call({ cardNumber: "0000", holderName: "B", expiryMonth: "12", expiryYear: "30", ccv: "123", postalCode: "89223005", addressNumber: "277" });
  mockAsaas(null);
  assertEquals(r.status, 400);
  const data = await r.json();
  assertEquals(data.success, false);
  assertStringIncludes(data.error, "Bandeira não suportada");
});

Deno.test("sucesso retorna creditCardToken", async () => {
  mockAsaas((url) => {
    if (url.includes("/customers") && !url.includes("/customers/cus_")) return asaas.customerCreate("cus_ok");
    if (url.includes("/customers/cus_")) return asaas.customerGet("cus_ok");
    if (url.includes("tokenizeCreditCard")) return asaas.tokenizeOk("tok_xyz");
    return null;
  });

  const r = await call({ cardNumber: "4111111111111111", holderName: "T", expiryMonth: "12", expiryYear: "30", ccv: "123", postalCode: "89223005", addressNumber: "277" });
  mockAsaas(null);
  assertEquals(r.status, 200);
  assertEquals((await r.json()).creditCardToken, "tok_xyz");
});
