// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-nullish-jsx-guard.baseline.mjs
 * @description Writes (or, with --check, verifies) the baseline of guarded
 * values that `@astryx/no-nullish-jsx-guard` allows: every value, per file,
 * that a bare nullish JSX guard or a hand-written isRenderable check tests
 * today. Run it after migrating guards to isRenderable, or after merging main
 * into a branch that changes the rule, so the list only ever names checks that
 * still exist.
 *
 *   node internal/eslint-plugin-astryx/no-nullish-jsx-guard.baseline.mjs [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import {ESLint} from 'eslint';
import {scope} from './no-nullish-jsx-guard.js';

const root = path.resolve(import.meta.dirname, '../..');
const baselineFile = path.join(
  import.meta.dirname,
  'no-nullish-jsx-guard.baseline.json',
);
const ruleId = '@astryx/no-nullish-jsx-guard';

// Lint with the repo config, but with an empty baseline, so every check in
// scope is reported once.
const eslint = new ESLint({
  cwd: root,
  errorOnUnmatchedPattern: false,
  ruleFilter: ({ruleId: id}) => id === ruleId,
  overrideConfig: [
    {
      files: scope.files,
      ignores: scope.ignores,
      rules: {[ruleId]: ['error', {baseline: {}, root}]},
    },
  ],
});
const results = await eslint.lintFiles([
  'packages/core/src',
  'packages/richtext/src',
]);

const found = new Map();
for (const result of results) {
  for (const message of result.messages) {
    if (message.ruleId !== ruleId) {
      continue;
    }
    const value = /`!?isRenderable\(([^`]*)\)`/.exec(message.message)?.[1];
    const file = path.relative(root, result.filePath).split(path.sep).join('/');
    if (value != null) {
      if (!found.has(file)) {
        found.set(file, new Set());
      }
      found.get(file).add(value);
    }
  }
}
const baseline = Object.fromEntries(
  [...found.keys()].sort().map(file => [file, [...found.get(file)].sort()]),
);
const text = `${JSON.stringify(baseline, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = fs.readFileSync(baselineFile, 'utf8');
  if (JSON.stringify(JSON.parse(current)) !== JSON.stringify(baseline)) {
    console.error(
      'no-nullish-jsx-guard baseline is out of date; run this script without --check.',
    );
    process.exit(1);
  }
  console.log('no-nullish-jsx-guard baseline is up to date.');
} else {
  fs.writeFileSync(baselineFile, text);
  const values = Object.values(baseline).reduce(
    (n, list) => n + list.length,
    0,
  );
  console.log(
    `Wrote ${values} guarded values in ${found.size} files to ${path.relative(root, baselineFile)}.`,
  );
}
