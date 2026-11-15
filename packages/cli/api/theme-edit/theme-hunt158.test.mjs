// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` holds its writes to what the clause says (the
 * every-word gate), reads an except said first, articles in a list,
 * removals said for each item, a kept state with Core's own value, a state
 * only on a part's own anatomy, and never runs a "for one" example as a
 * step.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt158-', FIXTURE_PACKAGES);
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
  return {
    first: (
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? []
    ).map(c => c.replace(/^.* editor /, '')),
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

const T = 180_000;

describe('the every-word gate', () => {
  it(
    'a clause whose words the write does not show is not guessed at',
    async test => {
      needsBases(test);
      // (The on-color is read now; whatever the answer, it never writes
      // the main text color.)
      const onAccent = await answer('make the on-accent text black');
      expect(onAccent.first.join('\n')).not.toMatch(/--color-text-primary/);
      // (The reading that fades the whole card is held back.)
      const alpha = await answer('make the card shadow 30% opacity');
      expect(alpha.first.join('\n')).not.toMatch(/ opacity /);
      const heavy = await answer('heavy card borders');
      expect(heavy.text).toMatch(/but not "borders"/);
      // A color to avoid is a constraint, never an unread value.
      expect((await answer('never use pure white for text')).text).not.toMatch(
        /but not/,
      );
    },
    T,
  );
});

describe('excepts, lists and removals', () => {
  it(
    'an except said first, with any except word',
    async test => {
      needsBases(test);
      for (const q of [
        'except cards, make everything rounder',
        'other than cards, make everything rounder',
      ]) {
        const r = await answer(q);
        expect(r.first[0]).toBe('set n corners more');
        expect(r.first.join('\n')).toMatch(/--on card/);
      }
    },
    T,
  );
  it(
    'an article before each list item',
    async test => {
      needsBases(test);
      const r = await answer(
        'make cards rounder, except the blue, the green, and the red ones',
      );
      for (const v of ['blue', 'green', 'red'])
        expect(r.first.join('\n')).toContain(`--when variant:${v}`);
      expect(r.first.join('\n')).not.toMatch(/background-color/);
    },
    T,
  );
  it(
    'a removal said for each item',
    async test => {
      needsBases(test);
      expect(
        (
          await answer(
            'remove the shadow from cards and the border from buttons',
          )
        ).first,
      ).toEqual([
        'set n box-shadow none --on card',
        'set n border none --on button',
      ]);
    },
    T,
  );
  it(
    'a kept state keeps what Core draws there',
    async test => {
      needsBases(test);
      expect(
        (await answer('make tabs blue except the selected one')).first,
      ).toEqual([
        "set n background-color '#2563eb' --on tab",
        'set n background-color transparent --on tab --state selected',
      ]);
    },
    T,
  );
  it(
    'a state goes to a part of the part’s own anatomy only',
    async test => {
      needsBases(test);
      expect((await answer('selected cards blue')).first).toEqual([]);
      expect(
        (await answer('side nav selected items should be #dbeafe')).first,
      ).toEqual([
        "set n background-color '#dbeafe' --on side-nav-item --state selected",
      ]);
    },
    T,
  );
  it(
    'a "for one" example is in the words, never a step',
    async test => {
      needsBases(test);
      const r = await answer('make input borders blue');
      expect(r.first.join('\n')).not.toMatch(
        /border-color '#2563eb' --on inputs --when status:error/,
      );
      expect(r.first).toContain(
        "set n border-color 'var(--color-border-error)' --on inputs --when status:error",
      );
    },
    T,
  );
});

describe('chaos37', () => {
  it(
    'one-word removals, a "ones" item in a list, both halves of a mode pair, a keep said as unchanged',
    async test => {
      needsBases(test);
      expect((await answer('make cards borderless')).first).toEqual([
        'set n border none --on card',
      ]);
      expect((await answer('make cards un-outlined')).first[0]).toBe(
        'set n border none --on card',
      );
      expect(
        (await answer('make primary buttons and the ghost ones rounder')).first,
      ).toEqual([
        'set n corners more --on button --when variant:primary',
        'set n corners more --on button --when variant:ghost',
      ]);
      const pair = await answer(
        'make the accent darker in dark mode and lighter in light mode',
      );
      expect(pair.first.some(x => /--mode dark$/.test(x))).toBe(true);
      expect(pair.first.some(x => /--mode light$/.test(x))).toBe(true);
      const kept = await answer('make everything rounder, buttons unchanged');
      expect(kept.first[0]).toBe('set n corners more');
      expect(kept.first.join('\n')).toMatch(/--on button/);
    },
    T,
  );
  it(
    'an option after "--", and an unquoted undo list',
    async test => {
      needsBases(test);
      const ED = ['experimental', 'theme', 'editor'];
      const dashed = await runCli(
        [
          ...ED,
          'set',
          'n',
          'letter-spacing',
          '--json',
          '--',
          '-0.5px',
          '--on',
          'card',
        ],
        cwd,
      );
      expect(`${dashed.stdout}${dashed.stderr}`).toMatch(
        /every word after \\?"--\\?" is a value/,
      );
      await themeEditSet('n', 'accent', '#e11d48', {cwd});
      await themeEditSet('n', 'corners', 'round', {cwd});
      await themeEditSet('n', 'spacing', 'roomy', {cwd});
      const list = await runCli(
        [...ED, 'undo', 'n', 'accent,', 'corners,', 'spacing', '--json'],
        cwd,
      );
      expect(`${list.stdout}${list.stderr}`).toMatch(/names 3 settings/);
    },
    T,
  );
});
