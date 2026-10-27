import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function packageRoot() {
  return PKG_ROOT;
}

export function version() {
  try {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return readFileSync(join(PKG_ROOT, 'VERSION'), 'utf8').trim();
  }
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
    const src = join(PKG_ROOT, sub);
    const dest = join(dotBento, sub);
    if (src === dest) continue;
    cpSync(src, dest, { recursive: true });
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

function stripBentoSection(content) {
  const m = /^## Bento \(small-prs\)\s*$/m.exec(content);
  if (!m) return null;
  let from = m.index;
  if (from > 0 && content[from - 1] === '\n' && (from === 1 || content[from - 2] === '\n')) from -= 1;
  const next = /^## /gm;
  next.lastIndex = m.index + m[0].length;
  const n = next.exec(content);
  const to = n ? n.index : content.length;
  return content.slice(0, from) + content.slice(to);
}

export function uninstall(projectRoot) {
  const removed = [];

  const dotBento = join(projectRoot, '.bento');
  if (existsSync(dotBento)) {
    rmSync(dotBento, { recursive: true, force: true });
    removed.push('.bento');
  }

  const skillDir = join(projectRoot, '.opencode', 'skills', 'small-prs');
  if (existsSync(skillDir)) {
    rmSync(skillDir, { recursive: true, force: true });
    removed.push('.opencode/skills/small-prs');
  }

  const shimPath = join(projectRoot, 'scripts', 'pr-split-verify.mjs');
  if (existsSync(shimPath) && readFileSync(shimPath, 'utf8').includes('../.bento/lib/validate.mjs')) {
    rmSync(shimPath, { force: true });
    removed.push('scripts/pr-split-verify.mjs');
  }

  const configPath = join(projectRoot, '.pr-limits.yaml');
  if (existsSync(configPath)) {
    rmSync(configPath, { force: true });
    removed.push('.pr-limits.yaml');
  }

  const agentsPath = join(projectRoot, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    const content = readFileSync(agentsPath, 'utf8');
    const rest = stripBentoSection(content);
    if (rest !== null) {
      if (rest.trim() === '') {
        rmSync(agentsPath, { force: true });
      } else {
        writeFileSync(agentsPath, rest);
      }
      removed.push('AGENTS.md');
    }
  }

  return { removed };
}
