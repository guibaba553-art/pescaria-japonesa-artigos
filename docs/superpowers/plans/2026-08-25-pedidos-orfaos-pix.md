# Eliminar pedidos órfãos PIX (timeout + limpeza RLS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar pedidos órfãos em `aguardando_pagamento`: timeout no cliente com rollback via edge function (Bug 2), abort real na EF `create-mercadopago-pix`, reconciliação de PIX MP na EF `cancel-checkout-order`, limpeza de abandonados via nova EF `cleanup-abandoned-orders` contornando o RLS (Bug 3) e correção da URL local do cron `cancel-expired-orders`.

**Architecture:** O cliente hoje faz UPDATEs client-side em `orders` que o RLS bloqueia silenciosamente (só admin/employee têm policy de UPDATE) e invoca gateways PIX sem timeout. Trocamos os invokes PIX por um helper `invokeWithTimeout` (Promise.race, 25s), o rollback duplo-falha por `invoke('cancel-checkout-order')` (que passa a reconciliar PIX MP por `payment_id`), a limpeza de abandonados por uma nova EF service-role `cleanup-abandoned-orders`, e recriamos o job do cron lendo a URL base do vault (`functions_base_url`). Qualquer erro reportado ao usuário é mensagem amigável pt-BR; detalhes técnicos vão apenas para `console.error`.

**Tech Stack:** React 18 + TypeScript + Vitest (jsdom) + @testing-library/react | Deno Edge Functions + testes Deno (jsr:@std/assert) com `mock_gateways.ts` | SQL migrations (pg_cron + vault).

**Spec:** `docs/superpowers/specs/2026-08-14-pedidos-orfaos-pix-design.md`

## Global Constraints

- TDD obrigatório (AGENTS.md): teste vermelho primeiro, depois implementação.
- **Qualquer erro reportado ao usuário deve ser mensagem amigável pt-BR e acionável via toast** (ex.: "Não foi possível gerar o PIX. Tente novamente."). Nunca expor detalhes técnicos, nomes de edge functions, erros crus dos gateways ou stack traces no UI — esses vão apenas para `console.error`.
- Nunca editar migrações existentes (`supabase/migrations/*.sql`) nem `src/integrations/supabase/types.ts`.
- Nenhum comentário novo no código de produção (AGENTS.md).
- Supabase client sempre importado de `@/integrations/supabase/client`.
- Em EF tests, `createClient` sempre com `{ auth: { autoRefreshToken: false, persistSession: false } }` (já é o padrão dos arquivos existentes).
- Comandos frontend: `npx vitest run <arquivo>` e `npm run lint`. Comandos EF: `npm run test:functions` (requer `supabase start` rodando; usa `DENO_TEST=1 deno test` internamente).
- Fora de escopo (NÃO mexer): Bug 1 (checar erro do UPDATE no create-mercadopago-pix); reconciliação por `external_reference`; o UPDATE client-side do catch genérico em `CheckoutEntrega.tsx:~842` (falha de estoque/promo — limitação conhecida, follow-up futuro); cron `cleanup-old-chat-messages`.

---

### Task 1: Helper `invokeWithTimeout` (util puro + testes)

**Files:**
- Create: `src/utils/invokeWithTimeout.ts`
- Test: `src/utils/__tests__/invokeWithTimeout.test.ts`

**Interfaces:**
- Consumes: `supabase.functions.invoke` de `@/integrations/supabase/client`.
- Produces (consumido pela Task 2): `invokeWithTimeout<T>(fnName: string, options?: { body?: Record<string, unknown>; timeoutMs?: number }): Promise<{ data: T | null; error: { message: string } | null }>` — mesmo shape de retorno de `supabase.functions.invoke`; em timeout resolve `{ data: null, error: { message: 'timeout' } }`. Default de timeout: 25_000 ms.

- [ ] **Step 1: Escrever o teste (vermelho)**

Criar `src/utils/__tests__/invokeWithTimeout.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { invokeWithTimeout } from '@/utils/invokeWithTimeout';
import { supabase } from '@/integrations/supabase/client';

describe('invokeWithTimeout', () => {
  it('retorna o resultado quando o invoke responde antes do timeout', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: { ok: true }, error: null });

    const r = await invokeWithTimeout('my-fn', { body: { a: 1 }, timeoutMs: 100 });

    expect(r).toEqual({ data: { ok: true }, error: null });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('my-fn', { body: { a: 1 } });
  });

  it('propaga erro do invoke', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: null, error: { message: 'boom' } });

    const r = await invokeWithTimeout('my-fn', { timeoutMs: 100 });

    expect(r.data).toBeNull();
    expect(r.error?.message).toBe('boom');
  });

  it('propaga exception do invoke como erro', async () => {
    (supabase.functions.invoke as any).mockRejectedValue(new Error('network down'));

    const r = await invokeWithTimeout('my-fn', { timeoutMs: 100 });

    expect(r.data).toBeNull();
    expect(r.error?.message).toBe('network down');
  });

  it('resolve erro de timeout quando o invoke demora demais', async () => {
    vi.useFakeTimers();
    (supabase.functions.invoke as any).mockReturnValue(new Promise(() => {}));

    const promise = invokeWithTimeout('my-fn', { timeoutMs: 50 });
    const expectation = expect(promise).resolves.toEqual({
      data: null,
      error: { message: 'timeout' },
    });
    await vi.advanceTimersByTimeAsync(60);
    await expectation;

    vi.useRealTimers();
  });

  it('usa o timeout padrão quando não informado', async () => {
    vi.useFakeTimers();
    (supabase.functions.invoke as any).mockReturnValue(new Promise(() => {}));

    const promise = invokeWithTimeout('my-fn');
    const expectation = expect(promise).resolves.toEqual({
      data: null,
      error: { message: 'timeout' },
    });
    await vi.advanceTimersByTimeAsync(25_001);
    await expectation;

    vi.useRealTimers();
  });

  it('invoca sem body quando options não é passado', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: null, error: null });

    await invokeWithTimeout('my-fn', { timeoutMs: 100 });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('my-fn', { body: undefined });
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha (vermelho)**

Run: `npx vitest run src/utils/__tests__/invokeWithTimeout.test.ts`
Expected: FAIL — módulo `@/utils/invokeWithTimeout` não existe.

- [ ] **Step 3: Implementar o helper**

Criar `src/utils/invokeWithTimeout.ts`:

```ts
import { supabase } from '@/integrations/supabase/client';

