// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A value drawn on a track (a progress bar's fill) needs 3:1 against
 * the track: a theme that makes it vanish (a black border the track follows
 * and a near-black accent) gets a problem with the nearest track color that
 * reads, and following that line clears it; a slider's thumb, larger than
 * its track, is lost only where it reads on neither the track nor the page.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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

/** The problems show lists for a theme. @param {string} slug */
const problemsOf = async slug => {
  const {data} = /** @type {any} */ (await themeEditShow(slug, {cwd}));
  return /** @type {Array<{problem: string, fix: string | null}>} */ (
    data.openProblems ?? []
  ).map(p => ({text: p.problem, fix: p.fix}));
};

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-d-track-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('t', {cwd, like: 'neutral'});
  // A near-black track under a near-black fill, set on the track itself, so
  // the case does not hang on which token a base theme's track reads.
  await themeEditSet('t', 'accent', '#111111', {cwd});
  await themeEditSet('t', 'background-color', '#1f1f1f', {
    cwd,
    on: 'progress-bar-track',
    mode: 'light',
  });
  await themeEditNew('c', {cwd, like: 'neutral'});
  await themeEditSet('c', 'accent', '#7c3aed', {cwd});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a value drawn on a track', () => {
  it('a progress fill that vanishes on its track is a problem, with the nearest track color that reads', async () => {
    const hit = (await problemsOf('t')).filter(p =>
      /progress-bar-fill .* on the progress-bar-track .* needs 3:1/.test(
        p.text,
      ),
    );
    expect(hit).toHaveLength(1);
    expect(hit[0].text).toMatch(/is 1\.\d+:1 on the progress-bar-track/);
    expect(hit[0].fix).toMatch(
      /set t background-color '#[0-9a-f]{6}' --on progress-bar-track --mode light$/,
    );
    // Following the line clears it.
    const color = /'(#[0-9a-f]{6})'/.exec(String(hit[0].fix))?.[1];
    await themeEditSet('t', 'background-color', String(color), {
      cwd,
      on: 'progress-bar-track',
      mode: 'light',
    });
    expect((await problemsOf('t')).some(p => /on a track/.test(p.text))).toBe(
      false,
    );
  }, 120_000);

  it('a slider thumb that still reads on the page, and a colored accent, are no problem', async () => {
    expect((await problemsOf('c')).some(p => /on a track/.test(p.text))).toBe(
      false,
    );
  }, 120_000);
});
