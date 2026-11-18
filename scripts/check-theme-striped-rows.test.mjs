// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check-theme-striped-rows.test.mjs
 * @input Each first-party theme's generated component CSS
 * @output Fails when a theme's even-row table rule can match a plain table
 * @position A theme's striped-row rule paints the stripe's text; on a plain
 *   table inside a coloured card that text does not read, so the rule must
 *   name the table's `striped` state.
 */

import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEMES = join(ROOT, 'packages/themes');

/** Every official theme's built `theme.css`, keyed by theme name. */
function builtThemes() {
  return readdirSync(THEMES, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => [entry.name, join(THEMES, entry.name, 'dist/theme.css')])
    .filter(([, file]) => existsSync(file));
}

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
  const themes = builtThemes();

  it('finds built themes to check', () => {
    expect(themes.length).toBeGreaterThan(0);
  });

  it.each(themes)('%s paints even rows only in a striped table', (_, file) => {
    const css = readFileSync(file, 'utf8');
    for (const selector of evenRowSelectors(css))
      expect(selector).toContain('[data-striped="striped"]');
  });
});
