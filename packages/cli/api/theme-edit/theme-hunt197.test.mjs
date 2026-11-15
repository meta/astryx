// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How reads a value or a ratio from what the ask names as its
 * reference and holds a bound: a part's padding "equal to" another's takes
 * that part's value (and says so when it has none); a text "4.5:1 against
 * the page" moves the text, measured against the page, which is never
 * changed; "never taller than 40px" is a ceiling, and a color bound holds
 * every color written (or says the part is past it already); a table's
 * lines and padding are read on its cells; links take a ratio; and a
 * question about the shadows reads the shared shadow steps.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {alphaOf, parseColor, ratio} from './_color.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt197-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
  await themeEditNew('st', {cwd, like: 'stone'});
  await themeEditNew('lo', {cwd, like: 'neutral'});
  // A pale accent text, so links fall short of 4.5:1 on the light page.
  await themeEditSet('lo', '--color-text-accent', '#9ca3af', {cwd});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} theme @param {string} ask */
const how = async (theme, ask) => {
  const {data} = /** @type {any} */ (await themeEditHow(ask, {cwd, theme}));
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    commands: r.commands.map(c => c.replace(/^.*? editor /, '')),
  }));
};

/** @param {Array<{commands: string[]}>} rs */
const writes = rs =>
  rs.flatMap(r => r.commands).filter(c => /^(set|undo) /.test(c));

describe('a part equal to another part', () => {
  it.each([
    ['make the card padding equal to the button padding'],
    ['make the card padding identical to the button padding'],
    ['make the card padding the same as the button padding'],
  ])(
    "%s: takes the other part's value",
    async ask => {
      expect(writes(await how('ne', ask))).toEqual([
        "set ne padding 'var(--spacing-2)' --on card",
      ]);
    },
    120_000,
  );

  it('a part with no padding of its own to read is said, never a step', async () => {
    const rs = await how(
      'ne',
      'make the card padding equal to the dialog padding',
    );
    expect(writes(rs)).toEqual([]);
    expect(rs[0].text).toContain(
      'dialog has no padding of its own that how can read, so card cannot take it',
    );
  }, 120_000);
});

describe('a text ratio against the page', () => {
  it('moves the text, never the page', async () => {
    const rs = await how('lo', 'make links 4.5:1 against the page');
    const w = writes(rs);
    expect(w.length).toBeGreaterThan(0);
    for (const c of w) {
      expect(c).toMatch(/^set lo --color-text-accent '/);
      expect(c).not.toContain('--color-background-body');
      expect(c).not.toContain('app-shell');
    }
    // What it writes measures the ratio against the light page.
    const v = /'([^']+)' --mode light/.exec(w.join(' '))?.[1] ?? '';
    const rgb = parseColor(v);
    expect(
      rgb && alphaOf(v) === 1 ? ratio(rgb, [255, 255, 255]) : 0,
    ).toBeGreaterThanOrEqual(4.5);
    expect(rs[0].text).toContain(
      'moved the least that measures 4.5:1 against --color-background-body',
    );
  }, 120_000);

  it.each([
    ['make the text 4.5:1 against the page'],
    ['make the text 7:1 against the page'],
  ])(
    '%s: the text is the subject; text that measures it already is kept',
    async ask => {
      const rs = await how('ne', ask);
      expect(writes(rs)).toEqual([]);
      expect(rs[0].text).toMatch(
        /^the text for the whole theme \(--color-text-primary\) already measures \d(\.5)?:1 against --color-background-body: nothing to change$/,
      );
    },
    120_000,
  );
});

describe('bounds', () => {
  it('"never taller than 40px" is a ceiling', async () => {
    const w = writes(
      await how('ne', 'make the inputs taller but never taller than 40px'),
    );
    expect(w).toEqual(['set ne height 40px --on inputs']);
  }, 120_000);

  it('a color bound is never the color asked, and holds every color written', async () => {
    const past = await how(
      'st',
      'make links darker but not darker than #1e3a8a',
    );
    expect(past[0].text).toContain(
      'already darker than #1e3a8a in light mode (#25252a), so it cannot get darker there and keep "not darker than #1e3a8a"',
    );
    expect(writes(past).some(c => /--mode light/.test(c))).toBe(false);
    const black = writes(
      await how('st', 'make links darker but never darker than #000000'),
    );
    expect(black.some(c => c.includes("'#000000'"))).toBe(false);
    const held = await how(
      'ne',
      'make the header darker but not darker than #eeeeee',
    );
    expect(held[0].text).toContain(
      '(not darker than #eeeeee: held at #eeeeee in light mode)',
    );
    expect(held[0].text).toContain('already darker than #eeeeee in dark mode');
    const light = writes(held).filter(c => /--mode light/.test(c));
    expect(light.length).toBeGreaterThan(0);
    for (const c of light) expect(c).toContain("'#eeeeee'");
    expect(writes(held).some(c => /--mode dark/.test(c))).toBe(false);
  }, 120_000);
});

describe('a table, read on its cells', () => {
  it("a border ratio sets the token its cells' lines read, on the table", async () => {
    const rs = await how('ne', 'make the table border 4.5:1 contrast');
    expect(rs[0].text).toContain(
      '--color-border (the lines its table-cell and table-header-cell parts draw), on table-row only',
    );
    expect(writes(rs)).toEqual([
      expect.stringMatching(
        /^set ne --color-border '#[0-9a-f]{8}' --on table-row --mode light$/,
      ),
      expect.stringMatching(
        /^set ne --color-border '#[0-9a-f]{8}' --on table-row --mode dark$/,
      ),
    ]);
  }, 120_000);

  it("how dense is the table reads its cells' padding", async () => {
    const rs = await how('ne', 'how dense is the table');
    expect(rs[0].text).toContain(
      'table-row has padding 0.5rem (on its table-cell and table-header-cell parts, which hold its content) now (nothing is changed)',
    );
    expect(writes(rs)).toEqual([]);
  }, 120_000);
});

describe('the shadows asked about', () => {
  it.each([['what is the shadow'], ['what are the shadows']])(
    '%s: the shared shadow steps',
    async ask => {
      const rs = await how('ne', ask);
      expect(rs[0].text).toMatch(
        /^the shadows of ne are --shadow-low: .+; --shadow-med: .+; --shadow-high: .+ now \(nothing is changed\); to change them, ask for the change \("softer shadows"\)$/,
      );
      expect(writes(rs)).toEqual([]);
    },
    120_000,
  );
});
