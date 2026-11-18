// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `how` reads a part's own piece and a whole look as said. A top
 * nav's links or items are its items, never the top nav and every link. A
 * look named after a product ("make it Acme") is never guessed: the answer
 * asks for its colors, font, corners and spacing, or a picture of it. One
 * variant made to look like another ("ghost buttons look like the default
 * button") takes that variant's look, written for its own variant only,
 * never a reset; the default is the variant the part has when none is
 * given. A part's own piece taken away is not drawn; a whole part taken
 * away is the app's call. A display heading sizes from its display token; display headings are
 * every display look, named in the answer, and a clause that takes the
 * part from them takes every one.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditUndo,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-looks-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} q */
const answer = async q => (await themeEditHow(q, {cwd, theme: 't'})).data;

/** The first answer's lines, without the command prefix. @param {any} data */
const first = data =>
  (data.results ?? [])
    .find((/** @type {any} */ r) =>
      r.commands.some((/** @type {string} */ c) =>
        / editor (set|undo) /.test(c),
      ),
    )
    ?.commands.map((/** @type {string} */ c) =>
      c.replace(/^.*? editor /, ''),
    ) ?? [];

describe("a top nav's links and items", () => {
  it(
    'are its items',
    async () => {
      for (const q of [
        'top nav links accent colored',
        'top nav items bigger',
        'navbar links bold',
      ]) {
        const lines = first(await answer(q));
        expect(lines.length, q).toBeGreaterThan(0);
        for (const l of lines) expect(l, q).toMatch(/--on top-nav-item\b/);
      }
    },
    T,
  );
});

describe('a look named after a product', () => {
  it(
    'is never guessed: the answer asks for its colors, font, corners and spacing, or a picture',
    async () => {
      for (const q of ['make it Acme 2', 'make it look like Acme']) {
        const data = await answer(q);
        expect(first(data), q).toEqual([]);
        const text = JSON.stringify(data.results);
        expect(text, q).toMatch(/does not know what \\"acme\\" looks like/);
        expect(text, q).toMatch(/its font, how round its corners are/);
        expect(text, q).toMatch(/picture/);
      }
      // (A quality or describing word names no product: a name is said as
      // one, capitalized.)
      for (const q of [
        'make it accessible',
        'make it consistent',
        'make it pretty',
        'make it cozy',
      ])
        expect(JSON.stringify((await answer(q)).results), q).not.toMatch(
          /never guesses a brand/,
        );
    },
    T,
  );
});

describe('one variant made to look like another', () => {
  it(
    "takes that variant's look on its own variant only; the default is the variant a part has when none is given",
    async () => {
      for (const q of [
        'ghost buttons look like the default button',
        'make ghost buttons look like secondary buttons',
      ]) {
        const lines = first(await answer(q));
        expect(lines.length, q).toBeGreaterThan(0);
        for (const l of lines) {
          expect(l, q).toMatch(/^set t /);
          expect(l, q).toMatch(/--on button --when variant:ghost\b/);
        }
        expect(
          lines.some(l => /^set t background-color /.test(l)),
          q,
        ).toBe(true);
      }
      const primary = first(
        await answer('ghost buttons should look like the primary ones'),
      );
      expect(primary).toContain(
        "set t background-color 'var(--color-accent)' --on button --when variant:ghost",
      );
    },
    T,
  );

  it(
    'leaves "look like before" a reset',
    async () => {
      for (const q of [
        'make the cards look like before',
        'make it look like before',
      ]) {
        const text = JSON.stringify((await answer(q)).results);
        expect(text, q).not.toMatch(/variant:/);
        // ("before" is the earlier look, never a product's name.)
        expect(text, q).not.toMatch(/never guesses a brand|"before"/);
      }
      // (Said of no part, it is the theme's earlier look: undo.)
      for (const q of ['make it look like before', 'clear everything'])
        expect(JSON.stringify((await answer(q)).results), q).toMatch(
          /undo t steps back one change|has no change to undo/,
        );
      // (A going-back word said as a look describes: no undo, no theme
      // switch.)
      for (const q of [
        'make it more original',
        'make it clear',
        'use a clear theme',
        'make everything clear',
        'make it crystal clear',
        'make it feel original',
        'make the cards darker than before',
        'bring back the retro look',
        'a back-to-school theme',
      ]) {
        const text = JSON.stringify((await answer(q)).results);
        expect(text, q).not.toMatch(
          /steps back one change|has no change to undo/,
        );
        expect(text, q).not.toMatch(/astryx theme use /);
      }
    },
    T,
  );
});

