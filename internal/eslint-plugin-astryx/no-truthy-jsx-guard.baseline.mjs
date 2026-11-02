// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-truthy-jsx-guard.baseline.mjs
 * @description Writes (or, with --check, verifies) the baseline that
 * `@astryx/no-truthy-jsx-guard` allows: each guarded ReactNode value, per
 * file, once per truthiness guard that predates the rule. Run it after
 * moving guards to `isRenderable`, or after merging main into a branch that
 * changes the rule, so the list only names guards that still exist.
 *
 *   node internal/eslint-plugin-astryx/no-truthy-jsx-guard.baseline.mjs [--check]
 */

import path from 'node:path';
import {scope} from './no-truthy-jsx-guard.js';
import {runRuleBaseline} from './rule-baseline.mjs';

await runRuleBaseline({
  ruleId: '@astryx/no-truthy-jsx-guard',
  scope,
  targets: ['packages/core/src'],
  baselineFile: path.join(
    import.meta.dirname,
    'no-truthy-jsx-guard.baseline.json',
  ),
  entryFromMessage: message => /^`([^`]*)`/.exec(message)?.[1] ?? null,
  unique: false,
  noun: 'truthiness guards',
});
