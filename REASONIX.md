# REASONIX.md — Pescaria Japonesa Artigos

## Stack

- **React 18** + **TypeScript 5** — frontend framework
- **Vite 5** (`@vitejs/plugin-react-swc`) — bundler, dev server on port 8080
- **Tailwind CSS 3** + **shadcn/ui** (50+ Radix primitives) — styling
- **Supabase** — backend (Postgres + auth + Edge Functions)
- **TanStack React Query 5** — server state / cache
- **React Router v6** — client-side routing, `BrowserRouter` + lazy-loaded routes
- **Zod 4** — schema validation
- **Vitest 3** + **jsdom** + **@testing-library/react** — test runner
- **React Hook Form** + **@hookform/resolvers** — form management
- **Recharts** — charts (dashboard/sales)
- **Sonner** — toast notifications
- **jsPDF** / **xlsx** / **JSZip** — PDF generation and spreadsheet export
- **CMDK** — command palette (admin navigation)

## Entry point

`src/main.tsx` → `src/App.tsx` (wraps `AuthProvider` > `CartProvider` > `BrowserRouter`)

## Layout

| Path | Purpose |
|------|---------|
| `src/components/` | UI components (one file per component) |
| `src/components/admin/` | Admin shell (`AdminPageLayout`, `PanelHeader`) |
| `src/components/mobile/` | Mobile-specific layouts (`MobileHome`) |
| `src/components/ui/` | shadcn/ui primitives (Radix wrappers) |
| `src/hooks/` | Custom React hooks (`useAuth`, `useCart`, `useCategories`, …) |
| `src/lib/` | Pure utility functions (`pricing.ts`, `creditCardValidation.ts`, `errorLogger.ts`) |
| `src/pages/` | Route-level page components (30+ pages) |
| `src/types/` | TypeScript interfaces (`product.ts` central) |
| `src/utils/` | Assorted helpers (validation, PDF, barcode, cart validation, promo price) |
| `src/integrations/supabase/` | Supabase client + generated types |
| `src/integrations/lovable/` | Lovable platform integration |
| `src/config/` | App-wide constants (`constants.ts`) |
| `supabase/functions/` | Supabase Edge Functions (Deno) |
| `supabase/functions/tests/` | Edge Function integration tests (Deno). Imports real handlers, mocks external APIs, uses real local DB. See `/testing-practices` skill. |
| `supabase/migrations/` | DB schema migration SQL files |
| `src/test/setup.ts` | Vitest global setup (jsdom, `matchMedia` mock) |

## Commands

| Command | Action |
|---------|--------|
| `npm run dev` | Start Vite dev server (port 8080) |
| `npm run build` | Production build (chunk size limit 800 KB, transformers chunk isolated) |
| `npm run build:dev` | Dev-mode build |
| `npm run lint` | ESLint (flat config) |
| `npm run preview` | Preview production build |
| `npm test` | `vitest run` (single run) |
| `npm run test:watch` | `vitest` (watch mode) |
| `npm run test:functions` | `DENO_TEST=1 deno test --allow-net --allow-env --no-check supabase/functions/tests/` — Edge Function integration tests (requires `supabase start`). Imports real `handleRequest`, mocks external APIs (Asaas/Mercado Pago) via `mock_gateways.ts`, uses real local Supabase for auth + DB. |

## Architecture — route pages

Routes are lazy-loaded in `src/App.tsx` via `React.lazy`. Each page is a function component loaded with `export default`. Key route groups:

| Group | Pages |
|-------|-------|
| **Storefront** | `Index`, `Products`, `ProductDetails`, `Auth`, `Checkout`, `CheckoutEntrega`, `PickupOrder` |
| **Account** | `Account` (profile, orders, addresses, payments, tracking), `CompletarCadastro` |
| **Admin** | `Admin` (shell), `AdminCatalog`, `AdminOrders`, `AdminCustomers`, `AdminSalesAnalysis`, `AdminTriagem`, `AdminEmployees`, `AdminLGPD`, `AdminErrors`, `StockMigration` |
| **PDV / Operations** | `PDV`, `SalesHistory`, `Dashboard`, `CashRegister`, `FiscalTools` |
| **Static** | `ForgotPassword`, `ResetPassword`, `PoliticaPrivacidade`, `TermosUso`, `PoliticaTrocas`, `PoliticaFrete`, `NotFound`, `Unsubscribe` |

