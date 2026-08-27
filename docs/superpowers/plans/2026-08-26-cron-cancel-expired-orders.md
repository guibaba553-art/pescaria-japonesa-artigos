# Consolidar cron `cancel-expired-orders` em job único funcional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o auto-cancelamento de pedidos expirados em produção criando **um único** job `cancel-expired-orders-every-5-min` (a cada 5 min) com URL e secret lidos do vault, removendo os dois jobs quebrados (`cancel-expired-orders-hourly` com token errado e `cancel-expired-orders-every-5-min` com URL local).

**Architecture:** Migração SQL idempotente que (1) dá `cron.unschedule` nos dois nomes de job existentes, (2) semeia `functions_base_url` no vault (default `http://127.0.0.1:54321`, sem sobrescrever valor existente), e (3) recria `cancel-expired-orders-every-5-min` com `net.http_post` montando a URL de `functions_base_url` do vault e o `x-cron-secret` de `cron_secret` do vault — o secret do vault é o único que a Edge Function valida (confirmado por curl → 200). Ação manual única na PRD: atualizar `functions_base_url` para a URL real.

**Tech Stack:** SQL (PostgreSQL + pg_cron + pg_net + Supabase Vault).

**Spec:** `docs/superpowers/specs/2026-08-26-cron-cancel-expired-orders-design.md`

## Global Constraints

- Não alterar nenhuma Edge Function, checkout, dashboard ou outro job cron.
- Padrão das migrações existentes: blocos `DO … BEGIN … EXCEPTION WHEN OTHERS THEN RAISE NOTICE … END` idempotentes (ver `20260628000000_cancel_expired_orders_cron.sql`).
- Nenhum comentário novo em código de produção fora da migração.
- Migrações em `supabase/migrations/` são versionadas no repo — nunca editar migrações já aplicadas.
- A PRD espelha o repo: o estado final deve ser alcançável rodando a migração + 1 comando SQL manual.

---

### Task 1: Migração — consolidar cron `cancel-expired-orders`

**Files:**
- Create: `supabase/migrations/20260826000000_consolidate_cancel_expired_orders_cron.sql`

**Interfaces:**
- Consumes: nenhuma (migração independente).
- Produces: no DB: exatamente 1 job em `cron.job` com `jobname = 'cancel-expired-orders-every-5-min'`, `schedule = '*/5 * * * *'`, `active = true`; secret `functions_base_url` no vault (default `http://127.0.0.1:54321` se ausente).

- [ ] **Step 1: Criar a migração**

Criar `supabase/migrations/20260826000000_consolidate_cancel_expired_orders_cron.sql` com o conteúdo completo:

```sql
-- Consolida o cron cancel-expired-orders em um único job funcional.
-- Remove os dois jobs existentes em produção:
--   - cancel-expired-orders-hourly (URL correta, mas Bearer token ≠ CRON_SECRET → 401)
--   - cancel-expired-orders-every-5-min (URL local 127.0.0.1:54321 → nunca executa)
-- Recria cancel-expired-orders-every-5-min com URL e secret lidos do vault
-- (functions_base_url + cron_secret). Em produção, atualizar functions_base_url
-- para a URL real do projeto (ver spec, seção "Ação manual na PRD").

DO $migration$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cancel-expired-orders-hourly');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.unschedule (hourly) skipped: %', SQLERRM;
  END;

  BEGIN
    PERFORM cron.unschedule('cancel-expired-orders-every-5-min');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron.unschedule (every-5-min) skipped: %', SQLERRM;
  END;
END $migration$;

-- Seed idempotente de functions_base_url (não sobrescreve valor existente)
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

- [ ] **Step 2: Validar SQL localmente (opcional, requer `supabase start`)**

Se o ambiente local estiver rodando (`supabase start`), aplicar e conferir:

Run:
```bash
supabase migration up --local
```

Expected: migração aplicada sem erro; `RAISE NOTICE` apenas se algum bloco já estivesse no estado esperado (idempotência).

- [ ] **Step 3: Conferir estado do cron no ambiente local (se aplicável)**

Run:
```sql
SELECT jobname, schedule, active, command FROM cron.job WHERE jobname LIKE 'cancel-expired-orders%';
```

Expected: exatamente **1 linha** — `cancel-expired-orders-every-5-min`, schedule `*/5 * * * *`, `active = true`, `command` contendo `127.0.0.1:54321/functions/v1/cancel-expired-orders` (URL local é a esperada em dev) e `x-cron-secret` com subselect do vault.

- [ ] **Step 4: Aplicar na PRD (ação manual documentada)**

Run (SQL Editor do dashboard, ou `supabase db push` com acesso ao projeto):

1. A migração `20260826000000_consolidate_cancel_expired_orders_cron.sql`.
2. Depois dela, **uma única vez**:

```sql
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'functions_base_url'),
  'https://qiwcngzbpxddowyqaulm.supabase.co'
);
```

Expected: sem erros; o update_secret não retorna erro mesmo se o secret já existir.

- [ ] **Step 5: Verificar na PRD**

Run:
```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'cancel-expired-orders%';
```

Expected: exatamente **1 linha** — `cancel-expired-orders-every-5-min`, `*/5 * * * *`, `active = true` (jobs 6 `hourly` e 16 `every-5-min` antigos removidos; histórico em `cron.job_run_details` permanece).

Run (após ~5-10 min da aplicação):
```sql
SELECT jobid, status, return_message, start_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cancel-expired-orders-every-5-min')
ORDER BY start_time DESC LIMIT 5;
```

Expected: `status = 'succeeded'` e `return_message` com o id de requisição do `net.http_post` (sem erro HTTP). Alternativa: conferir os logs da Edge Function `cancel-expired-orders` no dashboard — requisições chegando com resposta `200` e corpo `{"success":true,"processed":N,…}`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260826000000_consolidate_cancel_expired_orders_cron.sql
git commit -m "fix(db): consolida cron cancel-expired-orders em job único (URL+secret via vault)"
```

---

## Self-Review

- **Spec coverage:**
  - "Migração nova: remover os dois jobs e recriar um único" → Task 1, Steps 1-3.
  - "Ação manual única na PRD: setar functions_base_url" → Task 1, Step 4.
  - "Estado final: 1 job, ativo, URL real, x-cron-secret do vault" → Task 1, Step 5.
  - "Sem mudanças de código/EF" → respeitado (nenhuma EF alterada).
  - "Verificação local + PRD" → Steps 2-3 (local, opcional) e 5 (PRD). Coberto.
- **Placeholder scan:** nenhum TBD/TODO; a migração tem o SQL completo; comandos e saídas esperadas definidos. O nome da migração é fixo (`20260826000000_...`), maior que os existentes — ordena corretamente depois de `20260825190834_otp_send_log.sql`.
- **Type consistency:** nomes de jobs (`cancel-expired-orders-hourly`, `cancel-expired-orders-every-5-min`), secrets (`functions_base_url`, `cron_secret`) e schedule (`*/5 * * * *`) consistentes entre spec, migração e verificação. `vault.update_secret` usa a assinatura `(name, secret)` do Supabase Vault.