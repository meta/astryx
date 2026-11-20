// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-comment-provenance.baseline.mjs
 * @description Writes (or, with --check, verifies) the baseline that
 * `@astryx/no-comment-provenance` allows: each record id, claim id, pull
 * request or issue reference, date stamp, and quote block, per file, once per
 * site that predates the rule. Run it after removing citations, or after
 * merging main into a branch that changes the rule, so the list only names
 * sites that still exist.
 *
 *   node internal/eslint-plugin-astryx/no-comment-provenance.baseline.mjs [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import {scope} from './no-comment-provenance.js';
import {runRuleBaseline} from './rule-baseline.mjs';

const root = path.resolve(import.meta.dirname, '../..');

await runRuleBaseline({
  ruleId: '@astryx/no-comment-provenance',
  scope,
  targets: fs
    .readdirSync(path.join(root, 'packages'))
    .filter(name => fs.existsSync(path.join(root, 'packages', name, 'src')))
    .map(name => `packages/${name}/src`),
  baselineFile: path.join(
    import.meta.dirname,
    'no-comment-provenance.baseline.json',
  ),
  entryFromMessage: message => /^`([^`]*)`/.exec(message)?.[1] ?? null,
  unique: false,
  noun: 'comment provenance sites',
});
