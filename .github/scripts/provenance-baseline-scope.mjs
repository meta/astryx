// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file provenance-baseline-scope.mjs
 * @input A file that lists changed paths, one per line (both paths of a
 *   rename), and optionally `--baseline <file>`.
 * @output Exit 0 only when the change cannot make the comment-provenance
 *   baseline stale: a non-empty list that touches no file the baseline lists,
 *   not the baseline, not the rule or its baseline tooling, and no
 *   `.gitignore` (ESLint skips the files those name). Any other
 *   answer, an error included, exits non-zero, and the check runs.
 * @position The lint job's "Check the comment-provenance baseline" step reads
 *   it, so a pull request that cannot change the baseline skips the check.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const BASELINE =
  'internal/eslint-plugin-astryx/no-comment-provenance.baseline.json';
export const RULE_FILES = [
  BASELINE,
  'internal/eslint-plugin-astryx/no-comment-provenance.js',
  'internal/eslint-plugin-astryx/no-comment-provenance.baseline.mjs',
  'internal/eslint-plugin-astryx/rule-baseline.mjs',
  'internal/eslint-plugin-astryx/index.js',
  'eslint.config.js',
];

/**
 * Whether the check may be skipped: only for a known, non-empty file list
 * that touches nothing the baseline depends on.
 * @param {string[]} changed
 * @param {Record<string, unknown>} baseline
 */
export function canSkipBaselineCheck(changed, baseline) {
  if (changed.length === 0) return false;
  const listed = new Set([...Object.keys(baseline), ...RULE_FILES]);
  // ESLint skips what an ignore file names, so an ignore change can make a
  // listed site disappear.
  return !changed.some(
    file => listed.has(file) || path.posix.basename(file) === '.gitignore',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--baseline');
  const baselinePath =
    flag === -1 ? path.join(ROOT, BASELINE) : path.resolve(args[flag + 1]);
  const listFile = args.find(
    (arg, i) => !arg.startsWith('--') && args[i - 1] !== '--baseline',
  );
  const changed = fs
    .readFileSync(listFile, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  process.exitCode = canSkipBaselineCheck(changed, baseline) ? 0 : 1;
}
