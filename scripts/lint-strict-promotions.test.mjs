// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lint-strict-promotions.test.mjs
 * @input The repository's ESLint config, loaded in each tier
 * @output Pins each rule that strict mode reports as an error now that the
 *   repository has no warning left for it, and that the recommended tier
 *   keeps it a warning
 * @position Node test over the lint config, beside
 *   core-internal-entries.test.mjs. A rule joins PROMOTED in the change that
 *   fixes its last warning
 */

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');

/** Rules that strict mode reports as errors, each with a file it covers. */
const PROMOTED = [
  {rule: 'curly', file: 'packages/core/src/index.ts'},
  {rule: 'no-console', file: 'packages/core/src/index.ts'},
];

// The config reads the tier from the environment when it loads, so each
// reading loads it in a child process, without the tier variables of this
// run.
const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => key !== 'CI' && key !== 'ASTRYX_STRICT_LINT',
  ),
);

/** `rule`'s severity for `file` when the config loads with `tier` set. */
function severityAt(rule, file, tier) {
  const script = `
import {createRequire} from 'node:module';
const require = createRequire(${JSON.stringify(path.join(REPO, 'package.json'))});
const {ESLint} = require('eslint');
const eslint = new ESLint({cwd: ${JSON.stringify(REPO)}});
const config = await eslint.calculateConfigForFile(${JSON.stringify(path.join(REPO, file))});
const setting = config.rules?.[${JSON.stringify(rule)}];
process.stdout.write(String(Array.isArray(setting) ? setting[0] : setting));
`;
  const run = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {cwd: REPO, encoding: 'utf8', env: {...BASE_ENV, ...tier}},
  );
  expect(run.status, run.stderr).toBe(0);
  return {2: 'error', 1: 'warn', 0: 'off'}[run.stdout] ?? run.stdout;
}

describe('rules strict mode reports as errors', () => {
  for (const {rule, file} of PROMOTED) {
    it(`${rule} is an error in strict mode and a warning by default`, () => {
      expect(severityAt(rule, file, {ASTRYX_STRICT_LINT: '1'})).toBe('error');
      expect(severityAt(rule, file, {CI: 'true'})).toBe('error');
      expect(severityAt(rule, file, {})).toBe('warn');
    }, 60_000);
  }
});
