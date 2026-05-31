# REASONIX.md

## Stack

- **React 18** + **TypeScript 5** — frontend framework
- **Vite 5** — bundler + dev server (`@vitejs/plugin-react-swc`)
- **Tailwind CSS 3** + **shadcn/ui** (Radix primitives) — styling
- **Supabase** — backend (Postgres + auth + Edge Functions)
- **Vitest 3** + **jsdom** + **@testing-library/react** — test runner
- **React Router v6** — client-side routing
- **Zod 4** — schema validation
- **React Query 5** — server state / cache

## Layout

| Path | Purpose |
|------|---------|
| `src/components/` | React components (one file per component) |
| `src/components/admin/` | Admin panel layout utilities |
| `src/hooks/` | Custom React hooks |
| `src/lib/` | Pure utility functions (`pricing.ts`, `utils.ts`, `errorLogger.ts`) |
| `src/pages/` | Route-level page components |
| `src/types/` | TypeScript interfaces (`product.ts` central) |
| `src/utils/` | Assorted helpers (validation, PDF, barcode, etc.) |
| `src/integrations/supabase/` | Supabase client singleton |
| `src/config/` | App-wide constants |
| `supabase/functions/` | Supabase Edge Functions (Deno) |
| `supabase/migrations/` | DB schema migration SQL files |
| `src/test/setup.ts` | Vitest global setup (jsdom, `matchMedia` mock) |

## Commands

| Command | Action |
|---------|--------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run build:dev` | Dev-mode build |
| `npm run lint` | ESLint (flat config) |
| `npm run preview` | Preview production build |
| `npm test` | `vitest run` (single run) |
| `npm run test:watch` | `vitest` (watch mode) |

## Conventions

- **Named exports** only — no `export default` found in codebase
- **`@/` path alias** maps to `src/` (vite + vitest configured)
- **Test files** live in `__tests__/` dir adjacent to the module under test
- **Pricing logic** is extracted to `src/lib/pricing.ts` as pure functions — the component (`ProductEdit.tsx`) imports them rather than reimplementing
- **Supabase client** accessed via `src/integrations/supabase/client` (not direct env vars)
- **Radix UI** components imported via `@radix-ui/react-*` packages + shadcn wrappers

## Watch out for

- **SEARCH/REPLACE edits** must match existing content byte-for-byte; double-check whitespace
- **Pricing tests** live in `src/lib/__tests__/pricing.test.ts` — pure math functions tested in isolation
- **Supabase migrations** are timestamped SQL files in `supabase/migrations/` — do not edit manually
- **Edge Functions** are Deno scripts under `supabase/functions/` with a separate dependency model
- **Lovable project** — README references an external Lovable editor; code changes pushed via git reflect there
