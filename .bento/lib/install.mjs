import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function packageRoot() {
  return PKG_ROOT;
}

export function version() {
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

const SHIM = `#!/usr/bin/env node
import { runCheck, runEquivalence } from '../.bento/lib/validate.mjs';

const [, , cmd, ...args] = process.argv;
if (cmd === 'check') {
  process.exitCode = runCheck({ base: args[0] ?? 'main', head: args[1] ?? 'HEAD', cwd: process.cwd() });
} else if (cmd === 'equivalence') {
  process.exitCode = runEquivalence({ base: args[0], head: args[1], layers: args.slice(2), cwd: process.cwd() });
} else {
  console.error('uso: pr-split-verify check [base] | equivalence <base> <head> <camada1> [camada2 ...]');
  process.exitCode = 2;
}
`;

export function install(projectRoot, { noAgents = false } = {}) {
  const dotBento = join(projectRoot, '.bento');
  mkdirSync(dotBento, { recursive: true });
  for (const sub of ['lib', 'bin', 'skills', 'templates']) {
    cpSync(join(PKG_ROOT, sub), join(dotBento, sub), { recursive: true });
  }
  writeFileSync(join(dotBento, 'VERSION'), `${version()}\n`);

  const skillDir = join(projectRoot, '.opencode', 'skills', 'small-prs');
  mkdirSync(skillDir, { recursive: true });
  cpSync(join(PKG_ROOT, 'skills', 'small-prs'), skillDir, { recursive: true });
  mkdirSync(join(projectRoot, '.opencode', 'commands'), { recursive: true });

  mkdirSync(join(projectRoot, 'scripts'), { recursive: true });
  writeFileSync(join(projectRoot, 'scripts', 'pr-split-verify.mjs'), SHIM);

  const configPath = join(projectRoot, '.pr-limits.yaml');
  if (!existsSync(configPath)) {
    copyFileSync(join(PKG_ROOT, 'templates', 'pr-limits.yaml'), configPath);
  }

  if (!noAgents) {
    const agentsPath = join(projectRoot, 'AGENTS.md');
    const content = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
    if (!/^## Bento\b/m.test(content)) {
      const section = readFileSync(join(PKG_ROOT, 'templates', 'agents-section.md'), 'utf8');
      appendFileSync(agentsPath, `\n${section}\n`);
    }
  }

  return { dotBento, skillDir };
}
