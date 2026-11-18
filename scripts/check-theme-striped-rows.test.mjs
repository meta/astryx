// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check-theme-striped-rows.test.mjs
 * @input Each first-party theme's component CSS, generated from its source
 * @output Fails when a theme's even-row table rule can match a plain table
 * @position A theme's striped-row rule paints the stripe's text; on a plain
 *   table inside a coloured card that text does not read, so the rule must
 *   name the row's `striped` state.
 */

import {describe, expect, it} from 'vitest';
import {generateThemeCSS} from '../packages/core/dist/theme/index.js';
import {FIRST_PARTY_THEMES} from './lib/theme-contrast.mjs';

/** The selectors of every rule in `css` that targets an even table row. */
function evenRowSelectors(css) {
  return [...css.matchAll(/([^{}]+)\{/g)]
    .map(match => match[1].trim())
    .filter(
      selector =>
        selector.includes('.astryx-table-row') &&
        selector.includes(':nth-child(even'),
    );
}

describe("a theme's striped-row rule", () => {
  it.each(Object.entries(FIRST_PARTY_THEMES))(
    '%s paints even rows only in a striped table',
    (_, theme) => {
      for (const selector of evenRowSelectors(
        generateThemeCSS(theme).component,
      ))
        expect(selector).toContain('[data-striped="striped"]');
    },
  );

  it('finds the striped-row rule in the themes that repaint a stripe', () => {
    const withRule = Object.entries(FIRST_PARTY_THEMES).filter(
      ([, theme]) =>
        evenRowSelectors(generateThemeCSS(theme).component).length > 0,
    );
    expect(withRule.map(([name]) => name).sort()).toEqual([
      'butter',
      'gothic',
      'y2k',
    ]);
  });
});
