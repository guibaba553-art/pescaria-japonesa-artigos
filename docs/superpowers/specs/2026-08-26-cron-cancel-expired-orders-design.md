# Design — Consolidar cron `cancel-expired-orders` em um job único e funcional

Data: 2026-08-26

## Problema

Em produção, o auto-cancelamento de pedidos com pagamento expirado não
acontece. Há **dois jobs** em `cron.job`, e ambos estão quebrados:

| jobid | nome | schedule | URL | auth | status |
|-------|------|----------|-----|------|--------|
| 6 | `cancel-expired-orders-hourly` | `0 * * * *` | `https://qiwcngzbpxddowyqaulm.supabase.co/functions/v1/cancel-expired-orders` (correta) | `Authorization: Bearer <token>` | ❌ token ≠ secret real → 401 |
| 16 | `cancel-expired-orders-every-5-min` | `*/5 * * * *` | `http://127.0.0.1:54321/functions/v1/cancel-expired-orders` (local) | `x-cron-secret` do vault | ❌ URL local → connection refused |

Causas raiz:

1. As migrações `20260628000000_cancel_expired_orders_cron.sql` e
   `20260715001618_…` agendam o job com URL local (`127.0.0.1:54321`),
   herdada do ambiente de desenvolvimento — nunca executa em produção.
2. Alguém criou manualmente o job `cancel-expired-orders-hourly` (não existe
   no repositório) com URL correta, mas com um Bearer token que **não é** o
   secret que a Edge Function valida (verificado via curl: o valor do vault
   `cron_secret` retorna 200; o Bearer do job 6 não).
3. O secret válido é o do vault: `vault.decrypted_secrets.name = 'cron_secret'`
   == env `CRON_SECRET` das Edge Functions (confirmado por curl → 200).

Resultado: **nenhum** job cancela pedidos; nenhum pedido recente tem
`cancellation_reason = 'prazo_expirado'`.

## Escopo

- Migração SQL nova: remover os dois jobs e recriar **um único** job com URL e
  secret lidos do vault.
- Ação manual única na PRD: setar `functions_base_url` no vault com a URL real.
- Fora de escopo: mudanças na Edge Function `cancel-expired-orders`, no
  checkout, dashboard, ou nos demais jobs/funções cron (ex.: `database-backup`
  que lê `'CRON_SECRET'` maiúsculo — follow-up).

## Design

### 1. Migração nova

Arquivo: `supabase/migrations/20260826…_consolidate_cancel_expired_orders_cron.sql`
(nome a definir no plano, após `20260825190834_otp_send_log.sql`).

Blocos, todos idempotentes com `DO … EXCEPTION WHEN OTHERS THEN RAISE NOTICE`
(padrão das migrações existentes):

1. `cron.unschedule('cancel-expired-orders-hourly')` — remove o job 6.
2. `cron.unschedule('cancel-expired-orders-every-5-min')` — remove o job 16.
3. Seed idempotente do vault: `functions_base_url` com default
   `http://127.0.0.1:54321` (mesmo padrão do seed de `cron_secret` em
   `20260508122106_…`), sem sobrescrever valor existente.
4. `cron.schedule` recriando **apenas** `cancel-expired-orders-every-5-min`
   com schedule `*/5 * * * *` e:
   - `url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_base_url') || '/functions/v1/cancel-expired-orders'`
   - `headers := jsonb_build_object('Content-Type','application/json', 'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1))`
   - `body := '{}'::jsonb`

### 2. Estado final esperado (PRD)

Exatamente **1 job**: `cancel-expired-orders-every-5-min`, ativo, apontando para
`https://qiwcngzbpxddowyqaulm.supabase.co/functions/v1/cancel-expired-orders`,
com `x-cron-secret` = valor do vault `cron_secret` (o único válido).

### 3. Ação manual na PRD (fora da migração)

O seed da migração deixa `functions_base_url` como `http://127.0.0.1:54321` —
se não for atualizado, o job único recriaria com URL local (mesmo problema).
Portanto, **uma única vez**, após aplicar a migração:

```sql
SELECT vault.update_secret('functions_base_url', 'https://qiwcngzbpxddowyqaulm.supabase.co');
```

Sem isso, o job fica com a URL errada. (Nota: `cron.job_run_details` mantém o
histórico das execuções antigas — comportamento normal do `cron.unschedule`.)

### 4. Sem mudanças de código/EF

A Edge Function `cancel-expired-orders` já aceita `x-cron-secret` igual ao env
`CRON_SECRET`, que hoje coincide com o vault. Nenhuma alteração de código.

## Verificação

- **Local (opcional):** `supabase db reset` (ou `supabase migration up`) e
  `SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'cancel-expired-orders%'`
  → 1 linha, URL `127.0.0.1:54321` (esperado em dev), `x-cron-secret` vindo do
  vault.
- **PRD:**
  1. Rodar a migração (via CLI ou SQL Editor do dashboard).
  2. Aplicar `vault.update_secret('functions_base_url', …)`.
  3. `SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'cancel-expired-orders%'`
     → exatamente 1 linha, `active = true`.
  4. Em ~5-10 min, conferir `cron.job_run_details` (status `success`) e/ou os
     logs da Edge Function `cancel-expired-orders` (requisições chegando com
     resposta 200 / `processed: N`).

## Edge cases

- **Job manual com nome novo reaparecer**: se alguém recriar o `hourly` na PRD
  depois, a migração não o remove (idempotência cobre só a execução). Aceito —
  o padrão é a PRD espelhar o repo.
- **Vault `functions_base_url` já existente**: o seed usa `IF v_existing IS
  NULL` → não sobrescreve; o valor manual da PRD prevalece.
- **Migração aplicada em ambiente local**: URL fica `127.0.0.1:54321`, que é o
  correto para `supabase start` — nenhuma ação manual necessária em dev.

## Testes (TDD)

Esta entrega é **migração SQL + ação manual em PRD** — não há teste unitário
viável no padrão Vitest/Deno do projeto (o `npm run test:functions` requer
`supabase start` e o comportamento de pg_cron não é coberto por esses testes).
A verificação é a de produção descrita acima, mais a inspeção do
`cron.job`/`cron.job_run_details`.