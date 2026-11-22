// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A clause of the ask counts as used by what read it, never by an
 * answer's own words: "colors" said before "with" and read by nothing is
 * named as not used, even when the border answer's text says "colors".
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
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-unused-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a clause no answer read', () => {
  it('is named as not used, whatever an answer says', async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      ctx.skip();
      return;
    }
    await themeEditNew('u', {cwd, like: 'neutral'});
    // (The border answer's own text says "colors": it was never read from
    // the ask.)
    for (const [q, word] of [
      ['colors with 2px #999999 borders', 'colors'],
      ['controls with 2px #999999 borders', 'controls'],
      ['8px corners, controls with 2px #999999 borders', 'controls'],
    ]) {
      const {data} = await themeEditHow(q, {cwd, theme: 'u'});
      const said = data.results
        .map((/** @type {{text: string}} */ r) => r.text)
        .join('\n');
      expect(said, q).toMatch(new RegExp(`not used: [^\\n]*"${word}"`));
    }
  }, 240_000);
});
