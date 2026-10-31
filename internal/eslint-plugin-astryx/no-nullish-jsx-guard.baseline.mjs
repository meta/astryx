// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-nullish-jsx-guard.baseline.mjs
 * @description Writes (or, with --check, verifies) the baseline that
 * `@astryx/no-nullish-jsx-guard` allows: each guarded value, per file, once
 * per bare nullish JSX guard or hand-written isRenderable check of it today.
 * Run it after migrating checks to isRenderable, or after merging main into a
 * branch that changes the rule, so the list only names checks that still
 * exist.
 *
 *   node internal/eslint-plugin-astryx/no-nullish-jsx-guard.baseline.mjs [--check]
 */

import path from 'node:path';
import {scope} from './no-nullish-jsx-guard.js';
import {runRuleBaseline} from './rule-baseline.mjs';

await runRuleBaseline({
  ruleId: '@astryx/no-nullish-jsx-guard',
  scope,
  targets: ['packages/core/src', 'packages/richtext/src'],
  baselineFile: path.join(
    import.meta.dirname,
    'no-nullish-jsx-guard.baseline.json',
  ),
  entryFromMessage: message =>
    /`!?isRenderable\(([^`]*)\)`/.exec(message)?.[1] ?? null,
  unique: false,
  noun: 'guarded-value checks',
});
