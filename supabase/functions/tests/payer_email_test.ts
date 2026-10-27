import { assertEquals } from "jsr:@std/assert@^1";
import { resolveCardholderEmail, resolveOptionalCustomerEmail } from "../_shared/payerEmail.ts";

const UID = "00000000-0000-0000-0000-000000000001";
const PLACEHOLDER = `nao-informado.${UID}@japapesca.com`;

Deno.test("cardholder: e-mail confirmado vence", () => {
  assertEquals(
    resolveCardholderEmail({ authEmail: "real@test.com", authEmailConfirmed: true, contactEmail: "saved@test.com", userId: UID }),
    "real@test.com",
  );
});

Deno.test("cardholder: e-mail de auth NÃO confirmado é ignorado", () => {
  assertEquals(
    resolveCardholderEmail({ authEmail: "real@test.com", authEmailConfirmed: false, contactEmail: "saved@test.com", userId: UID }),
    "saved@test.com",
  );
});

Deno.test("cardholder: cai para contactEmail quando não há auth", () => {
  assertEquals(resolveCardholderEmail({ contactEmail: "saved@test.com", userId: UID }), "saved@test.com");
});

Deno.test("cardholder: placeholder determinístico como último recurso", () => {
  assertEquals(resolveCardholderEmail({ userId: UID }), PLACEHOLDER);
});

Deno.test("customer opcional: undefined quando nada disponível (omitir chave)", () => {
  assertEquals(resolveOptionalCustomerEmail({ userId: UID }), undefined);
});

Deno.test("customer opcional: usa confirmado ou contato quando existem", () => {
  assertEquals(resolveOptionalCustomerEmail({ authEmail: "a@b.com", authEmailConfirmed: true, userId: UID }), "a@b.com");
  assertEquals(resolveOptionalCustomerEmail({ contactEmail: "c@d.com", userId: UID }), "c@d.com");
});
