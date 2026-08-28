---
name: small-prs
description: Previne, valida e corrige PRs grandes no fluxo opencode. Use durante o planejamento (prevenção), antes de abrir um PR (validação via pr-split-verify) e quando um diff exceder os limites de .pr-limits.yaml (correção com split em cadeia via gh-stack).
---

# small-prs — prevenção, validação e correção de PRs grandes

## Modo 1 — Prevenção (planejamento)

Ao planejar (superpowers:writing-plans), cada task do plano é um slice de PR:

- 1 acceptance criterion por slice.
- Testes viajam junto do código que validam.
- Refactor separado de feature.
- Migração junto do código que ela serve.
- Limite default: <=400 linhas de diff e <=10 arquivos por PR (ver .pr-limits.yaml).
- Declare no plano as dependências entre PRs e a ordem de entrega.

## Modo 2 — Validação (antes de abrir PR)

Antes de abrir qualquer PR (superpowers:finishing-a-development-branch):

1. Rode `node scripts/pr-split-verify.mjs check` (ou `bento check`).
2. Se exit 0: prossiga com gh-stack (`gs push`, `gs submit`).
3. Se exit != 0 (PR GRANDE): NÃO abra o PR. Apresente o relatório e ofereça o split (Modo 3).

## Modo 3 — Correção (split retroativo)

Só execute após aprovação explícita do usuário:

1. Crie branch de salvaguarda: `git branch backup/<branch-atual>`.
2. Analise o diff (arquivos e dependências/imports) e agrupe em camadas coerentes: mesmo módulo, testes junto, refactor != feature, CODEOWNERS se existir. Arquivo ambíguo -> pergunte ao usuário.
3. Apresente o plano de split (tabela: camada, arquivos, dependências) e aguarde aprovação.
4. Execute: `gs init camada1`, `gs add camada2`, ...; em cada camada aplique `git diff <base>..<origem> -- <paths> | git apply` e commite (1 commit limpo por camada).
5. Se a camada B usa símbolo renomeado na A, inclua shim/alias retrocompatível na A.
6. Verifique: `node scripts/pr-split-verify.mjs equivalence <base> <head> <camada1> ...` — precisa exit 0.
7. Rode lint, build e testes por camada; pare e reporte se falhar.
8. `gs push` + `gs submit` (drafts até checks verdes).
9. Se não for o autor do PR original, credite o autor nos novos PRs. Nunca force-push na branch original antes da aprovação final.
