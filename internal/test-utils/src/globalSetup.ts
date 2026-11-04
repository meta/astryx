// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file globalSetup.ts
 * @input None (runs once, before the whole test suite)
 * @output Side effect: regenerates the English runtime catalog and pseudo.json
 * @position Vitest globalSetup hook; keeps generated i18n artifacts fresh so
 *   tests can import them without a preceding build step.
 *
 * Both files are git-ignored and derived from en.json. This setup runs their
 * generators once per test suite so source-mode tests always use current
 * English and pseudo messages.
 */

import {execFileSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export default function setup() {
  // internal/test-utils/src → repo root
  const repoRoot = resolve(HERE, '..', '..', '..');
  const scripts = [
    resolve(repoRoot, 'scripts', 'generate-i18n-runtime.mjs'),
    resolve(repoRoot, 'packages', 'core', 'scripts', 'build-pseudo-locale.mjs'),
  ];
  for (const script of scripts) {
    execFileSync(process.execPath, [script], {stdio: 'inherit'});
  }
}