describe('a likeness said with "not"', () => {
  it(
    'writes nothing, never the look it names',
    async () => {
      for (const q of [
        'ghost buttons not look like primary buttons',
        'ghost buttons should never look like primary buttons',
        "don't let ghost buttons look like primary buttons",
        "I don't want ghost buttons to look like primary buttons",
      ]) {
        const data = await answer(q);
        expect(first(data), q).toEqual([]);
        expect(JSON.stringify(data.results), q).toMatch(/asks for no change/);
      }
    },
    T,
  );
});

describe('a likeness said with a state or a mode', () => {
  it(
    'writes nothing and names the state or mode, never the resting look',
    async () => {
      for (const q of [
        'make ghost buttons look like primary buttons on hover',
        'ghost buttons look like the default button when pressed',
        'ghost buttons look like primary buttons in dark mode',
      ]) {
        const data = await answer(q);
        expect(first(data), q).toEqual([]);
        expect(JSON.stringify(data.results), q).toMatch(
          /nothing is written for/,
        );
      }
    },
    T,
  );
});

describe('"not" or "never" before a look that is no likeness', () => {
  it(
    'is no prohibition: the look is still read',
    async () => {
      for (const q of [
        'cards never get a shadow',
        'the cards do not get enough shadow',
        'the buttons do not look round enough',
      ]) {
        const data = await answer(q);
        expect(first(data).length, q).toBeGreaterThan(0);
        expect(JSON.stringify(data.results), q).not.toMatch(
          /asks for no change|nothing to change/,
        );
      }
    },
    T,
  );
});

describe('a background hidden on a piece', () => {
  it(
    'hides only the background; the piece stays drawn',
    async () => {
      for (const q of [
        'hide the code block copy button background',
        'hide the code block header background',
        'hide the banner icon background',
      ]) {
        const data = await answer(q);
        expect(JSON.stringify(data.results), q).not.toMatch(/display none/);
      }
      expect(
        first(await answer('hide the code block header background')).join('\n'),
      ).toMatch(/background-color transparent --on code-block-header/);
    },
    T,
  );

  it(
    'leaves an icon drawn inside a button: hiding it keeps an empty, focusable button',
    async () => {
      const data = await answer('hide the dialog close icon');
      expect(first(data)).toEqual([]);
      expect(JSON.stringify(data.results)).toMatch(
        /empty control that still takes focus/,
      );
    },
    T,
  );

  it(
    'a negation in a clause before the hide does not rule it out',
    async () => {
      const data = await answer(
        "the code block copy button isn't useful so hide it",
      );
      expect(JSON.stringify(data.results)).not.toMatch(/asks for no change/);
    },
    T,
  );
});

describe('the earlier theme or look, and parts said apart', () => {
  it(
    'needs going-back words',
    async () => {
      expect(
        JSON.stringify((await answer('a restored vintage look')).results),
      ).not.toMatch(/undo|no change to undo/);
    },
    T,
  );

  it(
    'reads a capitalized product name as a name, whatever its ending',
    async () => {
      for (const q of [
        'an Airtable look',
        'make it look like Segment',
        'a Fluent theme',
      ]) {
        expect(JSON.stringify((await answer(q)).results), q).toMatch(
          /never guesses a brand/,
        );
      }
    },
    T,
  );
});

describe('a top nav said beside a side nav', () => {
  it(
    'stays the top nav; a bare "nav items" in a sidebar ask is the side nav',
    async () => {
      for (const q of [
        'make the top nav links bold and the side nav items red',
        'navbar links bold and the side nav items red',
        'nav bar links bold and the side nav items red',
      ]) {
        const lines = first(await answer(q)).join('\n');
        expect(lines, q).toMatch(/font-weight 700 --on top-nav-item/);
        expect(lines, q).toMatch(/--on side-nav-item/);
        expect(lines, q).not.toMatch(/font-weight 700 --on side-nav-item/);
      }
      expect(
        first(await answer('sidebar: nav items white')).join('\n'),
      ).toMatch(/--on side-nav-item/);
    },
    T,
  );
});

