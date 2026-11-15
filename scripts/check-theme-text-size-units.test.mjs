// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Text size unit guard for the first-party themes.
 *
 * A text size the person set wins (spec:AST-102 FR3). A larger default font
 * size in the browser reaches theme text only through rem: a theme that pins
 * a text or font size in px keeps that text at its size whatever the person
 * set.
 *
 * @input Every first-party theme package, as `listThemeSlugs()` finds them.
 * @output Fails when a theme sets a `--text-*-size` or `--font-size-*` token
 *   in px.
 * @position Repo-level guard, sibling of the other scripts/check-*.
 */

import {describe, it, expect} from 'vitest';
import {listThemeSlugs} from './generate-cli-themes.mjs';

const SIZE_TOKEN = /^--(?:text-[a-z0-9-]+-size|font-size-[a-z0-9-]+)$/;

/** The export name of a theme package's theme object (`stone` → `stoneTheme`). */
function themeExportName(slug) {
  return `${slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Theme`;
}

/** Every size token a theme sets, wherever the theme object keeps it. */
function sizeTokensOf(value, out = []) {
  if (value == null || typeof value !== 'object') return out;
  for (const [key, entry] of Object.entries(value)) {
    if (SIZE_TOKEN.test(key)) out.push([key, entry]);
    else if (typeof entry === 'object') sizeTokensOf(entry, out);
  }
  return out;
}

const slugs = listThemeSlugs();

describe('first-party theme text sizes follow the size the person set', () => {
  it('finds the first-party themes', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  for (const slug of slugs) {
    it(`${slug} sets no text or font size in px`, async () => {
      const name = themeExportName(slug);
      const module = await import(`../packages/themes/${slug}/src/${name}.ts`);
      const pinned = sizeTokensOf(module[name]).filter(([, entry]) =>
        (Array.isArray(entry) ? entry : [entry]).some(
          v => typeof v === 'string' && /\d(?:\.\d+)?px\b/.test(v),
        ),
      );
      expect(pinned).toEqual([]);
    });
  }
});
