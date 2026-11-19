// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A padding set on card names the cards drawn as cards that it cannot
 * reach (a clickable card, a selectable card draw their padding with no
 * variable a theme sets), with no line, instead of counting them as reached
 * and offering a keep line that would take their padding away. Against a
 * real bundled base theme.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-card-padding-', FIXTURE_PACKAGES);
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

/** @param {string} slug @param {string} part */
const rulesOf = (slug, part) =>
  (
    fs
      .readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
      .match(new RegExp(`\\.astryx-${part}\\b[^{]*\\{[^}]*\\}`, 'g')) ?? []
  ).join('\n');

describe('a padding on card', () => {
  it('names the cards drawn as cards it cannot reach, and offers no line for them', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('c', 'padding', '24px', {cwd, on: 'card'})
    );
    const notes = r.data.notes.join('\n');
    expect(notes).toMatch(
      /padding on card does not reach clickable-card, selectable-card/,
    );
    // (Never counted as reached, and no keep line that would zero them.)
    expect(notes).not.toMatch(/also reaches [^\n]*clickable-card/);
    expect(notes).not.toMatch(/padding initial --on clickable-card/);
    expect(rulesOf('c', 'card')).toMatch(/24px/);
  }, 240_000);
});