## Architecture — component tree

```
<AuthProvider>              ← src/hooks/useAuth.tsx
  <CartProvider>            ← src/hooks/useCart.tsx
    <BrowserRouter>
      <PageViewTracker />
      <Routes>              ← lazy-loaded per route
        <Route path=... element={<Page />} />
      </Routes>
      <MobileBottomNav />
      <CookieBanner />
    </BrowserRouter>
  </CartProvider>
</AuthProvider>
```

## Conventions

- **TDD mandatory** — toda implementação ou correção de bug deve começar por um teste que falha, depois a implementação, depois validar que o teste passa. Sem exceções.
- **Test files must correspond to a source module** — nunca crie arquivos catch-all (`paymentCorrections.test.ts`). Cada `__tests__/Foo.test.ts` testa `Foo.ts`.
- **Edge Function tests testam os handlers reais** — importam `handleRequest` diretamente, mockam apenas APIs externas (Asaas/Mercado Pago) via interceptação de `fetch`. O Supabase local é usado real para auth + DB fixtures.
- **`@/` path alias** maps to `src/` (Vite + Vitest configured)
- **Test files** live in `__tests__/` dir adjacent to the module under test
- **Page components** use `export default function` (required by `React.lazy`)
- **Non-page components** generally use named exports (`export function`) — but some legacy ones (Footer, Hero, Benefits, Categories, etc.) still use `export default`
- **Supabase client** accessed via `src/integrations/supabase/client` (not direct env vars)
- **Radix UI** components imported via `@radix-ui/react-*` packages + shadcn wrappers in `src/components/ui/`
- **Pricing math** lives in `src/lib/pricing.ts` as pure functions, tested in `src/lib/__tests__/pricing.test.ts`
- **Validation schemas** live in `src/utils/validation.ts` using Zod
- **Cart logic** lives in `src/utils/cartValidation.ts` (pure) + `src/hooks/useCart.tsx` (state + context)

## Watch out for

- **SEARCH/REPLACE edits** must match existing content byte-for-byte; double-check whitespace
- **Supabase migrations** are timestamped SQL files in `supabase/migrations/` — do not edit manually
- **Edge Functions** are Deno scripts under `supabase/functions/` with a separate dependency model; environment variables go in `supabase/functions/.env`
- **Lovable project** — README references an external Lovable editor; code changes pushed via Git reflect there
- **Supabase types** are auto-generated in `src/integrations/supabase/types.ts` (~95 KB) — do not edit manually
- **Vite chunk config** isolates `@huggingface/transformers` and `onnxruntime` into a separate chunk to avoid init errors
- **Playwright** is a devDependency but no e2e tests directory exists yet
- **Zod v4** — import from `zod` (not `zod/v4`)
- **TDD** — todo PR deve incluir testes que comprovem a correção/feature. Testes de Edge Function rodam no Deno (`npm run test:functions`) e precisam do `supabase start`. O `mock_gateways.ts` intercepta `fetch` para Asaas/Mercado Pago; o resto (auth, DB) é real.
- **`autoRefreshToken: false`** — ao criar `createClient` em Edge Functions que serão testadas, sempre passe `{ auth: { autoRefreshToken: false, persistSession: false } }` para evitar leaks de `setInterval` do GoTrue nos testes Deno.

## Notes

### Skills (Reasonix)

The following project skills are available in `.reasonix/skills/`:

| Skill | Description |
|-------|-------------|
| `testing-practices` | Testing conventions (Vitest frontend, Deno Edge Functions, mocked external APIs) |
| `abacatepay` | ⚠️ Removido — substituído por Mercado Pago + Asaas com roteamento por valor (ver `src/lib/pixGatewayRouter.ts`) |

## Business rules

- **Card number length (13-16 digits)**: Asaas, the credit card payment gateway, only accepts card numbers with 13 to 16 digits. Cards with 17-19 digits (Discover, Hipercard) are intentionally not supported. Validated in `src/lib/creditCardValidation.ts` and `src/components/Checkout.tsx`.
