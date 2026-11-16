// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads a motion effect ("fade in", "slide in") apart
 * from a speed: it says what the part does now, from Core's own keyframes
 * and transitions, and writes nothing; "faster" and "slower" step the
 * motion the part has from the time it takes now.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {coreKeyframes} from './_parts.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt157-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'q'});
  const results = data.results ?? [];
  return {
    first: (
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? []
    ).map(c => c.replace(/^.* editor /, '')),
    text: results.map(r => r.text).join('\n'),
  };
};

const T = 120_000;

describe('a motion effect is not a speed', () => {
  it(
    'fade in tooltips: the tooltip fades in already, nothing is written',
    async () => {
      for (const q of ['fade in tooltips', 'make tooltips fade in']) {
        const r = await answer(q);
        expect(r.first).toEqual([]);
        expect(r.text).toMatch(/tooltip fades in already, as Core draws it/);
      }
    },
    T,
  );
  it(
    'an effect the part does not use is refused with the reason',
    async () => {
      const r = await answer('slide in dialogs');
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/not which effect a part uses/);
    },
    T,
  );
  it(
    'faster and slower step the motion the part has, from its time now',
    async () => {
      const r = await answer('make tooltip transitions faster');
      expect(r.first[0]).toMatch(
        /^set q animation-duration \d+ms --on tooltip$/,
      );
      expect(r.text).toMatch(/\(now \d+ms\)/);
    },
    T,
  );
  it('reads what a keyframes rule of Core animates', () => {
    expect(coreKeyframes({req: {resolve: () => '/nonexistent'}}, 'x')).toEqual({
      props: [],
      transforms: [],
    });
  });
});
