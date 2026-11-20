// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file press-through-recipes.baseline.mjs
 * @description Writes (or, with --check, verifies) the baseline that
 * `@astryx/press-through-recipes` allows: each press import, pressed state,
 * press attribute and `:active` arm outside the press recipes, per file, once
 * per site that predates the rule. Run it after moving a site into a recipe,
 * or after merging main into a branch that changes the rule, so the list only
 * names sites that still exist.
 *
 *   node internal/eslint-plugin-astryx/press-through-recipes.baseline.mjs [--check]
 */

import path from 'node:path';
import {scope} from './press-through-recipes.js';
import {runRuleBaseline} from './rule-baseline.mjs';

await runRuleBaseline({
  ruleId: '@astryx/press-through-recipes',
  scope,
  targets: ['packages/core/src', 'packages/lab/src'],
  baselineFile: path.join(
    import.meta.dirname,
    'press-through-recipes.baseline.json',
  ),
  entryFromMessage: message => /^`([^`]*)`/.exec(message)?.[1] ?? null,
  unique: false,
  noun: 'press sites outside the recipes',
});