export const PIX_GATEWAY_TIMEOUT_MS = 25_000;

export interface InvokeResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function invokeWithTimeout<T = any>(
  fnName: string,
  options?: { body?: Record<string, unknown>; timeoutMs?: number },
): Promise<InvokeResult<T>> {
  const timeoutMs = options?.timeoutMs ?? PIX_GATEWAY_TIMEOUT_MS;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<InvokeResult<T>>((resolve) => {
    timer = setTimeout(
      () => resolve({ data: null, error: { message: 'timeout' } }),
      timeoutMs,
    );
  });

  try {
    const result = await Promise.race([
      supabase.functions.invoke<T>(fnName, { body: options?.body }),
      timeoutPromise,
    ]);
    return result;
  } catch (err: any) {
    return { data: null, error: { message: err?.message || String(err) } };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Rodar o teste e verificar que passa (verde)**

Run: `npx vitest run src/utils/__tests__/invokeWithTimeout.test.ts`
Expected: 6 testes PASSAM.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/utils/invokeWithTimeout.ts src/utils/__tests__/invokeWithTimeout.test.ts
git commit -m "feat: helper invokeWithTimeout para invokes de gateway com timeout"
```

---

### Task 2: CheckoutEntrega — timeout nos invokes PIX + rollback via EF + mensagem amigável

**Files:**
- Modify: `src/pages/CheckoutEntrega.tsx:633-700` (bloco PIX dentro de `handleFinalizeOrder`)
- Modify: `src/pages/CheckoutEntrega.tsx` (imports, topo do arquivo)
- Test: `src/pages/__tests__/CheckoutEntrega.test.tsx`

**Interfaces:**
- Consumes: `invokeWithTimeout` (Task 1), EF existente `cancel-checkout-order` (payload `{ orderId }`; a reconciliação MP vem na Task 4 e não muda o contrato).
- Produces: comportamento — primário com timeout/falha → fallback; ambos falham → `invoke('cancel-checkout-order', { body: { orderId } })` e `toast.error('Não foi possível gerar o PIX. Tente novamente.')`.

- [ ] **Step 1: Preparar mocks no arquivo de teste**

Em `src/pages/__tests__/CheckoutEntrega.test.tsx`, adicionar APÓS o bloco `vi.mock('@/hooks/use-toast', ...)` (linha ~25):

```tsx
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
```

E adicionar após o mock do `CreditCardForm` (linha ~120), envolvendo o util real com timeout curto (evita fake timers nos testes):

```tsx
vi.mock('@/utils/invokeWithTimeout', async () => {
  const actual = await vi.importActual<typeof import('@/utils/invokeWithTimeout')>(
    '@/utils/invokeWithTimeout',
  );
  return {
    ...actual,
    invokeWithTimeout: (
      fnName: string,
      options?: { body?: Record<string, unknown>; timeoutMs?: number },
    ) => actual.invokeWithTimeout(fnName, { ...options, timeoutMs: 30 }),
  };
});
```

No topo, junto dos demais imports (linha ~140), adicionar:

```tsx
import { toast } from 'sonner';
```

1a. Adicionar a variável de captura no escopo do módulo, junto das demais declarações (após `let capturedOrdersInsert ... = null;`, linha ~49):

```tsx
let capturedOrdersUpdates: { table: string; payload: Record<string, unknown> }[] = [];
```

1b. Dentro do `beforeEach`, capturar UPDATEs em `orders` (para provar que NÃO há rollback client-side). Substituir o bloco `mockChain.insert = ...` até `capturedOrdersInsert = null;` (linhas ~174-179) por:

```tsx
  mockChain.insert = vi.fn().mockImplementation((payload: any) => {
    if (currentFromTable === 'orders') capturedOrdersInsert = payload;
    return mockChain;
  });
  mockChain.update = vi.fn().mockImplementation((payload: any) => {
    capturedOrdersUpdates.push({ table: currentFromTable, payload });
    return mockChain;
  });
  capturedOrdersUpdates = [];
  mockChain.single = vi.fn().mockResolvedValue({ data: { id: 'order-1' }, error: null });
  capturedOrdersInsert = null;
  mockCartTotal = 100;
```

- [ ] **Step 2: Adicionar os testes novos no fim do arquivo**

```tsx
describe('CheckoutEntrega — timeout e rollback PIX via edge function', () => {
  const invokeCalls = () =>
    (supabase.functions.invoke as any).mock.calls.map((c: any[]) => c[0]);

  it('timeout no gateway primário → chama o gateway alternativo (fallback)', async () => {
    (supabase.functions.invoke as any).mockImplementation(async (fnName: string) => {
      if (fnName === 'create-mercadopago-pix') {
        return new Promise(() => {});
      }
      return {
        data: { success: true, data: { brCode: '000201...', brCodeBase64: 'iVBOR...', expiresAt: new Date().toISOString() } },
        error: null,
      };
    });

    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(screen.getByTestId('pix-dialog')).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(invokeCalls()).toContain('create-mercadopago-pix');
    expect(invokeCalls()).toContain('create-asaas-pix');
  });

  it('ambos os gateways falham → rollback via cancel-checkout-order, sem UPDATE client-side, toast amigável', async () => {
    (supabase.functions.invoke as any).mockImplementation(async (fnName: string) => {
      if (fnName === 'create-mercadopago-pix' || fnName === 'create-asaas-pix') {
        return { data: { success: false, error: 'rejected_internal_9981' }, error: null };
      }
      if (fnName === 'cancel-checkout-order') {
        return { data: { success: true, cancelled: true }, error: null };
      }
      return { data: null, error: null };
    });

    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(invokeCalls()).toContain('cancel-checkout-order');
    });

    const cancelCall = (supabase.functions.invoke as any).mock.calls.find(
      (c: any[]) => c[0] === 'cancel-checkout-order',
    );
    expect(cancelCall[1].body).toMatchObject({ orderId: 'order-1' });

    const updates = capturedOrdersUpdates;
    expect(updates.filter((u) => u.table === 'orders')).toHaveLength(0);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Não foi possível gerar o PIX. Tente novamente.');
    });
  });

  it('rollback best-effort: falha do cancel-checkout-order não impede o toast amigável', async () => {
    (supabase.functions.invoke as any).mockImplementation(async (fnName: string) => {
      if (fnName === 'create-mercadopago-pix' || fnName === 'create-asaas-pix') {
        return { data: null, error: { message: 'unavailable' } };
      }
      if (fnName === 'cancel-checkout-order') {
        throw new Error('ef down');
      }
      return { data: null, error: null };
    });

    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Não foi possível gerar o PIX. Tente novamente.');
    });
  });
});
```

- [ ] **Step 3: Rodar os testes e verificar que falham (vermelho)**

Run: `npx vitest run src/pages/__tests__/CheckoutEntrega.test.tsx`
Expected: os 3 testes novos FALHAM (hoje não há timeout nem invoke de `cancel-checkout-order`); os demais PASSAM.

- [ ] **Step 4: Implementar no componente**

Em `src/pages/CheckoutEntrega.tsx`:

4a. Adicionar ao lado dos demais imports de utils (próximo a linha 20, onde ficam os imports de `@/lib/pixGatewayRouter` etc.):

```tsx
import { invokeWithTimeout } from '@/utils/invokeWithTimeout';
```

4b. Substituir o bloco inteiro das linhas 648-662 (try/catch do invoke primário) por:

```tsx
        try {
          const { data: pixData, error: pixError } = await invokeWithTimeout(fnName, {
            body: { orderId: createdOrderId },
          });

          if (!pixError && pixData?.success && pixData?.data) {
            pixSuccess = true;
            pixResult = pixData.data;
          } else {
            console.error(`[PIX] ${primaryGateway} falhou:`, pixError || pixData?.error);
          }
        } catch (primaryErr) {
          console.error(`[PIX] ${primaryGateway} exception:`, primaryErr);
        }
