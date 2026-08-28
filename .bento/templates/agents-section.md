## Bento (small-prs)

- Nunca abra um PR sem rodar `node scripts/pr-split-verify.mjs check` (ou `bento check`).
- Diff acima de .pr-limits.yaml bloqueia o PR: ofereça o split antes.
- Splits em cadeia são entregues com gh-stack (`gs init/add/push/submit`).
- Equivalência do split é obrigatória: `node scripts/pr-split-verify.mjs equivalence <base> <head> <camada1> ...`.
