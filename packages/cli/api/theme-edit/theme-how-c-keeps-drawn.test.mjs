// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` holds a kept look to what it drew before, wherever
 * Core wrote it (beside the variant and size), so a status except on
 * inputs answers on every base; reads "invalid" as the error status in an
 * except or a keep; and says an unknown subject of a later clause ("the
 * gizmo red") instead of giving it the part of the clause before.
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
  cwd = makeLinkedFixture('astryx-theme-how-c-keeps-drawn-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditNew('s', {cwd, like: 'stone'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q @param {string} theme */
const answer = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const results = data.results ?? [];
  const sets = (/** @type {string[]} */ cs) =>
    cs
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, ''));
  return {
    first: sets(
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? [],
    ),
    all: sets(results.flatMap(r => r.commands)),
    text: results.map(r => r.text).join('\n'),
  };
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

const T = 300_000;

describe('a status kept on inputs', () => {
  it.each([
    ['remove the border from inputs except error inputs', 'border'],
    ['make inputs blue but keep the error border', 'background-color'],
    ['text fields red except the error ones', 'background-color'],
    ['make inputs red except when invalid', 'background-color'],
    ['make inputs red but keep the error state', 'background-color'],
  ])(
    '%s: answered on neutral and stone, the error look kept',
    async (q, thing, test) => {
      needsBases(test);
      for (const theme of ['n', 's']) {
        const r = await answer(q, theme);
        expect(r.text, `${theme}: ${q}`).not.toMatch(/couldn't work out/);
        expect(r.text, `${theme}: ${q}`).not.toMatch(/cannot be kept apart/);
        const pins = r.first.filter(c => /--when status:error/.test(c));
        expect(pins.length, `${theme}: ${q}`).toBeGreaterThan(0);
        for (const c of pins) expect(c).toMatch(new RegExp(`^${thing} `));
        // (A member with no error look of its own takes no pin.)
        for (const c of pins) expect(c).not.toMatch(/--on date-time-input/);
      }
    },
    T,
  );
});

describe('an unknown subject in a later clause', () => {
  it(
    'is said, never given the part before',
    async test => {
      needsBases(test);
      const r = await answer('make cards rounder and the gizmo red', 'n');
      expect(r.text).toMatch(/no part is called "gizmo"/);
      expect(r.all).toContain('corners more --on card');
      expect(r.all.join('\n')).not.toMatch(
        /background-color '#dc2626' --on card/,
      );
      // (A known part, or none, still takes the ask.)
      expect(
        (await answer('make cards rounder and the buttons red', 'n')).first,
      ).toContain("background-color '#dc2626' --on button");
    },
    T,
  );
});
