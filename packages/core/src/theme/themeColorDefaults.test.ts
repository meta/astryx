// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core color defaults that a Theme declares again
 * @input colorDefaults from tokens.stylex.ts; coreColorDefaultValues from
 *   themeColorDefaults.stylex.ts
 * @output Proof that the theme Theme.tsx applies on each themed wrapper holds
 *   exactly the defaults that differ by color mode, with their current values
 * @position packages/core/src/theme — guards themeColorDefaults.stylex.ts
 */

import {createRequire} from 'node:module';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {colorDefaults} from './tokens.stylex';
import {coreColorDefaultValues} from './themeColorDefaults.stylex';

// lightningcss is the CSS transformer the build uses. Core does not depend on
// it; @astryxdesign/build does, so it resolves from that package.
interface LightningCss {
  transform(options: {filename: string; code: Uint8Array; minify: boolean}): {
    code: Uint8Array;
  };
}
const lightningcss = createRequire(
  path.resolve(__dirname, '../../../build/package.json'),
)('lightningcss') as LightningCss;

const defaults: Record<string, string> = colorDefaults;

/** A color as the build writes it, so equal colors compare equal. */
function normalized(color: string): string {
  return lightningcss
    .transform({
      filename: 'color.css',
      code: Buffer.from(`a{color:${color}}`),
      minify: true,
    })
    .code.toString();
}

/** The two arguments of a `light-dark()` value, or null. */
function modeValues(value: string): [string, string] | null {
  if (!value.startsWith('light-dark(') || !value.endsWith(')')) {
    return null;
  }
  const inner = value.slice('light-dark('.length, -1);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const character = inner[i];
    if (character === '(') {
      depth++;
    } else if (character === ')') {
      depth--;
    } else if (character === ',' && depth === 0) {
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
    }
  }
  return null;
}

/** Whether a default's value differs by color mode, following its `var()`s. */
function differsByMode(name: string, seen = new Set<string>()): boolean {
  const value = defaults[name];
  if (value == null || seen.has(name)) {
    return false;
  }
  const modes = modeValues(value);
  if (modes != null) {
    return normalized(modes[0]) !== normalized(modes[1]);
  }
  const references = [...value.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]);
  seen.add(name);
  return (
    references.length > 0 &&
    references.every(reference => differsByMode(reference, seen))
  );
}

describe('Core color defaults that a Theme declares again', () => {
  it('are exactly the defaults that differ by color mode', () => {
    const expected = Object.keys(defaults)
      .filter(name => differsByMode(name))
      .sort();
    expect(
      Object.keys(coreColorDefaultValues).sort(),
      'themeColorDefaults.stylex.ts must hold every color default whose ' +
        'light and dark values differ, and every `var()` default that ' +
        'resolves only to such defaults. A default with one value in both ' +
        'modes stays out: declaring it again on a themed wrapper changes ' +
        'nothing but stops a page-root override from reaching the theme. ' +
        'Add or remove the default there to match colorDefaults.',
    ).toEqual(expected);
  });

  it('copy the values in colorDefaults', () => {
    const drifted = Object.entries(coreColorDefaultValues)
      .filter(([name, value]) => defaults[name] !== value)
      .map(([name]) => name);
    expect(
      drifted,
      'Copy these values from colorDefaults in tokens.stylex.ts into ' +
        'themeColorDefaults.stylex.ts.',
    ).toEqual([]);
  });

  it('compare the two modes as the build writes them, and follow a `var()`', () => {
    expect(differsByMode('--color-accent')).toBe(true);
    expect(differsByMode('--color-on-accent')).toBe(false);
    expect(defaults['--color-text-info']).toBe('var(--color-text-blue)');
    expect(differsByMode('--color-text-info')).toBe(true);
  });
});
