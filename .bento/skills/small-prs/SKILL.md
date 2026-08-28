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

1. Garanta que AS DUAS branches envolvidas (base e head) estão atualizadas com o remote: `git fetch origin <base> <head>`. Refs locais desatualizadas produzem diffs fantasmas (commits de outros PRs já mergeados aparecem como mudanças do seu PR).
2. Rode `node scripts/pr-split-verify.mjs check` (ou `bento check`).
3. Se exit 0: prossiga com gh-stack (`gh stack push`, `gh stack submit`; alias `gs` disponível via `gh stack alias`, opcional).
4. Se exit != 0 (PR GRANDE): NÃO abra o PR. Apresente o relatório e ofereça o split (Modo 3).

## Modo 3 — Correção (split retroativo)

Só execute após aprovação explícita do usuário:

1. Crie branch de salvaguarda: `git branch backup/<branch-atual>`.
2. Analise o diff (arquivos e dependências/imports) e agrupe em camadas coerentes: mesmo módulo, testes junto, refactor != feature, CODEOWNERS se existir. Arquivo ambíguo -> pergunte ao usuário. Arquivo ÚNICO acima do limite (ex: docs de 795 linhas): quebre o conteúdo em partes de até `max_lines` e coloque cada parte em uma camada própria (para docs, a equivalência é de conteúdo — concatenação das partes == original — não de árvore).
3. Apresente o plano de split (tabela: camada, arquivos, dependências) e aguarde aprovação.
4. Execute: `gh stack init camada1`, `gh stack add camada2`, ...; em cada camada aplique `git diff <base>..<origem> -- <paths> | git apply` e commite (1 commit limpo por camada).
5. Se a camada B usa símbolo renomeado na A, inclua shim/alias retrocompatível na A.
6. Verifique: `node scripts/pr-split-verify.mjs equivalence <base> <head> <camada1> ...` — precisa exit 0. Se houve transformação de docs (arquivo quebrado), a equivalência de árvore vai reportar DIVERGENTE apenas nos paths de docs: confirme que são só esses paths, verifique a preservação de conteúdo das partes e trate como aprovado.
7. Rode lint, build e testes por camada; pare e reporte se falhar.
8. Nomeação das camadas: `split/<slug-da-feature>/<nn>-<nome-curto-semantico>` (ex: `split/rls-sensitive-columns/01-fundacao`, `02-hook-variacoes`).
9. Commit de cada camada: mensagem = título do PR, conventional e descritivo (ex: `feat(rls): restringe colunas sensíveis — migração e utils`).
10. Entrega: `gh stack submit --auto --ready` (sem draft; `--ready` só se o gh-stack criar drafts com `--auto` — confirme no `gh stack submit --help`). Depois, para CADA PR do stack: `gh pr edit <n> --title "<título>" --body "<descrição>"` com corpo contendo: o que faz, por que, e foco da review (arquivos-chave/riscos).
11. Se não for o autor do PR original, credite o autor nos novos PRs. Nunca force-push na branch original antes da aprovação final.
