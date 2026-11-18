// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads each item of a part's list as that part's: a
 * subject it does not know writes nothing (never the whole theme), other
 * design systems' names for a part are that part, a bare color or length
 * takes the look of the item before it, a state said at the end of a
 * with-item is the state of its look, corners on some sides are those
 * corners only, and a color said with a shape is its fill.
 *
 * @position api/theme-edit — tests
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
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-list-items-', FIXTURE_PACKAGES);
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
  const lines = (/** @type {string[]} */ cs) =>
    cs
      .filter(c => / editor (?:set|undo) /.test(c))
      .map(c => c.replace(/^.* editor (?:set|undo) \S+ /, ''));
  return {
    first: lines(results.find(r => lines(r.commands).length)?.commands ?? []),
    all: results.flatMap(r => lines(r.commands)),
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

describe('a subject how does not know', () => {
  it(
    'writes nothing for it or its list, and names the word',
    async test => {
      needsBases(test);
      for (const q of [
        'flurbles: subtle gray background, bold uppercase 11px text',
        'flurbles bold uppercase',
      ]) {
        const r = await answer(q);
        expect(r.all, q).toEqual([]);
        expect(r.text, q).toMatch(/no part is called "flurbles"/);
      }
      // (A brand as the label is the theme's look after it.)
      expect((await answer('Airbnb: accent #ff385c')).first).toContain(
        "accent '#ff385c'",
      );
    },
    T,
  );
});

describe("other design systems' names", () => {
  it.each([
    ['lozenges: bold uppercase text', 'text-transform uppercase --on badge'],
    ['snackbars dark with white text', "color '#ffffff' --on toast"],
    ['form controls: 6px corners', 'border-radius 6px --on inputs'],
  ])(
    '%s',
    async (q, line, test) => {
      needsBases(test);
      expect((await answer(q)).all).toContain(line);
    },
    T,
  );
});

describe('a list item', () => {
  it(
    'a length and a color after the part line is that line, in its state',
    async test => {
      needsBases(test);
      const r = await answer(
        'inputs: 1px border #79747e, 2px #6750a4 when focused',
      );
      expect(r.first).toContain(
        "border '2px solid #6750a4' --on inputs --state focus-within",
      );
      expect(r.all.join('\n')).not.toMatch(/background-color '#6750a4'/);
    },
    T,
  );
  it(
    'a color word and its value after a text ask is the text color',
    async test => {
      needsBases(test);
      const r = await answer('table header: uppercase 12px text, gray #6b7280');
      expect(r.first).toContain("color '#6b7280' --on table-header-cell");
      expect(r.all.join('\n')).not.toMatch(/background-color '#6b7280'/);
    },
    T,
  );
  it(
    'a day of the date picker is the calendar’s, never the field',
    async test => {
      needsBases(test);
      const r = await answer(
        'date picker: today’s date circled in #0969da'.replace('’', "'"),
      );
      expect(r.all).toEqual([]);
      expect(r.text).toMatch(/plain Calendar/);
    },
    T,
  );
  it(
    'a state at the end of a with-item is its look’s state',
    async test => {
      needsBases(test);
      const r = await answer(
        'danger buttons: red text #d1242f, and red background #a40e26 with white text on hover',
      );
      expect(r.first).toContain(
        "background-color '#a40e26' --on button --when variant:destructive --state hover",
      );
      expect(r.text).not.toMatch(/contradict/);
      const o = await answer(
        'outline buttons: 1px border #0d6efd, blue text, filled blue with white text on hover',
      );
      expect(o.first).toContain(
        "background-color '#2563eb' --on button --state hover",
      );
      expect(o.first).not.toContain("color '#2563eb' --on button");
    },
    T,
  );
  it(
    'the padding after a part label is the part’s',
    async test => {
      needsBases(test);
      expect(
        (await answer('dialogs: no border, 16px padding, large shadow')).first,
      ).toContain('padding 16px --on dialog');
    },
    T,
  );
});

describe('corners on some sides', () => {
  it(
    'are those corners only; a step on them asks for a size',
    async test => {
      needsBases(test);
      expect(
        (await answer('inputs: 4px top corners and square bottom corners'))
          .first,
      ).toEqual([
        'border-start-start-radius 4px --on inputs',
        'border-start-end-radius 4px --on inputs',
        'border-end-start-radius 0 --on inputs',
        'border-end-end-radius 0 --on inputs',
      ]);
      expect((await answer('inputs: 4px corners on top only')).first).toEqual([
        'border-start-start-radius 4px --on inputs',
        'border-start-end-radius 4px --on inputs',
      ]);
      expect((await answer('cards: rounder top corners')).all).toEqual([]);
    },
    T,
  );
});

describe('other readings', () => {
  it(
    'a color with a shape is its fill; "divided by" is no amount; shadow-sm is small; "stable" is no table',
    async test => {
      needsBases(test);
      const pill = await answer('the active nav item should be a #e8def8 pill');
      expect(pill.all).toContain(
        'corners pill --on top-nav-item --state selected',
      );
      expect(pill.text).not.toMatch(/but not "#e8def8"/);
      expect(
        (await answer('table rows divided by 1px lines')).text,
      ).not.toMatch(/not a change by/);
      expect((await answer('cards: shadow-sm')).first).toEqual([
        "box-shadow 'var(--shadow-low)' --on card",
      ]);
      expect(
        (
          await answer(
            'medical records table view: clear status colors: green #15803d stable, amber #b45309 pending',
          )
        ).all.join('\n'),
      ).not.toMatch(/--on table-row/);
    },
    T,
  );
});
