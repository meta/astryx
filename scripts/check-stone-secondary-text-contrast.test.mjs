// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stone secondary-text contrast guard.
 *
 * `--color-text-secondary` is normal text in core components. Most consumers
 * inherit the body, surface, card, or popover background; others explicitly
 * pair it with muted (`Code`, `InputGroupText`), neutral (`Avatar`, `Kbd`),
 * accent-muted, or interaction-overlay fills. Stone's old T55/T65 pair fell
 * below WCAG AA on several of those resolved surfaces.
 *
 * @input The stone theme's secondary-text token and every stone surface that
 *   core consumers pair it with.
 * @output Fails when a resolved foreground/background pair drops below 4.5:1.
 * @position Repo-level theme contrast guard, sibling of the other scripts/check-*.
 * @see https://github.com/meta/astryx/issues/5505
 */

import {describe, expect, it} from 'vitest';
import {palette as stoneModePalettes} from '../packages/themes/stone/src/stonePalettes.generated.ts';
import {stoneTheme} from '../packages/themes/stone/src/stoneTheme.ts';
import {
  compositeOver,
  contrastRatio,
} from '../packages/core/src/theme/contrast.ts';
import {parseColor} from '../packages/core/src/utils/color.ts';

const MODES = [
  {name: 'light', mode: 'light', index: 0, secondaryTone: 40},
  {name: 'dark', mode: 'dark', index: 1, secondaryTone: 70},
];

/** WCAG 2.1 AA for normal-size text. */
const AA_NORMAL = 4.5;

const SURFACES = [
  '--color-background-surface',
  '--color-background-body',
  '--color-background-card',
  '--color-background-popover',
  '--color-background-muted',
  '--color-neutral',
  '--color-accent-muted',
  '--color-overlay-hover',
  '--color-overlay-pressed',
];

/** Resolve one half of a theme token's `light-dark()` value. */
function resolveToken(name, modeIndex) {
  const value = stoneTheme.tokens?.[name];
  if (typeof value !== 'string') {
    throw new Error(`stone theme does not define ${name}`);
  }
  const match = value.match(/^light-dark\((.+?),\s*(.+)\)$/);
  return match ? match[modeIndex + 1] : value;
}

/** Resolve an opaque rendered surface, flattening alpha fills over surface. */
function resolveSurface(name, modeIndex) {
  const value = parseColor(resolveToken(name, modeIndex));
  const surface = parseColor(
    resolveToken('--color-background-surface', modeIndex),
  );
  if (value === null || surface === null) {
    throw new Error(`could not parse stone ${name} surface`);
  }
  return compositeOver(value, surface);
}

describe('Stone secondary text contrast', () => {
  it.each(MODES)(
    'uses canonical stone contrast tones in $name mode',
    ({index, mode, secondaryTone}) => {
      expect(resolveToken('--color-text-secondary', index)).toBe(
        stoneModePalettes.neutral[mode][secondaryTone],
      );
    },
  );

  it.each(MODES)('meets WCAG AA on every $name consumer surface', ({index}) => {
    const foreground = resolveToken('--color-text-secondary', index);
    const failures = SURFACES.map(name => ({
      name,
      ratio: contrastRatio(foreground, resolveSurface(name, index)),
    }))
      .filter(({ratio}) => ratio < AA_NORMAL)
      .map(({name, ratio}) => `${name} = ${ratio.toFixed(2)}:1`);

    expect(failures).toEqual([]);
  });
});
