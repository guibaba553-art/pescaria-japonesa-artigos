---
name: testing-practices
description: Testing conventions for this project: Vitest for frontend/lib, Deno for Edge Functions with mocked external APIs and real Supabase local.
---


# Testing Practices — Pescaria Japonesa Artigos

## Two test suites

| Suite | Runner | Location | Command | Requires |
|-------|--------|----------|---------|----------|
| Frontend + lib | Vitest | `src/**/__tests__/*.test.{ts,tsx}` | `npm test` | Nothing |
| Edge Functions | Deno | `supabase/functions/tests/*.ts` | `npm run test:functions` | `supabase start` |

## Edge Function tests (Deno)

### Architecture

Each test file imports the **real `handleRequest`** from the Edge Function under test. External API calls (Asaas, AbacatePay) are mocked by intercepting `globalThis.fetch` via `mock_gateways.ts`. Supabase calls (auth, DB) pass through to the **real local instance** at `http://127.0.0.1:54321`.

```
supabase/functions/tests/
├── deno.json              # { "imports": { "assert": "jsr:@std/assert@^1" } }
├── mock_gateways.ts       # interceptFetch/restoreFetch, mockAsaas, mockAbacatePay, pre-built response factories
├── helpers.ts             # getJwt(password grant), createOrder, deleteOrder
├── create_payment_asaas_test.ts
├── create_asaas_pix_test.ts
├── create_abacatepay_pix_test.ts
└── tokenize_card_test.ts
```

### Edge Function refactoring for testability

Every tested Edge Function must:
1. **Export the handler**: `export async function handleRequest(req: Request): Promise<Response> { ... }`
2. **Guard `serve()`**: `if (!Deno.env.get("DENO_TEST")) { serve(handleRequest); }`
3. **Disable auto-refresh**: `createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })`

This prevents `serve()` from starting a real HTTP server on import and stops GoTrue's `setInterval` from leaking across tests.

### Writing a test

```ts
Deno.env.set("DENO_TEST", "1");  // MUST be the first line (before imports)

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { handleRequest } from "../my-function/index.ts";
import { interceptFetch, setupEnv, mockAsaas, asaas } from "./mock_gateways.ts";
import { getJwt, createOrder, deleteOrder } from "./helpers.ts";

setupEnv();      // sets SUPABASE_URL, keys, etc.
interceptFetch(); // monkey-patches globalThis.fetch

async function call(body: Record<string, unknown>): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Authorization": `Bearer ${await getJwt()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

// Test
Deno.test("rejeita sem campo obrigatório", async () => {
  const resp = await call({});
  assertEquals(resp.status, 400);
});
```

### Mock helpers (`mock_gateways.ts`)

- `interceptFetch()` / `restoreFetch()` — wraps `globalThis.fetch`; Asaas/AbacatePay calls return mocked responses, everything else passes through to the real network.
- `mockAsaas(fn)` / `mockAbacatePay(fn)` — set per-test handlers. `fn(url, method, body)` returns `{ status, body } | null`. Return `null` to skip.
- `setupEnv()` — sets all env vars needed by edge functions (`DENO_TEST`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `ASAAS_ENVIRONMENT`, `ABACATEPAY_API_KEY`).
- Pre-built factories: `asaas.tokenizeOk(token)`, `asaas.tokenizeFail(msg)`, `asaas.paymentOk(overrides)`, `asaas.paymentFail(msg)`, `asaas.customerCreate(id)`, `asaas.pixPaymentOk()`, `asaas.pixQrCode()`, `abacatepay.pixOk()`.

### DB helpers (`helpers.ts`)

```ts
export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
export async function getJwt(): Promise<string> { ... }           // password grant as admin@pescaria.com
export async function createOrder(overrides): Promise<string> { ... }  // POST /rest/v1/orders
export async function deleteOrder(id: string): Promise<void> { ... }    // DELETE /rest/v1/orders
```

## Frontend + lib tests (Vitest)

### Component tests (React)

- Use `@testing-library/react` (`render`, `screen`, `fireEvent`, `waitFor`)
- Test files in `__tests__/` adjacent to the component (e.g., `src/components/__tests__/CreditCardForm.test.tsx`)
- Mock Supabase client and toast hooks at the module level via `vi.mock`
- Use `createRef` + `useImperativeHandle` to test component APIs (e.g., `getData()`, `validate()`)

### Pure function tests

- Test files in `__tests__/` adjacent to the module (e.g., `src/lib/__tests__/pricing.test.ts`)
- No mocks needed for pure functions — import and assert directly
- Cover edge cases: zero, negative, fractional cents, rounding, null/undefined inputs

## Conventions

- **One test file per source module** — never create catch-all files like `paymentCorrections.test.ts` that don't correspond to a source file.
- **Test file mirrors source**: `src/components/Foo.tsx` → `src/components/__tests__/Foo.test.tsx`
- **Test the real thing, not an equivalent** — Edge Function tests import the actual handler, not a Node.js re-implementation.
- **Mock external boundaries only** — for Edge Functions: mock Asaas/AbacatePay APIs. For React components: mock Supabase client and toast hooks.
- **Clean up** — always delete test data created in the database (orders, saved_payment_methods) at the end of each test.
- **Test regressions explicitly** — every bug fix must have a test name tagged with the correction date (e.g., `correção 2026-06-11`).
