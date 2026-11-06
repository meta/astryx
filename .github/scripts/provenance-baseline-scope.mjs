// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file provenance-baseline-scope.mjs
 * @input A file that lists changed paths, one per line.
 * @output Exit 0 when a change can make the comment-provenance baseline
 *   stale: it touches a file the baseline lists, the baseline, or the rule
 *   and its baseline tooling. Exit 1 otherwise.
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
  'eslint.config.js',
];

/**
 * @param {string[]} changed
 * @param {Record<string, unknown>} baseline
 */
export function touchesBaseline(changed, baseline) {
  const listed = new Set([...Object.keys(baseline), ...RULE_FILES]);
  return changed.some(file => listed.has(file));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const changed = fs
    .readFileSync(process.argv[2], 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const baseline = JSON.parse(
    fs.readFileSync(path.join(ROOT, BASELINE), 'utf8'),
  );
  process.exitCode = touchesBaseline(changed, baseline) ? 0 : 1;
}
