// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A part word is a word of its own: one half of a hyphenated compound
 * ("field-service") names no part, and the ask is the whole theme's.
 * Against real bundled base themes.
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-compound-words-', FIXTURE_PACKAGES);
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

describe('a hyphenated compound', () => {
  it('names no part with one of its halves', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'neutral'});
    const app = await answer(
      'field-service mobile app used outdoors: large bold text, thick borders',
      'w',
    );
    expect(app.writes.join('\n')).not.toMatch(/--on (?:inputs|text-input)/);
    expect(app.writes.join('\n')).toMatch(/--border-width 2px/);
    // (The part named as a word of its own is still that part.)
    const fields = await answer('make the fields thick-bordered and bold', 'w');
    expect(fields.writes.join('\n')).toMatch(/--on inputs/);
    expect(
      (await answer('make the form fields bold', 'w')).writes.join('\n'),
    ).toMatch(/font-weight 700 --on inputs/);
  }, 240_000);
});