```

4c. Substituir o bloco das linhas 671-699 (try/catch do fallback com rollback client-side) por:

```tsx
          try {
            const { data: fallbackData, error: fallbackError } = await invokeWithTimeout(fallbackFn, {
              body: { orderId: createdOrderId },
            });

            if (fallbackError || !fallbackData?.success || !fallbackData?.data) {
              throw new Error(fallbackError?.message || 'PIX temporariamente indisponível');
            }

            pixSuccess = true;
            pixResult = fallbackData.data;
            usedGateway = fallbackGateway;
          } catch (fallbackErr: any) {
            console.error('[PIX] ambos os gateways falharam:', fallbackErr);

            try {
              await supabase.functions.invoke('cancel-checkout-order', {
                body: { orderId: createdOrderId },
              });
            } catch (rollbackErr) {
              console.error('[PIX] rollback cancel-checkout-order falhou:', rollbackErr);
            }

            throw new Error('Não foi possível gerar o PIX. Tente novamente.');
          }
```

Nota: o `throw new Error(...)` amigável é capturado pelo catch genérico (linha ~839) que já faz `toast.error(err?.message)` — a mensagem exibida será a amigável. Detalhes técnicos (mensagens cruas dos gateways) ficam no `console.error` acima.

- [ ] **Step 5: Rodar os testes e verificar que passam (verde)**

Run: `npx vitest run src/pages/__tests__/CheckoutEntrega.test.tsx`
Expected: TODOS os testes do arquivo PASSAM (incluindo os de gateway routing e gravação de forma de pagamento já existentes).

- [ ] **Step 6: Suíte completa + lint**

Run: `npm test`
Expected: todos os testes passam.

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/pages/CheckoutEntrega.tsx src/pages/__tests__/CheckoutEntrega.test.tsx
git commit -m "feat: timeout nos invokes PIX e rollback via cancel-checkout-order"
```

---

