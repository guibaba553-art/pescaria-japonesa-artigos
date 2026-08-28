## Bento (small-prs)

- Nunca abra um PR sem rodar `node scripts/pr-split-verify.mjs check` (ou `bento check`).
- Diff acima de .pr-limits.yaml bloqueia o PR: ofereça o split antes.
- Splits em cadeia são entregues com gh-stack (`gh stack init/add/push/submit`; alias `gs` via `gh stack alias`, opcional).
- Equivalência do split é obrigatória: `node scripts/pr-split-verify.mjs equivalence <base> <head> <camada1> ...`.
