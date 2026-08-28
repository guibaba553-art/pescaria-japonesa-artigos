import { loadLimits, matchesOverride } from './config.mjs';
import { getDiffStats, runGit, summarize } from './diff.mjs';

export function evaluate(limits, files) {
  const global = { lines: 0, files: 0 };
  const groups = new Map();
  for (const f of files) {
    global.lines += f.added + f.deleted;
    global.files += 1;
    for (const o of limits.overrides) {
      if (matchesOverride(f.path, o)) {
        const g = groups.get(o.glob) ?? { lines: 0, files: 0 };
        g.lines += f.added + f.deleted;
        g.files += 1;
        groups.set(o.glob, g);
      }
    }
  }
  const violations = [];
  if (global.lines > limits.maxLines) {
    violations.push(`total de linhas ${global.lines} > ${limits.maxLines}`);
  }
  if (global.files > limits.maxFiles) {
    violations.push(`total de arquivos ${global.files} > ${limits.maxFiles}`);
  }
  for (const [glob, g] of groups) {
    const override = limits.overrides.find((o) => o.glob === glob);
    const max = override?.maxLines ?? limits.maxLines;
    if (g.lines > max) {
      violations.push(`grupo "${glob}": ${g.lines} linhas > ${max}`);
    }
  }
  return { global, groups: [...groups.entries()], violations };
}

export function runCheck({ base, head, cwd }) {
  const limits = loadLimits(cwd);
  const files = getDiffStats(base, head, cwd, true);
  const summary = summarize(files);
  const result = evaluate(limits, files);
  console.log(`Diff ${base}...${head} (merge-base): ${summary.lines} linhas, ${summary.files} arquivos`);
  for (const [dir, count] of summary.byDir) {
    console.log(`  ${dir}: ${count} arquivo(s)`);
  }
  if (result.violations.length > 0) {
    console.error('PR GRANDE:');
    for (const v of result.violations) {
      console.error(`  - ${v}`);
    }
    return 1;
  }
  console.log('PR dentro dos limites.');
  return 0;
}

export function runEquivalence({ base, head, layers, cwd }) {
  if (!layers.length) {
    console.error('uso: equivalence <base> <head> <camada1> [camada2 …]');
    return 2;
  }
  let prev = base;
  for (const layer of layers) {
    try {
      runGit(['merge-base', '--is-ancestor', prev, layer], cwd);
    } catch (err) {
      console.error(`camadas não formam cadeia: ${layer} não deriva de ${prev}`);
      return 1;
    }
    prev = layer;
  }
  const last = layers[layers.length - 1];
  let stats;
  try {
    stats = getDiffStats(head, last, cwd);
  } catch (err) {
    console.error(err.stderr ?? err.message);
    return 1;
  }
  if (stats.length === 0) {
    console.log('EQUIVALENTE: estado final das camadas idêntico ao original.');
    return 0;
  }
  console.error('DIVERGENTE:');
  for (const f of stats) {
    console.error(`  divergência em ${f.path}: ${f.added}+/${f.deleted}-`);
  }
  return 1;
}