### Task 3: EF `create-mercadopago-pix` — abort real (504) após timeout

**Files:**
- Modify: `supabase/functions/create-mercadopago-pix/index.ts:11-19,333-350`
- Modify: `supabase/functions/tests/mock_gateways.ts` (suporte a `Response` direto no mock, necessário para simular gateway pendurado)
- Test: `supabase/functions/tests/create_mercadopago_pix_test.ts`

**Interfaces:**
- Produces: resposta HTTP 504 com `{ success: false, error: "..." }` quando o processamento total exceder o timeout. Timeout configurável via env `MP_PIX_TIMEOUT_MS` (default 30000) — leitura **por request**, não no load do módulo, para permitir override em teste.
- Requer: `supabase start` rodando (testes Deno usam Supabase local real).

- [ ] **Step 1: Estender mock_gateways para aceitar Response direto (necessário para o teste pendurado)**

Em `supabase/functions/tests/mock_gateways.ts`, alterar o tipo e os branches de intercepção:

Linha 10, trocar:

```ts
type MockFn = (url: string, method: string, body: unknown) => { status: number; body: unknown } | null;
```

por:

```ts
type MockFn = (url: string, method: string, body: unknown) => { status: number; body: unknown } | Response | null;
```

Dentro de `interceptFetch`, nos branches de Asaas e Mercado Pago, tratar `Response` antes do shape `{status, body}`. Branch Asaas (linha ~31):

```ts
    if (url.includes("api-sandbox.asaas.com") || url.includes("api.asaas.com")) {
      const r = _asaasMock?.(url, method, body);
      if (r instanceof Response) return r;
      if (r) return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Asaas mock not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
```

Branch MP (linha ~36), mesmo padrão:

```ts
    if (url.includes("api.mercadopago.com")) {
      const r = _mpMock?.(url, method, body);
      if (r instanceof Response) return r;
      if (r) return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Mercado Pago mock not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
```

- [ ] **Step 2: Adicionar o teste (vermelho)**

Em `supabase/functions/tests/create_mercadopago_pix_test.ts`, adicionar no fim do arquivo:

```ts
Deno.test("MP pendurado além do timeout → 504 com sucesso=false", async () => {
  Deno.env.set("MP_PIX_TIMEOUT_MS", "80");
  const oid = await createOrder();

  mockMercadopago(() => new Promise<Response>(() => {}) as unknown as Response);

  const r = await call({ orderId: oid });

  mockMercadopago(null);
  await deleteOrder(oid);
  Deno.env.delete("MP_PIX_TIMEOUT_MS");

  assertEquals(r.status, 504, "timeout deve responder 504");
  const body = await r.json();
  assertEquals(body.success, false);
  assertStringIncludes(body.error, "PIX");
});
```

- [ ] **Step 3: Rodar o teste e verificar que falha (vermelho)**

Run: `npm run test:functions`
Expected: o teste novo FALHA — hoje a função responde 200 (o setTimeout atual apenas loga e o mock pendurado nunca chega a ser abortado; a requisição fica presa ou o teste estoura timeout de forma diferente de 504). Os demais testes do arquivo PASSAM.

- [ ] **Step 4: Implementar abort real**

Em `supabase/functions/create-mercadopago-pix/index.ts`:

4a. Renomear a função atual `handleRequest` para `processPixRequest` (mesmo corpo, exceto: remover a checagem de `OPTIONS` das linhas 12-14, remover o `setTimeout` que só loga das linhas 16-19, remover o bloco `catch`/`finally` externos das linhas 333-349 — o corpo entre eles permanece igual).

4b. Criar a nova `handleRequest` exportada abaixo de `processPixRequest`:

```ts
export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timeoutMs = Number(Deno.env.get("MP_PIX_TIMEOUT_MS") ?? 30_000);

  let timerId: ReturnType<typeof setTimeout> | undefined;
  const processing = processPixRequest(req).catch((error) => {
    console.error("[create-mercadopago-pix] Erro inesperado:", error);
    const msg = error instanceof Error
      ? (error.name === "AbortError"
        ? "O Mercado Pago demorou para responder. Tente novamente."
        : error.message)
      : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  });

  const timeoutResponse = new Promise<Response>((resolve) => {
    timerId = setTimeout(() => {
      console.error(`[create-mercadopago-pix] Function timed out after ${timeoutMs}ms`);
      resolve(
        new Response(
          JSON.stringify({
            success: false,
            error: "Tempo esgotado ao gerar o PIX. Tente novamente.",
          }),
          {
            status: 504,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([processing, timeoutResponse]);
  } finally {
    clearTimeout(timerId);
  }
}
```

- [ ] **Step 5: Rodar os testes e verificar que passam (verde)**

Run: `npm run test:functions`
Expected: TODOS os testes de `create_mercadopago_pix_test.ts` PASSAM, incluindo o novo de 504.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/create-mercadopago-pix/index.ts supabase/functions/tests/create_mercadopago_pix_test.ts supabase/functions/tests/mock_gateways.ts
git commit -m "feat: create-mercadopago-pix responde 504 real após timeout"
```

---

### Task 4: EF `cancel-checkout-order` — reconciliação MP por payment_id

**Files:**
- Modify: `supabase/functions/cancel-checkout-order/index.ts:44-69`
- Test: `supabase/functions/tests/cancel_checkout_order_test.ts`

**Interfaces:**
- Consumes: env `MERCADO_PAGO_ACCESS_TOKEN`; API `POST https://api.mercadopago.com/v1/payments/{payment_id}/cancellations`; colunas `orders.payment_id` e `orders.payment_gateway` (gravadas desde o plano anterior).
- Produces: contrato inalterado (`{ success: true, cancelled: true }`) — reconciliação é transparente e NUNCA bloqueia o cancelamento.

