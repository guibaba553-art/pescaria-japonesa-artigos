#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { runCheck, runEquivalence } from '../lib/validate.mjs';
import { install } from '../lib/install.mjs';

const [, , cmd, ...args] = process.argv;

function ensureGhStack() {
  try {
    const list = execFileSync('gh', ['extension', 'list'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (list.includes('gh-stack')) return true;
    execFileSync('gh', ['extension', 'install', 'github/gh-stack'], { stdio: 'inherit' });
    return true;
  } catch (err) {
    return false;
  }
}

function run() {
  const noAgents = args.includes('--no-agents');
  switch (cmd) {
    case 'install': {
      if (!ensureGhStack()) {
        console.error('gh-stack indisponível: instale o GitHub CLI (gh) e tente de novo.');
        process.exitCode = 1;
        return;
      }
      const result = install(process.cwd(), { noAgents });
      console.log('bento instalado:');
      console.log(`  skill → ${result.skillDir}`);
      console.log(`  lib   → ${result.dotBento}`);
      return;
    }
    case 'update': {
      install(process.cwd(), { noAgents });
      console.log('bento atualizado.');
      return;
    }
    case 'check':
      process.exitCode = runCheck({ base: args[0] ?? 'main', head: args[1] ?? 'HEAD', cwd: process.cwd() });
      return;
    case 'equivalence':
      process.exitCode = runEquivalence({ base: args[0], head: args[1], layers: args.slice(2), cwd: process.cwd() });
      return;
    default:
      console.error(`uso: bento install|update|check|equivalence
  install          instala skill, scripts, config e gh-stack no projeto
  update           re-instala mantendo .pr-limits.yaml (não toca gh-stack)
  check [base]     valida tamanho do diff (head = HEAD, base default = main)
  equivalence <base> <head> <camada1> [camada2 ...]
`);
      process.exitCode = 2;
  }
}

run();
