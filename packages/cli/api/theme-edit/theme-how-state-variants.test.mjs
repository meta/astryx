// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` steps a part's text in a state ("disabled button text
 * lighter") from each variant's own color, scoped to that variant and the
 * state, so every variant moves the way asked: never one variant's color
 * written on all of them.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-state-variants-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const first = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor set /.test(c)),
  );
  return (r?.commands ?? []).filter(c => / editor set /.test(c));
};

describe('a state on a part with variants', () => {
  it.each([
    ['make the disabled button text lighter', 'lighter'],
    ['make the disabled button text darker', 'darker'],
  ])(
    '%s: each variant from its own color, in the state, the way asked',
    async (q, _way, test) => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const cs = await first(q);
      expect(cs.length).toBeGreaterThan(1);
      for (const c of cs) {
        expect(c).toMatch(/--when variant:[a-z]+ --state disabled/);
      }
      // Each variant's step is its own: secondary (the main text color)
      // and primary (its on-accent) never take one shared value.
      const value = (/** @type {string} */ v, /** @type {string} */ m) =>
        cs
          .find(c => c.includes(`variant:${v} `) && c.includes(`--mode ${m}`))
          ?.match(/color '(#[0-9a-f]+)'/)?.[1];
      for (const m of ['light', 'dark']) {
        const [s2, p2] = [value('secondary', m), value('primary', m)];
        if (s2 && p2) expect(s2, `${q} ${m}`).not.toBe(p2);
      }
      expect(
        new Set(cs.map(c => /variant:([a-z]+)/.exec(c)?.[1])).size,
      ).toBeGreaterThan(1);
    },
    300_000,
  );
});
