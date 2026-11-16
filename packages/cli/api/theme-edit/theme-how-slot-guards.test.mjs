// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` names an unknown word in the part slot, keeps a
 * status except on each group member that draws a border, reads a part's
 * fainter text as its text color's alpha, and keeps a role, a keep and a
 * ground where they are said.
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
  cwd = makeLinkedFixture('astryx-theme-how-slot-guards-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results = data.results ?? [];
  const sets = (/** @type {string[]} */ cs) =>
    cs
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor /, ''));
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

describe('guards', () => {
  it(
    'an unknown word in the part slot is said, never the whole theme',
    async test => {
      needsBases(test);
      for (const [q, word] of [
        ['make the zorp padding bigger', 'zorp'],
        ['remove the shadow from the blorp', 'blorp'],
      ]) {
        const r = await answer(q);
        expect(r.all, q).toEqual([]);
        expect(r.text, q).toMatch(new RegExp(`no part is called "${word}"`));
      }
      // (Known words in the same slot still answer.)
      expect(
        (await answer('make the card padding bigger')).all.length,
      ).toBeGreaterThan(0);
    },
    T,
  );
  it(
    'a status except keeps that status on each member that draws a border',
    async test => {
      needsBases(test);
      const removed = await answer(
        'remove the border from inputs except error inputs',
      );
      expect(removed.first[0]).toBe('set n border none --on inputs');
      expect(removed.first).toContain(
        "set n border '1px solid var(--color-border-error)' --on text-input --when status:error --only",
      );
      expect(removed.first.join('\n')).not.toMatch(/--on date-time-input/);
      const red = await answer('make the input border red except error inputs');
      expect(red.first).toContain(
        "set n border-color 'var(--color-border-error)' --on inputs --when status:error",
      );
    },
    T,
  );
  it(
    "a part's text made fainter is its text color's alpha, never the part's opacity",
    async test => {
      needsBases(test);
      for (const q of [
        'make button text more transparent',
        'make button text less visible',
        'make card text fainter',
      ]) {
        const r = await answer(q);
        expect(r.first.length, q).toBeGreaterThan(0);
        for (const c of r.all) expect(c, q).not.toMatch(/ opacity /);
      }
      const toast = await answer('make the toast text less visible');
      expect(toast.first[0]).toMatch(
        /^set n --color-on-dark '#[0-9a-f]{8}' --on toast/,
      );
    },
    T,
  );
});

describe('chaos42', () => {
  it(
    'roles, keeps, grounds and shapes stay where they are said',
    async test => {
      needsBases(test);
      const danger = await answer('make the danger badge text darker');
      for (const c of danger.first) expect(c).toMatch(/--when variant:error/);
      const sep = await answer('make the separator thicker');
      expect(sep.first).toEqual(['set n --border-width 2px --on divider']);
      const keep = await answer('make buttons red and keep the focus ring');
      expect(keep.all.join('\n')).not.toMatch(/--focus-outline-width/);
      const outline = await answer('make outline buttons blue on hover');
      expect(outline.text).not.toMatch(/undefined/);
      expect(outline.first).toContain(
        "set n border-color '#2563eb' --on button --when variant:primary --state hover",
      );
      expect((await answer('make tokens square')).first).toEqual([
        'set n corners square --on token',
      ]);
      const ratio = await answer('make the text on primary buttons 4.5:1');
      expect(ratio.all.join('\n')).not.toMatch(/set n --color-text-primary/);
    },
    T,
  );
});
