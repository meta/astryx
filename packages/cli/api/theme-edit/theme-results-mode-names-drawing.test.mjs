// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Results that say what the theme does: a mode's own setting under a
 * setting for every mode names the one still drawing the other modes; the
 * neutral note gives an example in the theme's mode; an inverted surface
 * whose theme counterpart looks the same is not listed; a token set on the
 * top bar reaches the text over its ground, and a fix there stays in the
 * top bar; a faint hairline where
 * the base draws one is a choice; secondary text is fixed with the nearest
 * gray that reads; and pills stay off the misses unless the corners go
 * square.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

const T = 400_000;
/** @type {string} */
let cwd;
// (Show's open problems and missed list come from the theme, not from the
// sheet it writes: one small section of the sheet is drawn, not all of it.)
const looked = () => ({cwd, section: 'actions'});
beforeAll(() => {
  cwd = makeLinkedFixture(
    'astryx-theme-results-mode-names-drawing-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const notesOf = r => /** @type {string[]} */ (r.data.notes ?? []).join('\n');
/** @param {any} r */
const problemsOf = r =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    r.data.newProblems ?? r.data.openProblems ?? []
  );

describe('a change says what still draws', () => {
  it(
    'a mode setting under one for every mode names that one and its undo',
    async () => {
      await themeEditNew('m', {cwd, like: 'neutral'});
      await themeEditSet('m', '--color-background-body', '#fbf5ea', {cwd});
      const r = await themeEditSet('m', '--color-background-body', '#fbf5ea', {
        cwd,
        mode: 'light',
      });
      expect(notesOf(r)).toMatch(
        /still draws dark; .*undo m --color-background-body/,
      );
    },
    T,
  );

  it(
    'the neutral note says the page follows it, with a dark example on a dark theme',
    async () => {
      await themeEditNew('d', {cwd, like: 'neutral', mode: 'dark-only'});
      const r = await themeEditSet('d', 'neutral', '#5d6372', {cwd});
      const note = notesOf(r);
      expect(note).toMatch(/the page background follows it/);
      expect(note).not.toMatch(/#f8fafc/);
    },
    T,
  );
});

describe("the inverted surface on the theme's own surfaces", () => {
  it(
    "stays off the list where the theme's own dark looks like the base's",
    async () => {
      await themeEditNew('c', {
        cwd,
        like: 'neutral',
        settings: {neutral: '#78716c'},
      });
      await themeEditSet('c', '--color-background-surface', '#fffaf1', {
        cwd,
        mode: 'light',
      });
      const show = /** @type {any} */ (await themeEditShow('c', looked())).data;
      const tooltip = (show.missed ?? []).find(
        (/** @type {any} */ x) =>
          x.part === 'tooltip' && /surfaces changed/.test(x.why),
      );
      // A warm near-black beside the base's cool near-black is the same look:
      // no line, which would change nothing you see.
      expect(tooltip).toBeUndefined();
    },
    T,
  );
});

describe('text in the top bar', () => {
  it(
    'reads a token set on the bar, so the bar\u2019s white text is no problem',
    async () => {
      await themeEditNew('h', {cwd, like: 'neutral'});
      await themeEditSet('h', 'background-color', '#0b1f4d', {
        cwd,
        on: 'app-shell-header',
      });
      const first = /** @type {any} */ (await themeEditShow('h', looked())).data
        .openProblems;
      const inBar = first.filter((/** @type {any} */ p) =>
        /in the app-shell-header/.test(p.problem),
      );
      for (const p of inBar.filter((/** @type {any} */ p) => p.fix))
        expect(p.fix).not.toMatch(/--on button --when/);
      await themeEditSet('h', '--color-text-primary', '#ffffff', {
        cwd,
        on: 'app-shell-header',
      });
      await themeEditSet('h', '--color-text-secondary', '#ffffff', {
        cwd,
        on: 'app-shell-header',
      });
      const after = /** @type {any} */ (await themeEditShow('h', looked())).data
        .openProblems;
      expect(
        after.filter((/** @type {any} */ p) =>
          /(Inbox|Preview).*in the app-shell-header|in the app-shell-header.*(Inbox|Preview)/.test(
            p.problem,
          ),
        ),
      ).toEqual([]);
    },
    T,
  );
});

describe('borders', () => {
  it(
    'a faint hairline where the base draws one too is a choice, not a problem',
    async () => {
      await themeEditNew('b', {cwd, like: 'neutral'});
      const card = await themeEditSet('b', 'border', '1px solid #e5e5e5', {
        cwd,
        on: 'card',
      });
      expect(
        problemsOf(card).filter(p => /border on card/.test(p.problem)),
      ).toEqual([]);
      const token = await themeEditSet('b', '--color-border', '#ebebeb', {cwd});
      expect(
        problemsOf(token).filter(p => /a border needs 3:1/.test(p.problem)),
      ).toEqual([]);
    },
    T,
  );

  it(
    'secondary text below 4.5:1 is fixed with the nearest gray that reads, not black',
    async () => {
      // (On the borders case's theme: a text color, judged on its own
      // problems.)
      const r = await themeEditSet('b', '--color-text-secondary', '#9a9a9a', {
        cwd,
        mode: 'light',
      });
      const fixes = problemsOf(r)
        .map(p => String(p.fix ?? ''))
        .filter(f => /--color-text-secondary/.test(f));
      expect(fixes.length).toBeGreaterThan(0);
      for (const f of fixes) expect(f).not.toMatch(/'#000000'/);
    },
    T,
  );
});

describe('pills and corners', () => {
  it(
    'stay off the misses under rounded corners, and are listed under square ones',
    async () => {
      // (On the mode case's theme: corners are their own setting.)
      const small = /** @type {any} */ (
        await themeEditSet('m', 'corners', 'small', {cwd})
      ).data;
      const show = /** @type {any} */ (await themeEditShow('m', looked())).data;
      expect(
        (show.missed ?? []).filter((/** @type {any} */ x) =>
          /full pill/.test(x.why),
        ),
      ).toEqual([]);
      expect(small.missed ?? 0).toBeLessThan(16);
      await themeEditSet('m', 'corners', 'square', {cwd});
      const sq = /** @type {any} */ (await themeEditShow('m', looked())).data;
      expect(
        (sq.missed ?? []).some((/** @type {any} */ x) =>
          /full pill/.test(x.why),
        ),
      ).toBe(true);
    },
    T,
  );
});
