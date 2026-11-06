// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Text size unit guard for the first-party themes.
 *
 * A text size the person set wins (spec:AST-102 FR3): the browser's default
 * font size, zoom and the Android font scale reach text only through rem. A
 * theme that pins a text or font size in px keeps that text at its size
 * whatever the person set.
 *
 * @input The seven first-party theme objects.
 * @output Fails when a theme sets a `--text-*-size` or `--font-size-*` token
 *   in px.
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

const SIZE_TOKEN = /^--(?:text-[a-z0-9-]+-size|font-size-[a-z0-9-]+)$/;

/** Every token value a theme sets, wherever the theme object keeps it. */
function tokensOf(value, out = []) {
  if (value == null || typeof value !== 'object') return out;
  for (const [key, entry] of Object.entries(value)) {
    if (SIZE_TOKEN.test(key)) out.push([key, entry]);
    else if (typeof entry === 'object') tokensOf(entry, out);
  }
  return out;
}

describe('first-party theme text sizes follow the size the person set', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    it(`${name} sets no text or font size in px`, () => {
      const pinned = tokensOf(theme).filter(([, entry]) =>
        (Array.isArray(entry) ? entry : [entry]).some(
          v => typeof v === 'string' && /\d(?:\.\d+)?px\b/.test(v),
        ),
      );
      expect(pinned).toEqual([]);
    });
  }
});
