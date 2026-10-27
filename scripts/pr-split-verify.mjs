#!/usr/bin/env node
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