describe('a piece that holds a control', () => {
  it(
    'is never hidden whole: the answer names the control and writes nothing',
    async () => {
      // (A code block's header holds its copy button.)
      expect(first(await answer('hide the code block header'))).toEqual([]);
      const data = await answer('remove the dialog header');
      expect(first(data)).toEqual([]);
      expect(JSON.stringify(data.results)).toMatch(
        /dialog-header holds a control/,
      );
      expect(JSON.stringify(data.results)).not.toMatch(/display none/);
    },
    T,
  );
});

describe('a negation that takes no piece away', () => {
  it(
    'never hides the part: a behavior word, or an owner without that piece',
    async () => {
      for (const q of [
        'top nav items without icons',
        'side nav items without icons',
        'no truncation on table cells',
        'tabs never wrap',
        'the toast never moves',
        'spinners never animate',
      ]) {
        const data = await answer(q);
        expect(JSON.stringify(data.results), q).not.toMatch(/display none/);
      }
    },
    T,
  );

  it(
    'leaves a control whose only target is its icon: hiding the icon would keep an empty, focusable control',
    async () => {
      const data = await answer('hide the dialog close button');
      expect(first(data)).toEqual([]);
      expect(JSON.stringify(data.results)).toMatch(
        /empty control that still takes focus/,
      );
    },
    T,
  );
});

describe('a negation of a piece followed by more than a place', () => {
  it(
    'hides nothing: "no table row lines" is about the lines, and "no row hidden" keeps the rows',
    async () => {
      for (const q of [
        'no table row lines',
        'no row dividers in tables',
        'tables without row lines',
        'tables with no row lines',
        'no table cell lines',
        'keep every row of the table, no row hidden',
        'no row hidden',
        'nothing hidden on tables',
      ]) {
        const data = await answer(q);
        expect(first(data), q).toEqual([]);
        expect(JSON.stringify(data.results), q).not.toMatch(/display none/);
      }
      // A piece with only a place after it is still taken away.
      expect(
        first(await answer('no copy button on code blocks, please')),
      ).toEqual(['set t display none --on code-block-copy-button']);
      expect(first(await answer('no banner icon please'))).toEqual([
        'set t display none --on banner-icon',
      ]);
      // A keep said after the hide only bounds it.
      for (const q of [
        'hide the tab underline so nothing else is hidden',
        'hide the tab underline and nothing else',
        'hide the tab underline too',
      ])
        expect(first(await answer(q)), q).toEqual([
          'set t display none --on tab-indicator',
        ]);
    },
    T,
  );
});

describe('a piece said before a part that has no such piece', () => {
  it(
    'reads the pieces the part holds: "icons in cards red" writes a color',
    async () => {
      const lines = first(await answer('icons in cards red'));
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('\n')).toMatch(/--on card/);
    },
    T,
  );
});

describe('a piece the ask says not to take away', () => {
  it(
    'is kept: "don\'t hide", "never hide" and "do not remove" write nothing',
    async () => {
      for (const q of [
        "don't hide the code block copy button",
        'never hide the tab underline',
        'do not remove the copy button on code blocks',
        'avoid hiding the code block copy button',
        "make sure the code block copy button isn't hidden",
        "I don't want the code block copy button removed",
      ]) {
        const data = await answer(q);
        expect(first(data), q).toEqual([]);
        expect(JSON.stringify(data.results), q).toMatch(/asks for no change/);
      }
    },
    T,
  );
});

describe('a hide said negated', () => {
  it(
    'is a show: never display none; it takes back a hide the theme has',
    async () => {
      const piece = 'code-block-copy-button';
      for (const q of [
        "don't hide the code block copy button",
        'stop hiding the code block copy button',
        'un-hide the code block copy button',
        'never remove the copy button on code blocks',
        'stop removing the code block copy button',
      ]) {
        const data = await answer(q);
        expect(first(data), q).toEqual([]);
        expect(JSON.stringify(data.results), q).not.toMatch(/display none/);
      }
      await themeEditSet('t', 'display', 'none', {cwd, on: piece});
      try {
        for (const q of [
          'stop hiding the code block copy button',
          'un-hide the code block copy button',
          'stop removing the code block copy button',
        ])
          expect(first(await answer(q)), q).toEqual([
            `undo t display --on ${piece}`,
          ]);
      } finally {
        await themeEditUndo('t', {cwd, thing: 'display', on: piece});
      }
    },
    T,
  );
});

