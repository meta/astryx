// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-raw-private-attribute.baseline.mjs
 * @description Writes (or, with --check, verifies) the baseline that
 * `@astryx/no-raw-private-attribute` allows: each private `data-astryx-*`
 * attribute, per file, once per site that writes it by hand today. Run it
 * after moving sites into an owner module under
 * `packages/core/src/privateAttributes`, or after merging main into a branch
 * that changes the rule, so the list only names sites that still exist.
 *
 *   node internal/eslint-plugin-astryx/no-raw-private-attribute.baseline.mjs [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import {scope} from './no-raw-private-attribute.js';
import {runRuleBaseline} from './rule-baseline.mjs';

const root = path.resolve(import.meta.dirname, '../..');

await runRuleBaseline({
  ruleId: '@astryx/no-raw-private-attribute',
  scope,
  targets: fs
    .readdirSync(path.join(root, 'packages'))
    .filter(name => fs.existsSync(path.join(root, 'packages', name, 'src')))
    .map(name => `packages/${name}/src`),
  baselineFile: path.join(
    import.meta.dirname,
    'no-raw-private-attribute.baseline.json',
  ),
  // Owner-module reports (an exported name) start differently and are never
  // baselined.
  entryFromMessage: message => /^`(data-astryx-[^`]*)`/.exec(message)?.[1] ?? null,
  unique: false,
  noun: 'private-attribute sites',
});
