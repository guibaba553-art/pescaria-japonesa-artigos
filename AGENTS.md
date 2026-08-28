# AGENTS.md — JAPAS Pesca (Pescaria Japonesa Artigos)

E-commerce de equipamentos de pesca. Stack: React 18 + TypeScript 5 + Vite (SWC) + shadcn/ui + Tailwind CSS 3 + Supabase.

## Quick reference

| Need | Use |
|------|-----|
| Full architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) |

## Commands

```
npm run dev             # Vite dev server (port 8080)
npm run build           # production build
npm run lint            # ESLint (flat config)
npm test                # vitest run
npm run test:watch      # vitest watch
npm run test:functions  # Deno test for Edge Functions (requires supabase start)
```

Single test file: `npx vitest run src/lib/__tests__/pricing.test.ts`

## Entry point & component tree

`src/main.tsx` → `src/App.tsx`:

```
<QueryClientProvider>
  <TooltipProvider>
    <BrowserRouter>
      <AuthProvider>              ← src/hooks/useAuth.tsx
        <CartProvider>            ← src/hooks/useCart.tsx
          <Routes>                ← lazy-loaded via React.lazy
          <MobileBottomNav />
          <CookieBanner />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </TooltipProvider>
</QueryClientProvider>
```

## Directory layout

| Path | Purpose |
|------|---------|
| `src/components/` | UI components |
| `src/components/admin/` | Admin shell (`AdminPageLayout`, `PanelHeader`) |
| `src/components/ui/` | shadcn/ui primitives (Radix wrappers) |
| `src/hooks/` | Custom React hooks (`useAuth`, `useCart`, `useCategories`, …) |
| `src/lib/` | Pure utility functions (`pricing.ts`, `creditCardValidation.ts`) |
| `src/pages/` | Route-level page components (30+ pages) |
| `src/types/` | TypeScript interfaces (`product.ts` central) |
| `src/utils/` | Helpers (validation, PDF, barcode, cart validation) |
| `src/integrations/supabase/` | Supabase client + generated types |
| `src/config/` | App-wide constants |
| `supabase/functions/` | Edge Functions (Deno) — 56 functions |
| `supabase/functions/tests/` | EF integration tests (Deno + `mock_gateways.ts`) |
| `supabase/migrations/` | DB migration SQL — **auto-generated, never edit** |

## TDD is mandatory

Every implementation or bugfix starts with a failing test, then the fix. No exceptions.

## File conventions

- `@/` = `src/` (Vite + Vitest alias)
- Tests: `__tests__/Foo.test.ts` adjacent to `Foo.ts` — one test file per source module, no catch-alls
- Pages: `export default function` (required by `React.lazy`)
- Non-page components: named exports (`export function`) — but some legacy ones still use `export default`
- Supabase client: always import from `src/integrations/supabase/client`
- Pricing math: pure functions in `src/lib/pricing.ts`
- Validation schemas: Zod in `src/utils/validation.ts`
- Cart logic: `src/utils/cartValidation.ts` (pure) + `src/hooks/useCart.tsx` (state)
- Zod v4 — import from `zod` (not `zod/v4`)

## Two test suites

| Suite | Runner | Notes |
|-------|--------|-------|
| Frontend | Vitest + jsdom | `src/test/setup.ts` mocks ResizeObserver, matchMedia, scrollIntoView |
| Edge Functions | Deno | `DENO_TEST=1 deno test`; mocks Asaas/Mercado Pago via `mock_gateways.ts`; real Supabase for auth/DB |

## Auto-generated — never edit

- `src/integrations/supabase/types.ts` (~95 KB)
- `supabase/migrations/*.sql`

## Business rules

- Credit cards: 13–16 digits only (Asaas limitation; Discover/Hipercard unsupported). Validated in `src/lib/creditCardValidation.ts`.
- Payment routing by value: `src/lib/pixGatewayRouter.ts`
- Gateways: Asaas (card) + Mercado Pago (PIX)

## Supabase Edge Functions

- Deno scripts in `supabase/functions/`
- Separate `.env` at `supabase/functions/.env`
- When creating `createClient` in EF tests, always pass `{ auth: { autoRefreshToken: false, persistSession: false } }` to prevent GoTrue `setInterval` leaks

## Watch out for

- **Vite chunk config** isolates `@huggingface/transformers` and `onnxruntime` into a separate chunk — don't touch the `manualChunks` logic
- **Playwright** is a devDependency but no e2e tests exist yet
- **Lovable project** — README references external editor; code changes pushed via Git reflect there

## Tooling

- **CodeGraph** is indexed — use `codegraph_explore` before reading files for structural analysis (call paths, blast radius, dependencies)
- **Superpowers** workflow via `.opencode/commands/` — follow `brainstorming` → `writing-plans` → `test-driven-development` → `subagent-driven-development` → `requesting-code-review` patterns

## Bento (small-prs)

- Nunca abra um PR sem rodar `node scripts/pr-split-verify.mjs check` (ou `bento check`).
- Diff acima de .pr-limits.yaml bloqueia o PR: ofereça o split antes.
- Splits em cadeia são entregues com gh-stack (`gh stack init/add/push/submit`).
- Equivalência do split é obrigatória: `node scripts/pr-split-verify.mjs equivalence <base> <head> <camada1> ...`.

