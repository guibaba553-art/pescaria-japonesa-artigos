# Bento Dogfood — Aplicação no Pescaria Japonesa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o `bento` neste repo (pescaria-japonesa): remover o fluxo openspec e provar o ciclo prevenção/validação/correção com o CLI `bento` e a skill `small-prs` instalados localmente.

**Architecture:** O pacote `bento` ainda não está publicado no npm; o CLI roda direto do repo-fonte em `/Users/gustavo/Projects/bento` via `node bin/bento.mjs`. A instalação copia skill + shim + config + gh-stack para este projeto. A demonstração de split é não destrutiva (stash das mudanças pré-existentes, branches demo descartáveis, branch de salvaguarda).

**Tech Stack:** Node 18+ (CLI bento), git, GitHub CLI (`gh`) + `gh-stack`.

## Global Constraints

- **Não commitar nem tocar mudanças pré-existentes** do working tree: `REASONIX.md` (deletado), `docs/superpowers/specs/2026-07-28-cancelled-orders-ux-design.md` (modificado), `supabase/functions/tests/send_whatsapp_otp_test.ts` (modificado). Guardar com `git stash push -u` antes das demonstrações e restaurar com `git stash pop` ao final.
- Não alterar `src/integrations/supabase/types.ts`, `supabase/migrations/*.sql` (auto-gerados).
- Trabalhar na branch atual `feat/auth-whatsapp-otp-pr`; base de referência: `main`.
- Demonstração com branches `demo/layer*` descartáveis; nada de force-push.
- Critério de remoção openspec: `grep -rn "openspec\|opsx"` sem hits fora de `node_modules/` e `.worktrees/`.

---

### Task 1: Remover o fluxo openspec

**Files:**
- Delete: `.opencode/commands/opsx-*.md` (12 arquivos), `openspec/` (inteiro), `FLUXO-SDD.md`
- Modify: nada mais (`.opencode/opencode.jsonc` e `AGENTS.md` não referenciam openspec — verificado)

- [ ] **Step 1: Remover comandos opsx**

```bash
rm .opencode/commands/opsx-*.md
```

- [ ] **Step 2: Remover artefatos openspec**

```bash
rm -rf openspec/ FLUXO-SDD.md
```

- [ ] **Step 3: Verificar ausência total**

Run:
```bash
grep -rn "openspec\|opsx" . --include="*.md" --include="*.json" --include="*.jsonc" --include="*.ts" | grep -v node_modules | grep -v .worktrees
```
Expected: nenhuma saída (zero hits).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove fluxo openspec (opsx-* e artefatos) — substituído pelo bento"
```

---

### Task 2: Instalar o bento via CLI

**Files:**
- Created (por `bento install`): `.bento/`, `.opencode/skills/small-prs/SKILL.md`, `.opencode/commands/`, `scripts/pr-split-verify.mjs`, `.pr-limits.yaml`, seção `## Bento (small-prs)` no `AGENTS.md`

- [ ] **Step 1: Stash das mudanças pré-existentes**

```bash
git stash push -u -m "bento-dogfood: mudanças pré-existentes"
```
Expected: working tree limpo.

- [ ] **Step 2: Rodar o CLI de instalação (fonte local)**

```bash
node /Users/gustavo/Projects/bento/bin/bento.mjs install
```
Expected: exit 0, saída com `bento instalado:` listando `skill → …/small-prs` e `lib → …/.bento`; gh-stack instalado (ou já presente).

- [ ] **Step 3: Verificar artefatos instalados**

```bash
ls .opencode/skills/small-prs/SKILL.md .bento/lib/validate.mjs scripts/pr-split-verify.mjs .pr-limits.yaml
git diff AGENTS.md
```
Expected: 4 arquivos presentes; AGENTS.md com apêndice `## Bento (small-prs)`.

- [ ] **Step 4: Commit dos artefatos (manter `.pr-limits.yaml` e AGENTS.md)**

```bash
git add .bento .opencode .pr-limits.yaml scripts AGENTS.md
git commit -m "chore: instala bento (small-prs) via CLI"
```