- [ ] **Step 1: Adicionar os testes (vermelho)**

Em `supabase/functions/tests/cancel_checkout_order_test.ts`:

1a. Na linha 8, incluir os mocks de gateway no import:

```ts
import { interceptFetch, setupEnv, mockInternalFn, mockMercadopago } from "./mock_gateways.ts";
```

1b. Logo após `setupEnv(); interceptFetch();` (linha ~12), adicionar:

```ts
Deno.env.set("MERCADO_PAGO_ACCESS_TOKEN", "TEST-mock-token");
```

1c. Adicionar os 3 testes no fim do arquivo:

```ts
Deno.test("pedido com payment_id mercadopago → chama cancellations no MP antes de cancelar", async () => {
  const oid = await createOrder({
    status: "aguardando_pagamento",
    payment_id: "9876543210",
    payment_gateway: "mercadopago",
  });
  const jwt = await getJwt();

  const mpCalls: { url: string; method: string }[] = [];
  mockMercadopago((url, method) => {
    mpCalls.push({ url, method });
    if (url.includes("/cancellations")) {
      return { status: 200, body: { id: 9876543210, status: "cancelled" } };
    }
    return null;
  });

  mockInternalFn((url) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null;
  });

  const r = await call({ orderId: oid }, jwt);

  mockMercadopago(null);
  mockInternalFn(null);

  assertEquals(r.status, 200);
  assertEquals((await r.json()).success, true);
  assertEquals(
    mpCalls.some((c) => c.url.includes("/v1/payments/9876543210/cancellations") && c.method === "POST"),
    true,
    "deve chamar POST /v1/payments/{id}/cancellations",
  );

  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}&select=status`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` },
  });
  const [updatedOrder] = await checkResp.json();
  assertEquals(updatedOrder.status, "cancelado");

  await deleteOrder(oid);
});

Deno.test("pedido sem payment_id → não chama o MP", async () => {
  const oid = await createOrder({ status: "aguardando_pagamento" });
  const jwt = await getJwt();

  const mpCalls: { url: string }[] = [];
  mockMercadopago((url) => {
    mpCalls.push({ url });
    return null;
  });

  mockInternalFn((url) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null;
  });

  const r = await call({ orderId: oid }, jwt);

  mockMercadopago(null);
  mockInternalFn(null);

  assertEquals(r.status, 200);
  assertEquals((await r.json()).success, true);
  assertEquals(mpCalls.length, 0, "não deve chamar o MP sem payment_id");

  await deleteOrder(oid);
});

Deno.test("falha do MP não bloqueia o cancelamento do pedido", async () => {
  const oid = await createOrder({
    status: "aguardando_pagamento",
    payment_id: "9876543211",
    payment_gateway: "mercadopago",
  });
  const jwt = await getJwt();

  mockMercadopago(() => ({ status: 400, body: { message: "cannot cancel" } }));

  mockInternalFn((url) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null;
  });

  const r = await call({ orderId: oid }, jwt);

  mockMercadopago(null);
  mockInternalFn(null);

  assertEquals(r.status, 200);
  assertEquals((await r.json()).success, true, "cancelamento deve prosseguir mesmo com MP falhando");

  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}&select=status`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` },
  });
  const [updatedOrder] = await checkResp.json();
  assertEquals(updatedOrder.status, "cancelado");

  await deleteOrder(oid);
});
```

- [ ] **Step 2: Rodar os testes e verificar que falham (vermelho)**

Run: `npm run test:functions`
Expected: os 3 testes novos FALHAM (primeiro: nenhuma chamada ao MP; terceiro: hoje não há chamada ao MP mas o teste valida o fluxo completo — se passar antes da implementação, confirmar que o motivo é ausência de chamada, e o primeiro teste ainda garante o vermelho); os 4 existentes PASSAM.

- [ ] **Step 3: Implementar a reconciliação**

Em `supabase/functions/cancel-checkout-order/index.ts`:

3a. Linha 46, incluir colunas no select:

```ts
      .select('id, user_id, status, payment_id, payment_gateway')
```

3b. Após a checagem de status (bloco que termina na linha 69) e ANTES do comentário "// Liberar reservas de estoque" (linha 71), inserir:

```ts
    if (order.payment_id && order.payment_gateway === 'mercadopago') {
      try {
        const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
        if (!accessToken) {
          console.warn('[cancel-checkout-order] MERCADO_PAGO_ACCESS_TOKEN ausente — PIX não reconciliado');
        } else {
          const mpResp = await fetch(
            `https://api.mercadopago.com/v1/payments/${order.payment_id}/cancellations`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            },
          );
          console.log(
            `[cancel-checkout-order] MP cancellation ${order.payment_id}: HTTP ${mpResp.status}`,
          );
        }
      } catch (mpErr) {
        console.error('[cancel-checkout-order] Falha ao cancelar PIX no MP:', mpErr);
      }
    }
```

- [ ] **Step 4: Rodar os testes e verificar que passam (verde)**

Run: `npm run test:functions`
Expected: TODOS os testes de `cancel_checkout_order_test.ts` PASSAM (7 no total).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/cancel-checkout-order/index.ts supabase/functions/tests/cancel_checkout_order_test.ts
git commit -m "feat: cancel-checkout-order reconcilia PIX pendente no Mercado Pago"
```

