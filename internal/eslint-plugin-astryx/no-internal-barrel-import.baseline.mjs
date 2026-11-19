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
import {scope} from './no-internal-barrel-import.js';
import {runRuleBaseline} from './rule-baseline.mjs';

const root = path.resolve(import.meta.dirname, '../..');

await runRuleBaseline({
  ruleId: '@astryx/no-internal-barrel-import',
  scope,
  targets: fs
    .readdirSync(path.join(root, 'packages'))
    .filter(name => fs.existsSync(path.join(root, 'packages', name, 'src')))
    .map(name => `packages/${name}/src`),
  baselineFile: path.join(
    import.meta.dirname,
    'no-internal-barrel-import.baseline.json',
  ),
  entryFromMessage: message => /'([^']+)'/.exec(message)?.[1] ?? null,
  unique: true,
  noun: 'barrel imports',
});
