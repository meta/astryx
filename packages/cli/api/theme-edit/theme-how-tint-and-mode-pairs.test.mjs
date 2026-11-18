// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: a text color asked with a fill given for one mode is
 * that mode's on every variant the fill reaches; a tint word tints only the
 * color it modifies, on every line that writes it.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-tint-mode-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** Every set command an answer gives, after the theme name. @param {string} q */
const sets = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return (data.results ?? [])
    .flatMap(r => r.commands)
    .filter(c => / editor set /.test(c))
    .map(c => c.replace(/^.* editor set \S+ /, ''));
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

const T = 300_000;

describe('a text color asked with a fill for one mode', () => {
  it(
    'is that mode only, on every variant the fill reaches',
    async test => {
      needsBases(test);
      const all = await sets(
        'buttons with a navy background in dark mode and white text',
      );
      // (On the variants the dark fill reaches, the white is dark mode's;
      // light mode keeps the secondary and ghost text that reads on their
      // light fills.)
      const white = all.filter(c =>
        /^color '#ffffff' .*variant:(?:secondary|ghost)/.test(c),
      );
      expect(white.length).toBeGreaterThan(0);
      for (const c of white) expect(c).toMatch(/ --mode dark$/);
    },
    T,
  );
});

describe('a tint word', () => {
  it(
    'tints the color it modifies on every line, and leaves another color solid',
    async test => {
      needsBases(test);
      const all = await sets('cards tinted blue with a navy header');
      const fills = all.filter(c => /^background(?:-color)? /.test(c));
      const blue = fills.filter(c => /#2563eb/.test(c));
      const cards = fills.filter(c => / --on card\b/.test(c));
      expect(cards.length).toBeGreaterThan(0);
      for (const c of cards)
        expect(c).toMatch(/color-mix\(in srgb, #2563eb 15%, transparent\)/);
      // (The header the tint does not name is never tinted.)
      for (const c of fills.filter(c => / --on app-shell-header\b/.test(c)))
        expect(c).not.toMatch(/color-mix/);
    },
    T,
  );
});
