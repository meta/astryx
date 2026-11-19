// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Elements named beside or before a part: an icon in a place takes its
 * color, a part said before its separators owns them, an icon after a
 * part's text is that part's icon. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture(
    'astryx-theme-elements-named-beside-part-',
    FIXTURE_PACKAGES,
  );
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

/** @param {string} q @param {string} theme */
const answer = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return {
    parts: data.understood?.parts ?? [],
    writes: (data.results ?? [])
      .flatMap((/** @type {any} */ r) => r.commands)
      .filter((/** @type {string} */ c) => / editor set /.test(c))
      .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
    text: (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n'),
  };
};

describe('elements beside a part', () => {
  it('reads each where the words put it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c', {cwd, like: 'neutral'});
    // An icon read in a place takes its color, never a box behind it.
    for (const q of [
      'make the chevron in selects blue',
      'make the close icon in dialogs red',
    ])
      for (const w of (await answer(q, 'c')).writes)
        expect(w, q).not.toMatch(/ background-color /);
    // A part said before its separators owns them.
    const dd = await answer('make the dropdown separators gray', 'c');
    expect(dd.writes.join('\n')).not.toMatch(/--on (?:selector|divider)\b/);
    expect(dd.writes.join('\n')).toMatch(/--on dropdown-menu-divider$/m);
    const cm = await answer('make the context menu separators gray', 'c');
    expect(cm.writes.join('\n')).not.toMatch(
      /background-color .* --on context-menu|--on divider\b/,
    );
    // An icon after a part's text is that part's icon.
    const icon = await answer('make the icon after the button text red', 'c');
    expect(icon.writes.length).toBeGreaterThan(0);
    for (const w of icon.writes) expect(w).toMatch(/ --on button$/);
  }, 240_000);
});
