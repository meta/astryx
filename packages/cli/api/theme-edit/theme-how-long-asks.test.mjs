// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` on long asks keeps each change where it was said: a
 * table's headers listed after "tables with" are its header cells; "other
 * tabs <color>" after an underline clause is their text; the dark half of
 * a sidebar's mode pair is its fill, and the text after it the theme's; a
 * part's "<ink> text on <color>" is that part's fill; a fill for every
 * button keeps the destructive one's red, and each look whose text would
 * not read gets its text line.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-how-long-asks-', FIXTURE_PACKAGES);
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

describe('long asks keep each change where it was said', () => {
  it(
    'headers listed after "tables with" are the table header cells',
    async test => {
      needsBases(test);
      const r = await answer(
        'tables with 13px text, uppercase 11px headers and a #f6f8fa header background',
      );
      expect(r.first).toContain(
        'text-transform uppercase --on table-header-cell',
      );
      expect(r.first).toContain('font-size 11px --on table-header-cell');
      expect(r.first.some(x => /^text-size /.test(x))).toBe(false);
      expect(
        r.first.some(x => /--on table-row$/.test(x) && /uppercase/.test(x)),
      ).toBe(false);
      // A heading ask with no table stays the headings'.
      expect((await answer('headers bolder')).first).toContain('headings bold');
    },
    T,
  );

  it(
    '"other tabs <color>" after an underline clause is their text',
    async test => {
      needsBases(test);
      const r = await answer(
        'selected tab text #635bff with a 2px #635bff underline, other tabs #6c7688',
      );
      expect(r.first).toContain("color '#6c7688' --on tab");
      expect(r.all.some(x => /^background-color '#6c7688'/.test(x))).toBe(
        false,
      );
    },
    T,
  );

  it(
    "a sidebar's dark half is its fill, and the text after it the theme's",
    async test => {
      needsBases(test);
      const r = await answer(
        'sidebar #f7f7f5 in light mode and #202020 in dark mode, text #37352f in light mode',
      );
      expect(r.first).toEqual([
        "background-color '#f7f7f5' --on side-nav --mode light",
        "background-color '#202020' --on side-nav --mode dark",
        "--color-text-primary '#37352f' --mode light",
      ]);
    },
    T,
  );

  it(
    '"<ink> text on <color>" on a part is that part\'s fill, never the page',
    async test => {
      needsBases(test);
      for (const q of [
        'code #eb5757 text on #f7f6f3',
        'code #eb5757 text on a #f7f6f3 background with 4px corners',
      ]) {
        const r = await answer(q);
        expect(r.first, q).toContain("background-color '#f7f6f3' --on code");
        expect(r.first, q).toContain("color '#eb5757' --on code");
        expect(
          r.all.some(x => /--color-background-body/.test(x)),
          q,
        ).toBe(false);
      }
      // With no part, the page is still the ground.
      expect(
        (await answer('green text on a black page')).first.some(x =>
          /^--color-background-body/.test(x),
        ),
      ).toBe(true);
    },
    T,
  );

  it(
    'a fill for every button keeps the destructive red and reads in every look',
    async test => {
      needsBases(test);
      const {data} = await themeEditHow('make the buttons green #16a34a', {
        cwd,
        theme: 'n',
      });
      const lines = (data.results ?? []).flatMap(x => x.commands);
      const fills = lines.filter(c => /background-color '#16a34a'/.test(c));
      expect(fills.length).toBeGreaterThan(0);
      expect(fills.every(c => / --when variant:(?!destructive)/.test(c))).toBe(
        true,
      );
      const readable = (data.results ?? []).find(x =>
        /^readable text on that fill/.test(x.text),
      );
      expect(readable?.commands[0]).toMatch(/--when variant:/);
      // Every line runs.
      for (const c of [...fills, ...(readable?.commands ?? [])])
        for (const one of c.split(' && ')) {
          const m = /editor set n (\S+) '?([^']*?)'? (--on .*)$/.exec(one);
          if (!m) continue;
          const flags = Object.fromEntries(
            [...m[3].matchAll(/--(\w+) (\S+)/g)].map(x => [x[1], x[2]]),
          );
          await themeEditSet('n', m[1], m[2], {cwd, ...flags});
        }
    },
    T,
  );
});