---

### Task 5: Nova EF `cleanup-abandoned-orders` (service-role + JWT)

**Files:**
- Create: `supabase/functions/cleanup-abandoned-orders/index.ts`
- Test: `supabase/functions/tests/cleanup_abandoned_orders_test.ts`

**Interfaces:**
- Consumes: RPCs `release_stock_reservation({ p_order_id })` e `release_promo_limits({ p_items })`; tabela `order_items`; JWT do usuário via header Authorization.
- Produces (consumido pela Task 6): `POST /functions/v1/cleanup-abandoned-orders` com `{}` no body → `{ success: true, cancelled: string[], failed: { orderId: string; error: string }[] }`. Critérios: (a) abandonados — `status='aguardando_pagamento'`, `payment_id IS NULL`, `asaas_payment_id IS NULL`, `created_at < now()-5min`; (b) zumbis Asaas — `status='aguardando_pagamento'`, `asaas_payment_id NOT NULL`, `created_at < now()-2h`. Sempre filtrado por `user_id` do JWT.
- Requer: `supabase start` rodando.

- [ ] **Step 1: Escrever o teste (vermelho)**

Criar `supabase/functions/tests/cleanup_abandoned_orders_test.ts`:

```ts
// Tests for cleanup-abandoned-orders
//
// Cancela pedidos abandonados (>5min sem pagamento) e zumbis Asaas (>2h),
// liberando reserva de estoque e limites de promoção. Usa Supabase local real.

import { assertEquals } from "jsr:@std/assert@^1";
import { handleRequest } from "../cleanup-abandoned-orders/index.ts";
import { interceptFetch, setupEnv, mockInternalFn } from "./mock_gateways.ts";
import { createOrder, deleteOrder, getJwt, SUPABASE_URL, ANON_KEY, SERVICE_KEY } from "./helpers.ts";

setupEnv();
interceptFetch();

async function call(token?: string): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token ?? "no-token"}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  }));
}

async function backdateOrder(id: string, minutesAgo: number) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString() }),
  });
  if (!resp.ok) throw new Error(`backdateOrder failed: ${resp.status}`);
}

function mockRpcsOk() {
  mockInternalFn((url) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    return null;
  });
}

async function getOrderStatus(id: string, token: string): Promise<string> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}&select=status,cancellation_reason`, {
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${token}` },
  });
  const [row] = await resp.json();
  return row?.status ?? "";
}

Deno.test("sem autenticação → 401", async () => {
  const r = await call();
  assertEquals(r.status, 401);
});

Deno.test("cancela abandonado (>5min, sem payment_id/asaas_payment_id) e libera reservas", async () => {
  const oid = await createOrder({ delivery_type: "pickup" });
  await backdateOrder(oid, 10);
  const jwt = await getJwt();

  mockRpcsOk();
  const r = await call(jwt);
  const body = await r.json();

  assertEquals(r.status, 200);
  assertEquals(body.success, true);
  assertEquals(body.cancelled, [oid]);
  assertEquals(body.failed, []);
  assertEquals(await getOrderStatus(oid, jwt), "cancelado");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("cancela zumbi asaas (>2h com asaas_payment_id)", async () => {
  const oid = await createOrder({ asaas_payment_id: "pay_zombie_001" });
  await backdateOrder(oid, 130);
  const jwt = await getJwt();

  mockRpcsOk();
  const r = await call(jwt);
  const body = await r.json();

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, [oid]);
  assertEquals(await getOrderStatus(oid, jwt), "cancelado");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("NÃO cancela pedido recente (<5min) sem pagamento", async () => {
  const oid = await createOrder();
  const jwt = await getJwt();

  mockRpcsOk();
  const r = await call(jwt);
  const body = await r.json();

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, []);
  assertEquals(await getOrderStatus(oid, jwt), "aguardando_pagamento");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("NÃO cancela pedido com payment_id recente (<2h)", async () => {
  const oid = await createOrder({ payment_id: "pay_recent_001" });
  await backdateOrder(oid, 10);
  const jwt = await getJwt();

  mockRpcsOk();
  const r = await call(jwt);
  const body = await r.json();

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, []);
  assertEquals(await getOrderStatus(oid, jwt), "aguardando_pagamento");

  await deleteOrder(oid);
  mockInternalFn(null);
});

Deno.test("retorna failed quando o UPDATE falha", async () => {
  const oid = await createOrder();
  await backdateOrder(oid, 10);
  const jwt = await getJwt();

  mockInternalFn((url) => {
    if (url.includes("/rest/v1/rpc/release_stock_reservation")) {
      return { status: 500, body: { error: "rpc down" } };
    }
    if (url.includes("/rest/v1/rpc/release_promo_limits")) {
      return { status: 200, body: true };
    }
    if (url.includes("/rest/v1/orders") && !url.includes("order_items")) {
      return { status: 400, body: { message: "update blocked" } };
    }
    return null;
  });

  const r = await call(jwt);
  const body = await r.json();

  mockInternalFn(null);

  assertEquals(r.status, 200);
  assertEquals(body.cancelled, []);
  assertEquals(body.failed.length >= 1, true);
  assertEquals(body.failed[0].orderId, oid);
  assertEquals(typeof body.failed[0].error, "string");

  await deleteOrder(oid);
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha (vermelho)**

Run: `npm run test:functions`
Expected: FAIL — módulo `../cleanup-abandoned-orders/index.ts` não existe.

- [ ] **Step 3: Implementar a edge function**

Criar `supabase/functions/cleanup-abandoned-orders/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupTarget {
  id: string;
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: abandoned } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'aguardando_pagamento')
      .is('payment_id', null)
      .is('asaas_payment_id', null)
      .lt('created_at', fiveMinutesAgo);

    const { data: zombies } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'aguardando_pagamento')
      .not('asaas_payment_id', 'is', null)
      .lt('created_at', twoHoursAgo);

    const targets: CleanupTarget[] = [
      ...((abandoned ?? []) as CleanupTarget[]),
      ...((zombies ?? []).filter((z) => !(abandoned ?? []).some((a) => a.id === z.id)) as CleanupTarget[]),
    ];

    const cancelled: string[] = [];
    const failed: { orderId: string; error: string }[] = [];

    for (const target of targets) {
      try {
        await supabase.rpc('release_stock_reservation', { p_order_id: target.id });

        const { data: items } = await supabase
          .from('order_items')
          .select('product_id, variation_id, quantity')
          .eq('order_id', target.id);
        if (items && items.length > 0) {
          await supabase.rpc('release_promo_limits', {
            p_items: items.map((i: any) => ({
              product_id: i.product_id,
              variation_id: i.variation_id,
              quantity: i.quantity,
            })),
          });
        }

        const { error: updateErr } = await supabase
          .from('orders')
          .update({ status: 'cancelado', cancellation_reason: 'cancelado_pelo_cliente' })
          .eq('id', target.id);

        if (updateErr) {
          failed.push({ orderId: target.id, error: updateErr.message });
        } else {
          cancelled.push(target.id);
        }
      } catch (targetErr) {
        failed.push({ orderId: target.id, error: String(targetErr) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, cancelled, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('cleanup-abandoned-orders error', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

if (!Deno.env.get("DENO_TEST")) {
  serve((req) => handleRequest(req));
}
```

- [ ] **Step 4: Rodar os testes e verificar que passam (verde)**

Run: `npm run test:functions`
Expected: TODOS os testes de `cleanup_abandoned_orders_test.ts` PASSAM (6 no total).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/cleanup-abandoned-orders/index.ts supabase/functions/tests/cleanup_abandoned_orders_test.ts
git commit -m "feat: nova edge function cleanup-abandoned-orders (service-role + JWT)"
```

---

### Task 6: CheckoutEntrega — limpeza de abandonados via EF

**Files:**
- Modify: `src/pages/CheckoutEntrega.tsx:496-543` (bloco "Limpar pedidos abandonados anteriores")
- Test: `src/pages/__tests__/CheckoutEntrega.test.tsx`

**Interfaces:**
- Consumes: EF `cleanup-abandoned-orders` (Task 5), payload `{}`.
- Produces: comportamento — ao finalizar, `supabase.functions.invoke('cleanup-abandoned-orders', {})` substitui as queries/UPDATEs client-side. Falha da limpeza não bloqueia o checkout (log em `console.error`).

- [ ] **Step 1: Adicionar o teste (vermelho)**

Em `src/pages/__tests__/CheckoutEntrega.test.tsx`, adicionar no fim do arquivo:

```tsx
describe('CheckoutEntrega — limpeza de abandonados via edge function', () => {
  it('invoca cleanup-abandoned-orders e não faz UPDATE client-side em orders', async () => {
    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(screen.getByTestId('pix-dialog')).toBeInTheDocument();
    });

    const calledFns = (supabase.functions.invoke as any).mock.calls.map((c: any[]) => c[0]);
    expect(calledFns).toContain('cleanup-abandoned-orders');

    const updates = capturedOrdersUpdates;
    expect(updates.filter((u) => u.table === 'orders')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha (vermelho)**

Run: `npx vitest run src/pages/__tests__/CheckoutEntrega.test.tsx`
Expected: o teste novo FALHA (`cleanup-abandoned-orders` ainda não é invocado); os demais PASSAM.

- [ ] **Step 3: Implementar a troca**

Em `src/pages/CheckoutEntrega.tsx`, substituir TODO o bloco das linhas 496-543 (do comentário "// 2. Limpar pedidos abandonados anteriores" até o fechamento do segundo UPDATE de zumbis) por:

```tsx
      // 2. Limpar pedidos abandonados anteriores
      try {
        await supabase.functions.invoke('cleanup-abandoned-orders', {});
      } catch (cleanupErr) {
        console.error('[checkout] limpeza de abandonados falhou:', cleanupErr);
      }
```

- [ ] **Step 4: Rodar os testes e verificar que passam (verde)**

Run: `npx vitest run src/pages/__tests__/CheckoutEntrega.test.tsx`
Expected: TODOS os testes do arquivo PASSAM.

- [ ] **Step 5: Suíte completa + lint**

Run: `npm test && npm run lint`
Expected: todos os testes passam, sem erros de lint.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CheckoutEntrega.tsx src/pages/__tests__/CheckoutEntrega.test.tsx
git commit -m "feat: limpeza de pedidos abandonados via cleanup-abandoned-orders"
```

---

### Task 7: Migração — corrigir cron `cancel-expired-orders` (URL via vault)

**Files:**
- Create: `supabase/migrations/20260825000000_fix_cancel_expired_orders_cron_url.sql`

**Interfaces:**
- Consumes: extensões `pg_cron`/`pg_net` (existentes), schema `vault`, secret `cron_secret` (seed em `20260508122106`), EF `cancel-expired-orders` (autentica via header `x-cron-secret`).
- Produces: job cron `cancel-expired-orders-every-5-min` apontando para `<functions_base_url>/functions/v1/cancel-expired-orders`, onde `functions_base_url` vem do vault com fallback `http://127.0.0.1:54321` (local).

- [ ] **Step 1: Criar a migração**

Criar `supabase/migrations/20260825000000_fix_cancel_expired_orders_cron_url.sql`:

```sql
-- Corrige a URL do cron cancel-expired-orders: a migração 20260628000000 gravou
-- http://127.0.0.1:54321 (URL local), portanto o job nunca executa em produção.
-- Passa a ler functions_base_url do vault (seed idempotente abaixo).

DO $migration$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cancel-expired-orders-every-5-min');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.unschedule skipped: %', SQLERRM;
  END;
END $migration$;

DO $$
DECLARE v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'functions_base_url';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      coalesce(current_setting('app.functions_base_url', true), 'http://127.0.0.1:54321'),
      'functions_base_url',
      'URL base do projeto usada por jobs pg_cron para chamar edge functions'
    );
  END IF;
END$$;

DO $migration$
BEGIN
  BEGIN
    PERFORM cron.schedule(
      'cancel-expired-orders-every-5-min',
      '*/5 * * * *',
      $cronjob$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_base_url' LIMIT 1) || '/functions/v1/cancel-expired-orders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
        ),
        body := '{}'::jsonb
      );
      $cronjob$
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.schedule skipped: %', SQLERRM;
  END;
END $migration$;
```

- [ ] **Step 2: Validar aplicação da migração no Supabase local**

Run: `supabase db reset`
Expected: todas as migrações aplicam sem erro (valida sintaxe SQL). Se Docker/Supabase não estiver disponível, reportar e seguir — a validação completa acontece em staging.

- [ ] **Step 3: Verificar o job criado (se supabase rodando)**

Run: `supabase db --help >/dev/null 2>&1 && echo "SELECT jobname, schedule FROM cron.job;" | supabase db psql 2>/dev/null | grep cancel-expired`
Expected: linha com `cancel-expired-orders-every-5-min | */5 * * * *`. Se o comando psql não estiver disponível, validar via SQL Editor.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260825000000_fix_cancel_expired_orders_cron_url.sql
git commit -m "fix: cron cancel-expired-orders usa functions_base_url do vault"
```

> **AÇÃO MANUAL ÚNICA EM PRODUÇÃO** (pós-deploy, SQL Editor do dashboard Supabase): atualizar o valor do secret `functions_base_url` para `https://qiwcngzbpxddowyqaulm.supabase.co`. Sem isso o job continuará apontando para a URL local. Follow-up fora de escopo: `cleanup-old-chat-messages` tem o mesmo problema de URL local.

---

### Task 8: Verificação final completa

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Suíte frontend completa**

Run: `npm test`
Expected: todos os testes passam (baseline era 469 + novos).

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: build conclui sem erros.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 4: Suíte de edge functions (requer `supabase start`)**

Run: `npm run test:functions`
Expected: todos os testes Deno passam, incluindo os novos/arquivados modificados nas Tasks 3-5.

- [ ] **Step 5: Reportar resultado**

Se tudo verde: comunicar conclusão e seguir com superpowers:finishing-a-development-branch. Se algo falhar: parar e investigar (superpowers:systematic-debugging) — não prosseguir com suíte vermelha.

---

## Self-Review

- **Spec coverage:**
  - "Cliente — timeout e rollback via EF (Bug 2)" → Tasks 1 e 2 (invokeWithTimeout 25s nos dois invokes, rollback via `cancel-checkout-order`, toast amigável).
  - "EF create-mercadopago-pix — abort real" → Task 3 (race com 504, timeout configurável).
  - "EF cancel-checkout-order — reconciliação MP" → Task 4 (cancellations por payment_id, falha não bloqueia).
  - "Nova EF cleanup-abandoned-orders (Bug 3)" → Tasks 5 e 6 (critérios 5min/2h idênticos, RPCs de liberação, retorno `{cancelled, failed}`, swap no frontend).
  - "Migração — corrigir cron" → Task 7 (unschedule idempotente, seed vault, schedule com URL do vault, ação manual documentada).
  - "Requisito transversal — mensagens amigáveis" → Task 2 (throw amigável + console.error técnico) e Task 3 (erro 504 com mensagem amigável). Coberto.
  - Casos extremos da spec (corrida timeout×EF aceita; limpeza não toca pedidos pagos) → cobertos pelos critérios da Task 5 e testes "NÃO cancela".
- **Placeholder scan:** nenhum TBD/TODO; todos os steps têm código completo.
- **Type consistency:** `invokeWithTimeout` retorna `{ data, error: { message } | null }` — usado igualmente nas Tasks 1, 2 e no mock da Task 2 (`actual.invokeWithTimeout(args[0], {...})` assinatura compatível). Payload da EF nova (`{ cancelled: string[], failed: {orderId,error}[] }`) bate entre Task 5 (produção) e Task 6 (consumo). Nome de job cron `'cancel-expired-orders-every-5-min'` idêntico ao de `20260628000000` (unschedule/remove corretamente). Secret `'functions_base_url'` consistente entre seed e schedule da Task 7.
