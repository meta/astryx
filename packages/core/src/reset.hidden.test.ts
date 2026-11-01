// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Static guard for the reset's `[hidden]` rule.
 *
 * A zero-specificity rule in the lowest layer loses to any `display` an
 * element's own styles set, so a hidden element with a display class shows.
 * `!important` in the lowest layer outranks every later layer and unlayered
 * rule. reset.hidden.a11y.browser.spec.ts measures the result in a browser.
 */

import fs from 'fs';
import path from 'path';

import {describe, expect, it} from 'vitest';

describe('reset.css [hidden]', () => {
  it('hides hidden elements with an !important display', () => {
    const stripped = fs
      .readFileSync(path.resolve(__dirname, './reset.css'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const hiddenRules = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, selector, body]) => ({selector: selector.trim(), body}))
      .filter(({selector}) => selector.includes('[hidden'));
    expect(hiddenRules.map(({body}) => body.trim())).toEqual([
      'display: none !important;',
    ]);
  });
});
