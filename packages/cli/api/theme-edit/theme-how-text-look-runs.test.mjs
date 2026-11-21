// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: every look said for a text is written, its color
 * before or after it, and links said with the top bar are its nav items,
 * never every link in the app.
 *
 * @position api/theme-edit — tests
 */

import {addRunLooks, colorInOtherDraft} from './_text-looks.mjs';
import {afterAll, beforeAll, expect, it, vi} from 'vitest';
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
  cwd = makeLinkedFixture('astryx-theme-how-look-runs-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** An answer's texts and set commands, after the theme name. @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results = data.results ?? [];
  return {
    texts: results.map(r => r.text),
    sets: [
      ...new Set(
        results
          .flatMap(r => r.commands)
          .filter(c => / editor set /.test(c))
          .map(c => c.replace(/^.* editor set \S+ /, ''))
          // (Which mode a light ink is kept to is the contrast rule's, not
          // these readings'.)
          .map(c => c.replace(/ --mode (?:light|dark)$/, '')),
      ),
    ],
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

it(
  "writes the top bar's links white, bold and 11px, never every link",
  async test => {
    needsBases(test);
    const {sets} = await answer(
      'top bar background #3b5998 with white bold 11px links',
    );
    expect(sets).toEqual(
      expect.arrayContaining([
        "background-color '#3b5998' --on app-shell-header",
        "--color-text-accent '#ffffff' --on app-shell-header",
        'font-weight 700 --on top-nav-item',
        'font-size 11px --on top-nav-item',
      ]),
    );
    expect(
      sets.filter(c => / --on link\b|^--color-text-accent '[^']*'$/.test(c)),
    ).toEqual([]);
  },
  T,
);

it(
  "writes the tabs' bold 13px #3b5998 text, every look of it",
  async test => {
    needsBases(test);
    const {sets, texts} = await answer(
      'tabs: background #d8dfea, bold 13px #3b5998 text; selected tab white with #333 text',
    );
    expect(sets).toEqual(
      expect.arrayContaining([
        "background-color '#d8dfea' --on tab",
        "color '#3b5998' --on tab",
        'font-weight 700 --on tab',
        'font-size 13px --on tab',
        "background-color '#ffffff' --on tab --state selected",
        "color '#333' --on tab --state selected",
      ]),
    );
    expect(texts.filter(t => /\bbut not\b/.test(t))).toEqual([]);
  },
  T,
);

it(
  'keeps links said apart from the top bar as every link',
  async test => {
    needsBases(test);
    const {sets} = await answer('a navy header and blue links');
    expect(sets).toContain("--color-text-accent '#2563eb'");
    expect(sets.some(c => /top-nav-item/.test(c))).toBe(false);
  },
  T,
);

it(
  'keeps every look with the part said before it, and the color before or after the size',
  async test => {
    needsBases(test);
    const cards = (await answer('cards with bold 14px text')).sets;
    expect(cards).toEqual(
      expect.arrayContaining([
        'font-weight 700 --on card',
        'font-size 14px --on card',
      ]),
    );
    expect(cards.some(c => /^text-size|--text-body-weight/.test(c))).toBe(
      false,
    );
    const led = await answer('cards with #3b5998 bold 13px text');
    expect(led.sets).toEqual(
      expect.arrayContaining([
        'font-weight 700 --on card',
        'font-size 13px --on card',
        "--color-text-primary '#3b5998' --on card",
      ]),
    );
    expect(led.texts.filter(t => /\bbut not\b/.test(t))).toEqual([]);
  },
  T,
);

it(
  'reads a length before a text shadow or a link underline as neither a text size',
  async test => {
    needsBases(test);
    for (const q of [
      'headings with a 1px white text shadow',
      'a 2px blue link underline',
    ])
      expect((await answer(q)).sets.some(c => /^font-size/.test(c))).toBe(
        false,
      );
  },
  T,
);

it(
  "puts the top bar's links on its nav items, with a sidebar named or the bar said as the top nav",
  async test => {
    needsBases(test);
    const side = (
      await answer(
        'a light gray sidebar and a top bar #3b5998 with white links',
      )
    ).sets;
    expect(side).toContain("color '#ffffff' --on top-nav-item");
    expect(side.some(c => /'#ffffff' --on side-nav-item/.test(c))).toBe(false);
    const nav = (await answer('top nav #3b5998 with white bold 11px links'))
      .sets;
    expect(nav).toEqual(
      expect.arrayContaining([
        "--color-text-accent '#ffffff' --on top-nav",
        'font-weight 700 --on top-nav-item',
        'font-size 11px --on top-nav-item',
      ]),
    );
    expect(
      nav.some(c => / --on link\b|^--color-text-accent '[^']*'$/.test(c)),
    ).toBe(false);
  },
  T,
);

it(
  'keeps links placed in the header, or listed apart, as the link color',
  async test => {
    needsBases(test);
    expect(
      (await answer('make the links in the header white')).sets.some(c =>
        /^--color-text-accent '#ffffff' --on app-shell-header/.test(c),
      ),
    ).toBe(true);
    const list = (await answer('navy header, blue links, rounder cards')).sets;
    expect(list).toContain("--color-text-accent '#2563eb'");
    expect(list.some(c => /top-nav-item/.test(c))).toBe(false);
  },
  T,
);

it(
  'puts links said in a bar with no look of its own on its nav items',
  async test => {
    needsBases(test);
    expect((await answer('top bar with white bold 11px links')).sets).toEqual(
      expect.arrayContaining([
        'font-weight 700 --on top-nav-item',
        'font-size 11px --on top-nav-item',
        "--color-text-accent '#ffffff' --on app-shell-header",
      ]),
    );
    const nav = (await answer('a top nav with white links')).sets;
    expect(nav).toContain("--color-text-accent '#ffffff' --on top-nav");
    expect(nav.some(c => /^--color-text-accent '[^']*'$/.test(c))).toBe(false);
  },
  T,
);

it(
  'reads looks said with no part of their own, or apart from the text, as before',
  async test => {
    needsBases(test);
    for (const q of [
      '#3b5998 bold 13px text',
      'a page with bold 13px #333 text',
      'bold 13px text on a #3b5998 background',
      '#ffffff bold uppercase 11px links',
    ]) {
      const {sets, texts} = await answer(q);
      expect(sets.some(c => /color/.test(c))).toBe(false);
      expect(texts.some(t => /\bbut not\b/.test(t))).toBe(true);
    }
    for (const q of [
      'cards with 11px links',
      'a sidebar with 13px links',
      'a 2px #3b5998 link underline',
    ])
      expect((await answer(q)).sets.some(c => /font-size/.test(c))).toBe(false);
  },
  T,
);

it(
  "reads as before a run with no part, a text's stroke or glow, a bar's own looks, and links said with another part",
  async test => {
    needsBases(test);
    expect((await answer('14px bold text')).sets).toContain('text-size 14');
    for (const q of [
      'headings with a 2px black text stroke',
      'headings with a 2px white text glow',
      'buttons with a 2px white text halo',
    ])
      expect((await answer(q)).sets.some(c => /size/.test(c))).toBe(false);
    expect(
      (await answer('top bar with white links and a shadow')).sets,
    ).toContain("box-shadow 'var(--shadow-med)' --on app-shell-header");
    expect(
      (await answer('header with white bold 11px links')).sets.some(c =>
        /color '#ffffff' --on heading/.test(c),
      ),
    ).toBe(false);
    for (const q of [
      'a sidebar with bold 13px #3b5998 links',
      'a sidebar with white bold 13px links',
    ])
      expect(
        (await answer(q)).sets.some(c =>
          /colou?r|#3b5998|#ffffff|font-size/.test(c),
        ),
      ).toBe(false);
  },
  T,
);

it(
  'puts every ask split from a links clause said with the top bar on its nav items',
  async test => {
    needsBases(test);
    const sets = (await answer('top bar #3b5998 with bold uppercase links'))
      .sets;
    expect(sets).toEqual(
      expect.arrayContaining([
        'font-weight 700 --on top-nav-item',
        'text-transform uppercase --on top-nav-item',
      ]),
    );
    expect(sets.some(c => /--on link\b/.test(c))).toBe(false);
  },
  T,
);

it(
  'reads the bar by the part words, and still reports a typed color outside the run',
  async test => {
    needsBases(test);
    const title = (await answer('title bar with white bold 11px links')).sets;
    const top = (await answer('top bar with white bold 11px links')).sets;
    expect(title).toEqual(top);
    const tab = {
      text: 'bold 13px text #3b5998',
      parts: [{on: 'tab'}],
      aspects: ['weight'],
    };
    addRunLooks([tab], []);
    const weight = [{thing: 'font-weight'}];
    expect(colorInOtherDraft(tab, weight, [], ['#3b5998'])).toBe(true);
    expect(colorInOtherDraft(tab, weight, [], ['#3b5998', '#eeeeee'])).toBe(
      false,
    );
  },
  T,
);

it(
  'writes every look of a run with a case or style, a hex-led bar run, more links in the bar list, and keeps bar text on the bar',
  async test => {
    needsBases(test);
    const tabs = await answer('tabs with bold uppercase 13px #3b5998 text');
    expect(tabs.sets).toEqual(
      expect.arrayContaining([
        'text-transform uppercase --on tab',
        "color '#3b5998' --on tab",
      ]),
    );
    expect(tabs.texts.some(t => /\bbut not\b/.test(t))).toBe(false);
    const first = await answer('cards with 13px #3b5998 bold text');
    expect(first.sets).toEqual([]);
    expect(
      (await answer('top bar #3b5998 with #ffffff bold 11px links')).sets,
    ).toEqual(
      expect.arrayContaining([
        "--color-text-accent '#ffffff' --on app-shell-header",
        'font-size 11px --on top-nav-item',
      ]),
    );
    expect(
      (await answer('top bar with white links and bold text')).sets,
    ).toContain('font-weight 700 --on app-shell-header');
    const modes = (
      await answer(
        'a navy top bar with white links in light mode and gray links in dark mode',
      )
    ).sets;
    expect(modes.some(c => /^--color-text-accent '[^']*'$/.test(c))).toBe(
      false,
    );
  },
  T,
);

it(
  'keeps links the ask places elsewhere as before',
  async test => {
    needsBases(test);
    for (const q of [
      'make the top bar navy with the links on cards blue',
      'a navy top bar with white links and blue links inside cards',
    ])
      expect((await answer(q)).sets).toContain(
        "--color-text-accent '#2563eb' --on card",
      );
  },
  T,
);

it(
  "puts a bar's case links on its nav items and gives a look said after them back to the bar",
  async test => {
    needsBases(test);
    const caps = (await answer('top bar with bold uppercase links')).sets;
    expect(caps).toEqual(
      expect.arrayContaining([
        'text-transform uppercase --on top-nav-item',
        'font-weight 700 --on top-nav-item',
      ]),
    );
    expect(caps.some(c => /--on (?:link|app-shell-header)\b/.test(c))).toBe(
      false,
    );
    const text = (await answer('top bar with white links and white text')).sets;
    expect(text).toContain(
      "--color-text-primary '#ffffff' --on app-shell-header",
    );
    expect(text.some(c => /^--color-text-accent '[^']*'$/.test(c))).toBe(false);
    expect(
      (await answer('a navy top bar with white links and bold text')).sets,
    ).toContain('font-weight 700 --on app-shell-header');
  },
  T,
);

it(
  'keeps looks said for the links after them as before',
  async test => {
    needsBases(test);
    const sets = (
      await answer(
        'a navy top bar with white links and underline them on hover',
      )
    ).sets;
    expect(
      sets.some(c => /text-decoration .*--on app-shell-header/.test(c)),
    ).toBe(false);
  },
  T,
);

it(
  "puts a look said for the bar's links again by 'them' on its nav items",
  async test => {
    needsBases(test);
    for (const q of [
      'top bar background #3b5998 with white links, and underline them on hover',
      'a navy top bar with white links and underline them on hover',
    ]) {
      const sets = (await answer(q)).sets;
      expect(sets).toContain(
        'text-decoration underline --on top-nav-item --state hover',
      );
      expect(
        sets.some(c => /--on (?:link|app-shell-header)\b.*hover/.test(c)),
      ).toBe(false);
    }
  },
  T,
);

it(
  'reads a run said for one part but placed in another as before',
  async test => {
    needsBases(test);
    for (const [q, place] of [
      ['tabs with bold 13px #3b5998 text on cards', 'card'],
      ['buttons with bold 14px #ffffff text in dialogs', 'dialog'],
    ])
      expect(
        (await answer(q)).sets.some(c =>
          new RegExp(`--on ${place}\\b`).test(c),
        ),
      ).toBe(false);
  },
  T,
);

it(
  "keeps a selected tab's own looks, and the bar links' size said alone",
  async test => {
    needsBases(test);
    const two = await answer(
      'tabs with bold 13px #3b5998 text and selected tabs with bold 13px #ffffff text',
    );
    expect(two.texts.some(t => /contradict/.test(t))).toBe(false);
    expect(two.sets).toContain('font-weight 700 --on tab');
    expect(
      (await answer('top bar #3b5998 with 11px white links')).sets,
    ).toContain('font-size 11px --on top-nav-item');
  },
  T,
);

it(
  "writes the bar links' size beside a hex color, and leaves a colon list as before",
  async test => {
    needsBases(test);
    for (const q of [
      'top bar #3b5998 with 11px #ffffff links',
      'top bar #3b5998 with #ffffff 11px links',
    ]) {
      const {sets, texts} = await answer(q);
      expect(sets).toContain('font-size 11px --on top-nav-item');
      expect(texts.some(t => /\bbut not\b/.test(t))).toBe(false);
    }
    expect(
      (await answer('top bar: #3b5998, white bold 11px links')).sets.some(c =>
        /top-nav-item/.test(c),
      ),
    ).toBe(false);
  },
  T,
);

it(
  "reads a part said with the bar by 'with' as before, and counts a run's color read once",
  async test => {
    needsBases(test);
    for (const q of [
      'top bar navy with blue buttons',
      'top nav navy with blue buttons',
      'a navy header with rounded buttons',
    ]) {
      const {sets} = await answer(q);
      expect(
        sets.some(c => /top-nav-item|--on button\b/.test(c)),
        q,
      ).toBe(false);
    }
    const two = await answer(
      'tabs with bold 13px #3b5998 text and selected tabs with bold 13px #ffffff text',
    );
    expect(two.sets).toContain("color '#3b5998' --on tab");
    // (A state said after the run reads as on main: the copy of the run the
    // reader gives it is answered "but not", and the state's own looks
    // are written.)
    const hover = await answer(
      'tabs with bold 13px #3b5998 text and hovered tabs with bold 14px #3b5998 text',
    );
    expect(hover.texts.some(t => /contradict/.test(t))).toBe(false);
    expect(hover.sets).toEqual(
      expect.arrayContaining([
        'font-weight 700 --on tab',
        'font-size 13px --on tab',
        'font-weight 700 --on tab --state hover',
        'font-size 14px --on tab --state hover',
      ]),
    );
  },
  T,
);

it(
  "still reports a state run's color said for another part",
  async test => {
    needsBases(test);
    for (const q of [
      'tabs with bold 13px #3b5998 text and hovered buttons with bold 14px #3b5998 text',
      'cards with bold 13px #3b5998 text and selected tabs with bold 13px #3b5998 text',
    ])
      expect(
        (await answer(q)).texts.some(t => t.includes('but not "#3b5998"')),
        q,
      ).toBe(true);
  },
  T,
);

it(
  'reads one run said in the same words for two parts as two runs',
  async test => {
    needsBases(test);
    const {sets, texts} = await answer(
      'cards with bold 13px #3b5998 text, buttons with bold 13px #3b5998 text',
    );
    expect(sets.some(c => /'#3b5998' --on card\b/.test(c))).toBe(true);
    expect(sets.some(c => /'#3b5998' --on button\b/.test(c))).toBe(true);
    expect(texts.some(t => t.includes('but not "#3b5998"'))).toBe(false);
    // (A list of parts said with one run reads as before: no part takes the
    // color while another loses it.)
    for (const q of [
      'cards, buttons with bold 13px #3b5998 text',
      'cards, tabs and buttons with bold 13px #3b5998 text',
    ]) {
      const list = await answer(q);
      expect(
        list.sets.some(c => /#3b5998/.test(c)),
        q,
      ).toBe(false);
      expect(
        list.texts.some(t => t.includes('but not "#3b5998"')),
        q,
      ).toBe(true);
    }
  },
  T,
);
