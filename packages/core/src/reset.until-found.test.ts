// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Static guard for the reset's `[hidden]` rule and `hidden="until-found"`.
 *
 * The browser hides until-found content with `content-visibility: hidden`,
 * which find in page and text fragments can search and reveal. A
 * `display: none` that also matches it takes the content out of both.
 * reset.until-found.a11y.browser.spec.ts measures the result in a browser.
 */

import fs from 'fs';
import path from 'path';

import {describe, expect, it} from 'vitest';

describe('reset.css and hidden="until-found"', () => {
  it('sets display: none only on hidden elements that are not until-found', () => {
    const stripped = fs
      .readFileSync(path.resolve(__dirname, './reset.css'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const hiddenRules = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, selector, body]) => ({selector: selector.trim(), body}))
      .filter(({selector}) => selector.includes('[hidden'));
    expect(hiddenRules.length).toBeGreaterThan(0);
    for (const {selector, body} of hiddenRules) {
      if (/display:\s*none/.test(body)) {
        expect(selector).toContain(":not([hidden='until-found' i])");
      }
    }
  });
});
