// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Secondary selector trigger parity guard.
 *
 * AST-079 FR2 (and Selector DD1) require the `secondary` trigger of Selector,
 * MultiSelector, and ComplexSelector to match the active theme's secondary
 * Button. Themes restyle the Button through `components.button`, and that rule
 * reaches only Buttons, so a theme that restyles its secondary Button must give
 * the three selector targets the same `variant:secondary` treatment. A theme
 * that leaves the Button at its default leaves the selectors at theirs. The
 * selector copy keeps its border off triggers inside an InputGroup (FR6) and
 * its hover off disabled and read-only triggers.
 *
 * @input The seven first-party theme objects.
 * @output Fails when a selector target's `variant:secondary` differs from the
 *   theme's secondary Button entry.
 * @position Repo-level guard, sibling of the other scripts/check-*.
 */

import {describe, it, expect} from 'vitest';
import {butterTheme} from '../packages/themes/butter/src/butterTheme.ts';
import {chocolateTheme} from '../packages/themes/chocolate/src/chocolateTheme.ts';
import {gothicTheme} from '../packages/themes/gothic/src/gothicTheme.ts';
import {matchaTheme} from '../packages/themes/matcha/src/matchaTheme.ts';
import {neutralTheme} from '../packages/themes/neutral/src/neutralTheme.ts';
import {stoneTheme} from '../packages/themes/stone/src/stoneTheme.ts';
import {y2kTheme} from '../packages/themes/y2k/src/y2kTheme.ts';

const THEMES = {
  butter: butterTheme,
  chocolate: chocolateTheme,
  gothic: gothicTheme,
  matcha: matchaTheme,
  neutral: neutralTheme,
  stone: stoneTheme,
  y2k: y2kTheme,
};

const SELECTOR_TARGETS = ['selector', 'multi-selector', 'complex-selector'];
/**
 * Selector and MultiSelector triggers inside an InputGroup keep the neutral
 * fill and the group's edges (FR6), so their treatment applies outside one.
 */
const OUTSIDE_INPUT_GROUP = ':not(.astryx-input-group *)';
/** Hover scopes that keep the Button's hover off disabled and read-only triggers. */
const HOVER_SCOPES = {
  selector:
    ':hover:not([data-disabled], [data-readonly], .astryx-input-group *)',
  'multi-selector':
    ':hover:not([data-disabled], [data-readonly], .astryx-input-group *)',
  'complex-selector':
    ':hover:not(:has(> :is(:disabled, [aria-disabled="true"])))',
};
const GROUPED_TARGETS = new Set(['selector', 'multi-selector']);

/** Split a style entry into resting declarations and its `:hover` block. */
function splitButton(entry = {}) {
  const resting = {};
  let hover;
  for (const [key, value] of Object.entries(entry)) {
    if (key === ':hover') hover = value;
    else resting[key] = value;
  }
  return {resting, hover};
}

/**
 * Read a selector entry back as the treatment a standalone, enabled, editable
 * trigger gets: its resting declarations and its hover.
 */
function readSelector(entry = {}, target) {
  const resting = {};
  let hover;
  for (const [key, value] of Object.entries(entry)) {
    if (key === HOVER_SCOPES[target]) hover = value;
    else if (GROUPED_TARGETS.has(target) && key === OUTSIDE_INPUT_GROUP) {
      Object.assign(resting, value);
    } else if (key.startsWith(':') || GROUPED_TARGETS.has(target)) {
      // A grouped target may only style outside an InputGroup.
      throw new Error(`${target}: unexpected key ${key}`);
    } else resting[key] = value;
  }
  return {resting, hover};
}

describe('secondary selector triggers match the secondary Button', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const button = theme.components?.button?.['variant:secondary'];
    for (const target of SELECTOR_TARGETS) {
      it(`${name}: ${target}`, () => {
        const entry = theme.components?.[target]?.['variant:secondary'];
        if (button === undefined) {
          // A theme that leaves the Button at its default leaves the selectors
          // at theirs.
          expect(entry).toBeUndefined();
          return;
        }
        expect(readSelector(entry, target)).toEqual(splitButton(button));
      });
    }
  }
});
