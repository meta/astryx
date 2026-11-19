// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A theme that takes away the elevation shadows keeps an edge on the
 * floating surfaces that drew no border (an open menu, a popover): the
 * theme's border, named with the line that keeps one bare. A border or
 * shadow of the part's own wins; a theme border width frames them already.
 * Against a real bundled base theme.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-shadowless-edges-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** @param {string} theme */
const cssOf = theme =>
  fs.readFileSync(path.join(cwd, 'themes', theme, `${theme}.css`), 'utf8');

/** The rules on a part, every condition. @param {string} css @param {string} part */
const rulesOf = (css, part) =>
  (
    css.match(new RegExp(`\\.astryx-${part}\\b[^{]*\\{[^}]*\\}`, 'g')) ?? []
  ).join('\n');

describe('a theme with no elevation shadows', () => {
  it('keeps an edge on the floating surfaces, named, and a part setting wins', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('fl', {cwd, like: 'neutral'});
    const r = await themeEditSet('fl', '--shadow-med', 'none', {cwd});
    const note = r.data.notes.join(' ');
    expect(note).toMatch(/keep an edge at the theme's border \(([^)]*)\)/);
    const edged = /** @type {string} */ (
      /keep an edge at the theme's border \(([^)]*)\)/.exec(note)?.[1] ?? ''
    ).split(', ');
    expect(edged.length).toBeGreaterThan(0);
    const css = cssOf('fl');
    for (const p of edged)
      expect(rulesOf(css, p), p).toMatch(
        /border: var\(--border-width\) solid var\(--color-border\)/,
      );
    await themeEditSet('fl', 'border', 'none', {cwd, on: edged[0]});
    expect(rulesOf(cssOf('fl'), edged[0])).not.toMatch(
      /border: var\(--border-width\) solid/,
    );
  }, 240_000);
});
