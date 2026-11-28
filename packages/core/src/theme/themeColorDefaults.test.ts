// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core color defaults that a Theme declares again
 * @input colorDefaults from tokens.stylex.ts; coreColorDefaultValues from
 *   themeColorDefaults.stylex.ts
 * @output Proof that the theme Theme.tsx applies on each themed wrapper holds
 *   every Core color default, with its current value
 * @position packages/core/src/theme — guards themeColorDefaults.stylex.ts
 */

import {describe, expect, it} from 'vitest';
import {colorDefaults} from './tokens.stylex';
import {coreColorDefaultValues} from './themeColorDefaults.stylex';

describe('Core color defaults that a Theme declares again', () => {
  it('are every color default, with its current value', () => {
    expect(
      coreColorDefaultValues,
      'Copy colorDefaults from tokens.stylex.ts into ' +
        'themeColorDefaults.stylex.ts. A themed wrapper declares every ' +
        'color default again. A partial set would mix Core values with the ' +
        "page theme's inside a nested Theme, such as Core's accent under the " +
        "page theme's on-accent color.",
    ).toEqual(colorDefaults);
  });
});