---

### Task 3: Validação real — `bento check` num diff acima do limite

**Contexto:** a branch `feat/auth-whatsapp-otp-pr` tem **5.941 linhas / 79 arquivos** vs `main` — muito acima do default (400/10).

- [ ] **Step 1: Rodar a validação**

```bash
node scripts/pr-split-verify.mjs check main
```
Expected: exit 1, relatório com totais e `PR GRANDE:` com violações de linhas e arquivos.

- [ ] **Step 2: Confirmar bloqueio via CLI**

```bash
echo "exit=$?"
```
Expected: `exit=1`.

---

### Task 4: Demonstração de correção — split em camadas + equivalência (não destrutiva)

**Contexto:** agrupamento determinístico por módulo: camada 1 = `supabase/**` (migrations + functions), camada 2 = restante (`src/**`, configs, testes).

- [ ] **Step 1: Branch de salvaguarda**

```bash
git branch backup/feat-auth-whatsapp-otp-pr
```

- [ ] **Step 2: Camada 1 (supabase/)** — a partir de `main`

```bash
git checkout -b demo/layer1 main
git diff main...feat/auth-whatsapp-otp-pr -- supabase/ | git apply
git add -A
git commit -m "demo: camada 1 — supabase (migrations + functions)"
```

- [ ] **Step 3: Camada 2 (restante)** — a partir da camada 1

```bash
git checkout -b demo/layer2
git diff main...feat/auth-whatsapp-otp-pr -- . ':(exclude)supabase' | git apply
git add -A
git commit -m "demo: camada 2 — src, configs e testes"
```

- [ ] **Step 4: Verificar equivalência**

```bash
node scripts/pr-split-verify.mjs equivalence main feat/auth-whatsapp-otp-pr demo/layer1 demo/layer2
```
Expected: exit 0 com `EQUIVALENTE: a soma das camadas == diff original.`

- [ ] **Step 5: Validação por camada**

```bash
node scripts/pr-split-verify.mjs check main   # na branch demo/layer2 (diff vs main)
git checkout demo/layer1
node scripts/pr-split-verify.mjs check main
```
Expected: relatórios com métricas por camada (a camada 1 pode ainda exceder — o relatório é a evidência do desvio).

- [ ] **Step 6: Provar que divergência é detectada (contraprova)**

```bash
git checkout demo/layer1
git diff main...feat/auth-whatsapp-otp-pr -- supabase/migrations | git apply
git add -A
git commit -m "demo: introduz divergência proposital"
node scripts/pr-split-verify.mjs equivalence main feat/auth-whatsapp-otp-pr demo/layer1 demo/layer2
```
Expected: exit 1 com `DIVERGENTE:` listando os caminhos divergentes.

- [ ] **Step 7: Limpeza — remover branches demo e salvaguarda, restaurar working tree**

```bash
git checkout feat/auth-whatsapp-otp-pr
git branch -D demo/layer1 demo/layer2 backup/feat-auth-whatsapp-otp-pr
git stash pop
```
Expected: volta para a branch original com as mudanças pré-existentes restauradas; `git status` idêntico ao inicial.

---

### Task 5: Verificação final

- [ ] **Step 1: Suite do bento verde**

Run (no repo bento):
```bash
cd /Users/gustavo/Projects/bento && npm test
```
Expected: 29 testes PASS.

- [ ] **Step 2: Openspec zerado**

Run:
```bash
grep -rn "openspec\|opsx" . --include="*.md" --include="*.json" --include="*.jsonc" --include="*.ts" | grep -v node_modules | grep -v .worktrees
```
Expected: zero hits.

- [ ] **Step 3: Status do repo**

Run: `git status --short`
Expected: apenas as mudanças pré-existentes restauradas (3 entradas), nada novo além dos commits das Tasks 1–2.

- [ ] **Step 4: Commit de encerramento (se houver ajustes) ou relatório final**

Expected: relatório ao usuário com: resultados do check (Task 3), evidência de equivalência (Task 4 Step 4), evidência de detecção de divergência (Task 4 Step 6).