describe("a part's own piece taken away", () => {
  it(
    'is not drawn: display none on that element, never a look and never the whole part',
    async () => {
      for (const [q, on] of [
        ['hide the code block copy button', 'code-block-copy-button'],
        ['no copy button on code blocks', 'code-block-copy-button'],
        ['hide the tab underline', 'tab-indicator'],
        ['hide the banner icon', 'banner-icon'],
        ['alerts without icons', 'banner-icon'],
      ])
        expect(first(await answer(q)), q).toEqual([
          `set t display none --on ${on}`,
        ]);
      // A whole part is the app's call: nothing is written.
      expect(first(await answer('no banners'))).toEqual([]);
      // A look taken away is that look.
      expect(first(await answer('cards without borders'))[0]).toMatch(
        /^set t border none --on card$/,
      );
    },
    T,
  );

  it(
    'folds every option of every look, each step once, naming each part once',
    async () => {
      /** Every line of the first answer's options. @param {any} data */
      const all = data =>
        JSON.stringify(
          (data.results ?? []).find((/** @type {any} */ r) =>
            r.commands.some((/** @type {string} */ c) => / editor set /.test(c)),
          )?.commands ?? [],
        );
      // (A size is the largest look's; the others keep the steps between
      // them, so the type scale keeps its shape.)
      const sizedData = await answer('display headings 60px');
      const sized = all(sizedData);
      expect(sized).toMatch(/--text-display-1-size 60px/);
      for (const n of [2, 3]) {
        const px = Number(new RegExp(`--text-display-${n}-size (\\d+)px`).exec(sized)?.[1]);
        expect(px).toBeGreaterThan(0);
        expect(px).toBeLessThan(60);
      }
      expect(JSON.stringify(sizedData.results)).toMatch(/scaled to keep the steps/);
      const georgia = first(await answer('display headings in Georgia'));
      expect(georgia.length).toBe(new Set(georgia).size);
      expect(JSON.stringify((await answer('display headings color')).results)).not.toMatch(
        /heading and heading/,
      );
    },
    T,
  );
});

describe('a display heading', () => {
  it(
    'sizes from the display size token',
    async () => {
      const lines = first(await answer('display heading 60px'));
      expect(lines).toContain(
        'set t font-size 60px --on heading --when type:display-1',
      );
      expect(lines).toContain('set t --text-display-1-size 60px');
    },
    T,
  );

  it(
    'said in the plural, is every display look the heading draws',
    async () => {
      const lines = first(await answer('heavy display headings'));
      expect(lines).toEqual([
        'set t font-weight 800 --on heading --when type:display-1',
        'set t font-weight 800 --on heading --when type:display-2',
        'set t font-weight 800 --on heading --when type:display-3',
      ]);
    },
    T,
  );

  it(
    'names the looks it covers, and a clause that takes the part takes them all',
    async () => {
      const each = (/** @type {string} */ thing) =>
        [1, 2, 3].map(n => `${thing} --on heading --when type:display-${n}`);
      const blue = await answer('bold display headings, make them blue');
      expect(first(blue)).toEqual([
        ...each("set t font-weight 700"),
        ...each("set t color '#2563eb'"),
      ]);
      expect(JSON.stringify(blue.results)).toMatch(
        /display headings: display-1, display-2, display-3/,
      );
      // (One clause is one answer that covers every look.)
      const heavy = await answer('heavy display headings');
      expect(
        heavy.results.filter((/** @type {any} */ r) => r.commands.some((/** @type {string} */ c) => / editor set /.test(c))),
      ).toHaveLength(1);
      // (Nothing written, nothing named.)
      expect(JSON.stringify((await answer('display headings')).results)).not.toMatch(
        /display headings: display-1/,
      );
      const listed = first(
        await answer('display headings: heavier, tighter letter spacing'),
      );
      for (const n of [1, 2, 3])
        expect(listed.join('\n')).toMatch(
          new RegExp(`letter-spacing \\S+ --on heading --when type:display-${n}\\b`),
        );
    },
    T,
  );
});
