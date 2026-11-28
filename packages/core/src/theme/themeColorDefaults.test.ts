// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core color defaults that a Theme declares again
 * @input colorDefaults from tokens.stylex.ts
 * @output Proof that every Core color default differs by color mode, directly
 *   through `light-dark()` or through the defaults it references
 * @position packages/core/src/theme — guards the set that Theme.tsx declares
 *   again on each wrapper that applies a theme
 */

import {describe, expect, it} from 'vitest';
import {colorDefaults} from './tokens.stylex';

const defaults: Record<string, string> = colorDefaults;

/** Whether a default's value differs by color mode, following its `var()`s. */
function differsByMode(name: string, seen = new Set<string>()): boolean {
  const value = defaults[name];
  if (value == null || seen.has(name)) {
    return false;
  }
  if (value.includes('light-dark(')) {
    return true;
  }
  const references = [...value.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]);
  seen.add(name);
  return (
    references.length > 0 &&
    references.every(reference => differsByMode(reference, seen))
  );
}

describe('Core color defaults', () => {
  it('each differ by color mode, so a Theme that applies a theme declares them all again', () => {
    const fixed = Object.keys(defaults).filter(name => !differsByMode(name));
    expect(
      fixed,
      'These color defaults do not differ by color mode. Theme.tsx declares ' +
        'every color default again on each wrapper that applies a theme, so ' +
        "that each one resolves in that wrapper's mode. A default that does " +
        'not differ by mode gains nothing from that and stops a page-root ' +
        'override from reaching a themed region. Move it out of ' +
        'colorDefaults into its own token group, or give it a light and a ' +
        'dark value.',
    ).toEqual([]);
  });

  it('follows a default through the defaults it references', () => {
    expect(defaults['--color-text-info']).toBe('var(--color-text-blue)');
    expect(differsByMode('--color-text-info')).toBe(true);
    expect(differsByMode('--color-icon-info')).toBe(true);
  });
});
