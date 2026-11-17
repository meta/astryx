// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An offer in an `editor how` answer (more than the ask, such as the
 * colored card variants changed too) is marked `offer: true`, follows every
 * other result, and is never the first result: running the first result's
 * commands, the documented path, never runs an offer. Where what the ask
 * writes is in place already, the first result says so with no command.
 *
 * @position api/theme-edit — tests
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
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-offers-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('fresh', {cwd, like: 'neutral'});
  await themeEditNew('white', {cwd, like: 'neutral'});
  for (const v of ['default', 'transparent', 'muted'])
    await themeEditSet('white', 'background-color', '#ffffff', {
      cwd,
      on: 'card',
      when: `variant:${v}`,
      mode: 'light',
    });
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} theme @param {string} q */
const results = async (theme, q) =>
  /** @type {Array<{text: string, commands: string[], offer?: boolean}>} */ (
    (await themeEditHow(q, {cwd, theme})).data.results ?? []
  );

describe('offers follow the answer', () => {
  it.each(['fresh', 'white'])(
    'on %s, the first result never runs an offer, and offers come last',
    async (theme, test) => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const r = await results(theme, 'card background #ffffff');
      const offers = r.filter(x => x.offer);
      expect(offers.length).toBeGreaterThan(0);
      expect(r[0].offer).toBeUndefined();
      const offered = new Set(offers.flatMap(x => x.commands));
      for (const c of r[0].commands) expect(offered.has(c)).toBe(false);
      for (const c of r[0].commands) expect(c).not.toMatch(/variant:blue/);
      const firstOffer = r.findIndex(x => x.offer);
      expect(r.slice(firstOffer).every(x => x.offer)).toBe(true);
    },
    300_000,
  );

  it('says the asked value is in place already, first, with no command', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const r = await results('white', 'card background #ffffff');
    expect(r[0].text).toMatch(
      /^already #ffffff on the card in white, nothing to change/,
    );
    expect(r[0].commands).toEqual([]);
  }, 300_000);

  it('the line that drops a mode is offered, never in the whole', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const r = await results(
      'fresh',
      'warm sand page background in light mode, relaxed dark mode for night browsing',
    );
    const dropping = r.filter(x =>
      x.commands.some(c => / mode dark-only$/.test(c)),
    );
    expect(dropping.length).toBeGreaterThan(0);
    for (const x of dropping) expect(x.offer).toBe(true);
    expect(r[0].commands.some(c => / --color-background-body /.test(c))).toBe(
      true,
    );
  }, 300_000);
});
