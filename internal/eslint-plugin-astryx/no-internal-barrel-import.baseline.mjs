// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-internal-barrel-import.baseline.mjs
 * @description Writes (or, with --check, verifies) the baseline of barrel
 * imports that `@astryx/no-internal-barrel-import` allows: every relative
 * import in shipped `packages/*\/src` source that resolves to a folder's index
 * today. Run it after merging main into a branch that changes the rule's
 * scope, or after a codemod removes barrel imports, so the list only ever
 * names imports that still exist.
 *
 *   node internal/eslint-plugin-astryx/no-internal-barrel-import.baseline.mjs [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import {ESLint} from 'eslint';
import {scope} from './no-internal-barrel-import.js';

const root = path.resolve(import.meta.dirname, '../..');
const baselineFile = path.join(
  import.meta.dirname,
  'no-internal-barrel-import.baseline.json',
);
const ruleId = '@astryx/no-internal-barrel-import';

// Lint with the repo config, but with an empty baseline, so every barrel
// import in scope is reported once.
const eslint = new ESLint({
  cwd: root,
  // Some packages' sources are ignored by the repo config entirely.
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
const packages = fs
  .readdirSync(path.join(root, 'packages'))
  .filter(name => fs.existsSync(path.join(root, 'packages', name, 'src')))
  .map(name => `packages/${name}/src`);
const results = await eslint.lintFiles(packages);

const found = new Map();
for (const result of results) {
  for (const message of result.messages) {
    if (message.ruleId !== ruleId) {
      continue;
    }
    const source = /'([^']+)'/.exec(message.message)?.[1];
    const file = path.relative(root, result.filePath).split(path.sep).join('/');
    if (source != null) {
      if (!found.has(file)) {
        found.set(file, new Set());
      }
      found.get(file).add(source);
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
      'no-internal-barrel-import baseline is out of date; run this script without --check.',
    );
    process.exit(1);
  }
  console.log('no-internal-barrel-import baseline is up to date.');
} else {
  fs.writeFileSync(baselineFile, text);
  const imports = Object.values(baseline).reduce(
    (n, list) => n + list.length,
    0,
  );
  console.log(
    `Wrote ${imports} barrel imports in ${found.size} files to ${path.relative(root, baselineFile)}.`,
  );
}
