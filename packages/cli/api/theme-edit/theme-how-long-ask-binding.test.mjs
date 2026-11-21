// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Long asks in `editor how` bind each clause to its own part: a part
 * word in a clause wins over one carried from before; a carried part
 * reaches only the clause right after the one that named it (or every item
 * of a list its part leads, until another part is said); a look out of
 * reach is never written on a part said further back: one with a
 * whole-theme meaning goes to the whole theme, any other is named; a mode
 * pair stays on one part. The table
 * holds the rows each rule is read from; the long asks that once wrote on
 * the wrong part are run after it, four quarters of one table
 * (long-ask-binding-rows), on the same theme: no answer writes theme-wide,
 * or on a part, beyond the ones listed for it.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {linesBeyond} from '../../test-utils/long-ask-binding-rows.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-how-binding-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** The first answer that writes, as lines, and every result's text. @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results =
    /** @type {Array<{text: string, commands: string[], offer?: boolean}>} */ (
      data.results ?? []
    );
  const writes = results.find(
    r => !r.offer && r.commands.some(c => / editor set /.test(c)),
  );
  return {
    lines: (writes?.commands ?? [])
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, '')),
    text: results.map(r => r.text).join('\n'),
  };
};

/**
 * @typedef {{q: string, has?: string[], never?: RegExp, says?: RegExp, noWide?: boolean}} Row
 * @type {Array<[string, Row]>}
 */
const ROWS = [
  [
    'a list a part leads with "with" reaches each of its items',
    {
      q: 'cards with a border, a shadow, 12px corners',
      has: ['border-radius 12px --on card'],
      noWide: true,
    },
  ],
  [
    'a list a part leads keeps its border on it',
    {
      q: 'buttons with bold text, 8px corners and a 2px border',
      has: [
        'border-radius 8px --on button',
        "border '2px solid var(--color-border)' --on button",
      ],
      noWide: true,
    },
  ],
  [
    'a list a part leads drops none of its items',
    {
      q: 'buttons with 8px corners, bold text, uppercase',
      has: ['text-transform uppercase --on button'],
      noWide: true,
    },
  ],
  [
    "a look's name before its colon is the theme's look, never an unknown part",
    {
      q: 'neon synthwave: deep purple night background, hot pink accent #ff69b4, cyan accent, a glow',
      has: ["accent '#ff69b4'"],
    },
  ],
  [
    "a likeness list's items are its head's, a text shadow its letters'",
    {
      q: 'alerts like Bootstrap 1: no icon, bold title inline with the message, a gradient fill, a 1px darker border and a text shadow',
      has: ["text-shadow '0 1px 1px rgb(0 0 0 / 25%)' --on banner"],
      never: /^--shadow|^headings bold|box-shadow/,
    },
  ],
  [
    'a comparison said in a mode tells, and its fix keeps the mode',
    {
      q: 'in dark mode the cards look darker than the page, like holes; make cards slightly lighter than the page background',
      has: [
        "background-color '#292929' --on card --when variant:default --mode dark",
      ],
      never: /--mode light/,
    },
  ],
  [
    'what a part should mark is in it',
    {
      q: 'the date picker should circle today in #0969da',
      has: [],
      never: /--on date-input|--on date-time-input/,
    },
  ],
  [
    "a part's own items said after its name are the part's",
    {
      q: 'pagination pages in one bordered strip',
      has: ["border '1px solid var(--color-border)' --on pagination"],
      never: /--border-width/,
    },
  ],
  [
    'a corner look said of a side stays on the part before',
    {
      q: 'cards square on top, 6px rounded at the bottom',
      never: /^(?!.* --on )/,
    },
  ],
  [
    'a selected tab said with its color and an underline keeps both',
    {
      q: 'selected tab #171717 with a 2px #171717 underline, other tabs #666666',
      has: [
        "color '#171717' --on tab --state selected",
        "background-color '#171717' --on tab-indicator --state selected",
        'height 2px --on tab-indicator --state selected',
        "color '#666666' --on tab",
      ],
    },
  ],
  [
    "a selected item's text stays in its state",
    {
      q: 'list items: 1px #dee2e6 border, 8px 16px padding, active item #0d6efd with white text',
      has: ["--color-text-primary '#ffffff' --on list-item --state current"],
    },
  ],
  [
    "the text with its article is the whole app's",
    {
      q: 'make headings semibold and make the text a bit larger',
      has: ['headings semibold', 'text-size more'],
      never: /^--text-heading/,
    },
  ],
  [
    "a label before a part's look names an unknown part, never the page",
    {
      q: 'fab: #eaddff background',
      has: [],
      never: /--color-background-body|--on app-shell/,
    },
  ],
  [
    'white links on a dark bar are written for both modes',
    {
      q: 'dark navigation bar with white links',
      has: ["--color-text-accent '#ffffff' --on app-shell-header"],
      never: /--mode dark/,
    },
  ],
  [
    "a box word in a part's list is that part's box",
    {
      q: 'Make the menus and dropdowns look like 3.1 menus: plain white boxes, black outline, navy highlight bar.',
      has: ["background-color '#ffffff' --on menus --mode light"],
      never: /--on containers/,
    },
  ],
  [
    "a dial look said after a part item is the whole theme's",
    {
      q: 'Apple iOS look: system blue accent #007AFF, light gray #F2F2F7 grouped background, white cards with 12px corners, SF Pro font, 17px text, flat surfaces',
      has: ['surfaces flat'],
    },
  ],
  [
    "every item of a with-list is its head's",
    {
      q: 'Shopify Polaris look: page background #F1F1F1, white cards with 12px corners, primary buttons #303030 with white text and 8px corners, text color #303030, Inter font, 13px text',
      has: ['border-radius 8px --on button --when variant:primary'],
    },
  ],
  [
    "every item of a with-list is its head's, after its border",
    {
      q: 'Windows 11 Fluent look: accent #0067C0, page #F3F3F3, cards #FBFBFB with a 1px #E5E5E5 border and 8px corners, Segoe UI Variable font, 14px text',
      has: ['border-radius 8px --on card'],
    },
  ],
  [
    "no shadows after a part item is the whole theme's",
    {
      q: 'museum gallery site: quiet and minimal, lots of white space, pure white page, near-black text, one deep red #9b1c1c accent, thin light headings, square corners, no shadows, roomy spacing',
      has: ['--shadow-low none', '--shadow-med none', '--shadow-high none'],
    },
  ],
  [
    "no shadows at the end of a long ask is the whole theme's",
    {
      q: 'government multi-step form: plain and accessible, clear error messages, high contrast, larger text, visible thick focus ring, dark blue #1d4ed8 accent, square corners, no shadows',
      has: ['--shadow-low none', '--shadow-med none', '--shadow-high none'],
    },
  ],
  [
    'no shadows after a part item, beside letter spacing',
    {
      q: 'luxury fashion brand: black and ivory, gold #b8975a accent, thin light headings, sharp square corners, no shadows, wide letter spacing on headings',
      has: ['--shadow-low none', '--shadow-med none', '--shadow-high none'],
    },
  ],
  [
    'bold text after controls named by their use',
    {
      q: 'field-service mobile app used outdoors: big touch targets, very high contrast for sunlight, large bold text, bold safety orange #ea580c accent, thick borders, light only',
      has: ['font-weight 700 --on inputs'],
    },
  ],
  [
    "bold system type after a part item is the body's weight",
    {
      q: 'Make it look like a 1990s Mac: platinum gray, black pinstripe title bar, square corners, Chicago-style bold system type.',
      has: ['--text-body-weight 700'],
    },
  ],
  [
    'a fill said with its own text stays the fill',
    {
      q: 'Make the whole app denser, like a trading dashboard.\nThe inputs are too cramped now; give just the inputs back their normal size.\nTable rows could be even tighter.\nHeadings feel too big for this density; make them a bit smaller.\nUndo the heading change.\nNow give the top bar our navy #0F172A with white text.',
      has: [
        'spacing less',
        'spacing less --on table-row',
        "background-color '#0f172a' --on app-shell-header",
      ],
      // (The top bar a sentence after the table is the app's, never the
      // table's header; the heading change the ask undoes is not written.)
      never: /--on table-header-cell|--text-heading-\d-size/,
    },
  ],
  [
    'a theme border color after part items',
    {
      q: "This is my React app, built with Astryx (the astryx command is installed). Make it look like GitHub's dark theme (Primer dark): near-black #0d1117 page, #161b22 surfaces, gray borders, the system font stack, green primary buttons, blue links, 6px corners, dense layout. I am away, don't wait for answers.",
      has: ["--color-border '#9e9e9e'"],
    },
  ],
  [
    'an undo takes back only the change of what it names',
    {
      q: 'Make the cards rounder. Reset the card shadows.',
      has: ['corners more --on card'],
      says: /sets nothing for shadow on card/,
    },
  ],
  [
    'a change said after an undo stands',
    {
      q: 'Undo the heading change. Then make the headings bold.',
      has: ['headings bold'],
      says: /^(?![\s\S]*not used)/,
    },
  ],
  [
    'an undo of a change said earlier names no clause as not used',
    {
      q: 'Headings a bit smaller. Undo the heading change. A blue accent.',
      has: ["accent '#2563eb'"],
      never: /--text-heading-\d-size/,
      says: /^(?![\s\S]*not used)/,
    },
  ],
  [
    // (Replaces the take-nothing-back reading: each change the undo names
    // was said earlier in the ask, so each is taken back.)
    'an undo that names two changes takes back both',
    {
      q: 'Make the cards rounder. Make the headings bold. Undo the card change and the heading change.',
      never: /--on card|^headings |--on heading/,
      says: /card and heading changes said earlier/,
    },
  ],
  [
    'an undo that names two parts at once takes back both',
    {
      q: 'Cards rounder. Headings bigger. Undo the card and heading changes. A blue accent.',
      has: ["accent '#2563eb'"],
      never: /--on card|--text-heading-\d-size|^headings /,
    },
  ],
  // (Replaces the base's "none is taken back" row: an undo that names
  // several changes takes back each one said earlier.)
  [
    'an undo that names two changes takes back the one said earlier',
    {
      q: 'Make the headings bold. Undo the card change and the heading change.',
      never: /^headings |--on heading/,
    },
  ],
  [
    'a part-less undo of a look said on a part takes nothing back and says so',
    {
      q: 'Make the cards rounder. Undo the corner change.',
      has: ['corners more --on card'],
      says: /does not say which earlier change/,
    },
  ],
  [
    // (Replaces the take-nothing-back reading: the size named is one of
    // the two changes, and only it is taken back.)
    'an undo that names a look takes back only that look',
    {
      q: 'Make the headings bigger. Make the headings bold. Undo the heading size change.',
      has: ['headings bold'],
      never: /--text-heading-\d-size/,
    },
  ],
  [
    'an undo of a longer part name never takes back the shorter part said earlier',
    {
      q: 'Make the buttons blue. Make the button group rounder. Undo the button group change.',
      has: ["background-color '#2563eb' --on button"],
    },
  ],
  [
    'an undo of the code block header keeps the code blocks change',
    {
      q: 'Make the code blocks rounder. Make the code block header bold. Undo the code block header change.',
      has: ['corners more --on code-block'],
    },
  ],
  [
    'an undo names a part by its whole name, never a part that shares a word',
    {
      q: 'Make the code block header darker. Make the code block copy button blue. Undo the code block header change.',
      has: ["background-color '#2563eb' --on code-block-copy-button"],
    },
  ],
  [
    "an undo of a part's color never takes back its size",
    {
      q: 'Make the headings bigger. Make the headings blue. Undo the heading color change.',
      has: ['--text-heading-1-size 1.725rem'],
    },
  ],
  [
    "an undo of a part's size takes back its room when that was its size",
    {
      q: 'Make the buttons bigger. Undo the button size change.',
      never: /--on button|sets nothing/,
    },
  ],
  [
    "an undo of a card's size keeps its color",
    {
      q: 'Make the cards bigger. Make the cards blue. Undo the card size change.',
      has: ["background-color '#2563eb' --on card --when variant:default"],
      never: /spacing more --on card/,
    },
  ],
  [
    'an undo of the text takes back the text size said earlier',
    {
      q: 'Make the text bigger. Undo the text change.',
      never: /^text-size |sets nothing/,
    },
  ],
  [
    'an undo of the body text takes back the text size said earlier',
    {
      q: 'Make the body text bigger. Undo the body text change.',
      never: /^text-size |--text-body-size|sets nothing/,
    },
  ],
  [
    'a value an undo took back is never named not used',
    {
      q: 'Make the headings 20px. Undo the heading change. A blue accent.',
      has: ["accent '#2563eb'"],
      says: /^(?![\s\S]*not used)/,
    },
  ],
  [
    "an undo of a part's color takes back its fill",
    {
      q: 'Make the buttons blue. Undo the button color change.',
      never: /--on button/,
    },
  ],
  [
    "an undo of a part's color takes back its fill and its text",
    {
      q: 'Blue buttons with white text. Undo the button color change.',
      never: /--on button/,
      says: /taken back by its undo/,
    },
  ],
  [
    'any family said as a style of the type is that family',
    {q: 'Gotham-style font', has: ['font Gotham'], never: /gothamstyle/i},
  ],
  [
    'a system font said as a style of the type is that font',
    {q: 'Arial-style font', has: ['font Arial'], never: /arialstyle/i},
  ],
  [
    'an undo of a whole-theme change said earlier takes it back',
    {
      q: 'Make the corners rounder. Undo the corner change.',
      never: /^corners /,
    },
  ],
  [
    'two undos each take back their own change',
    {
      q: 'Cards rounder. Headings bigger. Undo the card change. Undo the heading change. A blue accent.',
      has: ["accent '#2563eb'"],
      never: /--on card|--text-heading-\d-size|^headings /,
    },
  ],
  [
    'a change said again after its undo is written',
    {
      q: 'Make the cards rounder. Undo the card change. Make the cards rounder.',
      has: ['corners more --on card'],
    },
  ],
  [
    'a font said as a style of the type is that font',
    {q: 'Helvetica-style type', has: ['font helvetica']},
  ],
  [
    'a font said as a style of the headings is their font',
    {q: 'Helvetica-style headings', has: ['font helvetica --on heading']},
  ],
  [
    'a style word said of the type is its likeness, never a color',
    {
      q: 'Charcoal-style bold system font, blue-purple selection',
      never: /^accent '#333333'|^neutral '#333333'/,
      says: /^(?![\s\S]*contradict)/,
    },
  ],
  [
    'a size word of the part said before reaches it across a font clause',
    {
      q: "This is my React app, built with Astryx (the astryx command is installed). Make it look like Mac OS 9 Platinum: light platinum gray surfaces, pinstriped-feeling title bars, beveled gray buttons, Charcoal-style bold system font, small rounded corners, blue-purple selection. I am away, don't wait for answers.",
      has: ['corners round --on button --when size:sm'],
    },
  ],
  [
    "a likeness colon list is every head part's",
    {
      q: "Make menus and popovers look like Slack's: white, rounded, soft shadow, purple hover. I am away, don't wait for answers.",
      has: ["background-color '#7c3aed' --on popover --state hover"],
    },
  ],
  [
    'a likeness colon list reaches its last head part',
    {
      q: "Make the menus, popovers and dialogs look like Stripe's: white, rounded, soft shadow. I am away, don't wait for answers.",
      has: ["box-shadow 'var(--shadow-low)' --on dialog"],
    },
  ],
  [
    'frosted glass frames are the glass surfaces',
    {
      q: "Make the frames and title areas look like frosted blue glass. I am away, don't wait for answers.",
      has: ['surfaces glass'],
    },
  ],
  [
    "friendly rounded corners after part items are the theme's corners",
    {
      q: "This is my React app, built with Astryx (the astryx command is installed). Make it look like Slack: deep aubergine (#4a154b) left sidebar with white text, white content area, Lato-like font, friendly rounded corners, green online dots. I am away, don't wait for answers.",
      has: ['corners round'],
    },
  ],
  [
    'a tinted glass is a tint, in the whole answer too',
    {
      // (A soft blue said as a tint is a pale wash of it, as main reads
      // it; the tint reading is in the follow-up #13044.)
      q: 'translucent glassy window frames, soft blue-tinted glass, white content',
      has: ["background-color '#eff6ff' --on containers --mode light"],
      never: /'#2563eb'/,
    },
  ],
  [
    'a theme color fill keeps its text readable, in the whole answer too',
    {
      q: 'tabs 14px text, selected tab accent, other tabs gray',
      has: [
        "background-color 'var(--color-accent)' --on tab --state selected",
        "color 'var(--color-on-accent)' --on tab --state selected",
      ],
    },
  ],
  [
    'a status word with no part is never written on a carried part',
    {
      q: 'Theme our B2B invoicing app: trustworthy corporate navy, crisp white surfaces, compact tables with zebra rows, green for paid and red for overdue, tabular numbers, light and dark.',
      never: /background-color '#dc2626'/,
    },
  ],
  [
    'a control that fills when checked takes the color when checked only',
    {
      q: 'switches, checkboxes, progress bars and tab underlines in magenta',
      has: [
        "background-color '#c026d3' --on switch --state checked",
        "background-color '#c026d3' --on checkbox-indicator --state checked --only",
      ],
      never: /--on (?:switch|checkbox-indicator)(?: --only)?$/,
    },
  ],
  [
    'other tabs after a tab clause: their text',
    {
      q: 'tabs 14px text, selected tab #171717 with a 2px #171717 underline, other tabs #666666',
      has: ["color '#666666' --on tab"],
      never: /background-color '#666666'/,
    },
  ],
  [
    'a fill-less item: a bare color is its text',
    {
      q: 'page #08090a, sidebar #0f1011, sidebar items #8a8f98 and selected item #f7f8f8 text on #1c1d1f',
      has: [
        "color '#8a8f98' --on side-nav-item",
        "color '#f7f8f8' --on side-nav-item --state selected",
      ],
      never: /^--color-text-primary/,
    },
  ],
  [
    'a with-list under a part and its own noun stays on that part',
    {
      q: 'kbd hints #2e3035 with #8a8f98 text and 4px corners',
      has: [
        "background-color '#2e3035' --on kbd-key",
        "--color-text-primary '#8a8f98' --on kbd",
        'border-radius 4px --on kbd-key',
      ],
      noWide: true,
    },
  ],
  [
    'a mode pair stays on the list part',
    {
      q: 'inputs #ffffff in light mode and #1a1f36 in dark mode, borders #d5dbe1 in light mode and #30313d in dark mode, text #1a1f36 in light mode',
      has: ["border-color '#d5dbe1' --on inputs --mode light"],
      never: /^--color-border /,
    },
  ],
  [
    "a list's rows are its head part's rows",
    {
      q: 'menus with 4px padding and 32px rows',
      has: ['min-height 32px --on dropdown-menu-item'],
      never: /--on table-row/,
    },
  ],
  [
    'a carried part reaches only the next item',
    {
      q: 'badges pill shaped, rounder cards, compact tables, 12px text, gray #E3E3E3 background',
      never: /background-color .* --on table-row/,
      says: /"gray background #e3e3e3" names no part/i,
    },
  ],
  [
    'links said in a sidebar that holds none take the link color, as main reads them',
    {
      q: 'sidebar: #111827 background, white links',
      has: [
        "background-color '#111827' --on side-nav",
        "--color-text-accent '#ffffff' --mode dark",
      ],
      never: /--on side-nav-item/,
    },
  ],
  [
    "a brief's state look led by a label is the part the brief named, as main reads it",
    {
      q: 'Surface: filled fields. Feel: 8% tint on hover.',
      has: [
        "background-color '#f2f2f2' --on inputs --state hover --mode light",
        "background-color '#242424' --on inputs --state hover --mode dark",
      ],
    },
  ],
  [
    'a whole brief keeps its labelled hover look on the fields it named',
    {
      q: 'Material (M2 web) — Type: Roboto 14px, 1.43 leading. Density: comfortable. Surface: raised (elevation shadows on buttons and cards), filled fields. Edges: 4px corners. Feel: 8% tint on hover, 12% on press. Color: purple #6200ee primary, teal #03dac6 secondary.',
      has: [
        "background-color '#f2f2f2' --on inputs --state hover --mode light",
        "background-color '#242424' --on inputs --state hover --mode dark",
        'corners 4px',
      ],
    },
  ],
  [
    "a part a colon list's head does not hold is its own, as main reads it",
    {
      q: 'navigation rail: #fef7ff background, rounder cards, compact tables, 80px wide; the selected item gets a #e8def8 pill',
      has: ['corners more --on card', 'spacing less --on table-row'],
    },
  ],
  [
    "a part a colon list's head cannot keep apart is the part's own ask",
    {
      q: 'cards: white background, rounder cards, compact tables, 8px radius, shadow-sm, ring-1 ring-gray-900/5',
      has: ['corners more --on card', 'spacing less --on table-row'],
    },
  ],
  [
    "a piece a colon list's head holds stays the head's, never every one",
    {
      q: 'toasts: #322f35 background, rounder cards, compact tables, #f5eff7 text, #d0bcff action button text',
      has: ['corners more --on card', 'spacing less --on table-row'],
      never: / --on button\b/,
    },
  ],
  [
    "a part's line said again after other parts' asks is that line",
    {
      q: 'inputs: 1px border #79747e, rounder cards, compact tables, 2px #6750a4 when focused',
      has: ["border '2px solid #6750a4' --on inputs --state focus-within"],
      never: /background-color '#6750a4'/,
      says: /^(?![\s\S]*not used: "2px #6750a4)/,
    },
  ],
  [
    'links said in tabs, which hold none, take the link color, as main reads them',
    {
      q: 'tabs: 14px text, blue links',
      has: ['font-size 14px --on tab', "--color-text-accent '#2563eb'"],
    },
  ],
  [
    'a white fill with link colors only stays light mode, the body text unchanged',
    {
      q: 'dialogs: white background, blue links',
      has: [
        "background-color '#ffffff' --on dialog --mode light",
        "--color-text-accent '#2563eb' --on dialog",
      ],
      never: /background-color '#ffffff' --on dialog$/,
    },
  ],
];

describe('long asks bind each clause to its own part', () => {
  it.each(ROWS)(
    '%s',
    async (_name, row, test) => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const r = await answer(row.q);
      for (const line of row.has ?? []) expect(r.lines, row.q).toContain(line);
      if (row.never)
        for (const line of r.lines) expect(line, row.q).not.toMatch(row.never);
      if (row.says) expect(r.text, row.q).toMatch(row.says);
      if (row.noWide)
        for (const line of r.lines) expect(line, row.q).toMatch(/ --on /);
    },
    300_000,
  );
});

describe('long asks bind each clause to its own part', () => {
  it('quarter 1: no answer writes beyond its own parts and theme words', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    expect(await linesBeyond(answer, 0)).toEqual([]);
  }, 300_000);
});

describe('long asks bind each clause to its own part', () => {
  it('quarter 2: no answer writes beyond its own parts and theme words', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    expect(await linesBeyond(answer, 1)).toEqual([]);
  }, 300_000);
});

describe('long asks bind each clause to its own part', () => {
  it('quarter 3: no answer writes beyond its own parts and theme words', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    expect(await linesBeyond(answer, 2)).toEqual([]);
  }, 300_000);
});

describe('long asks bind each clause to its own part', () => {
  it('quarter 4: no answer writes beyond its own parts and theme words', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    expect(await linesBeyond(answer, 3)).toEqual([]);
  }, 300_000);
});

describe('icons in a container', () => {
  // Icons are the app's own content, so a container holds them: both icon
  // tokens are offered on it, as for any part it holds.
  it('icons in cards red offers both icon tokens on the card', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const {data} = await themeEditHow('icons in cards red', {cwd, theme: 'n'});
    const all = JSON.stringify(data);
    expect(all).toContain("--color-icon-secondary '#dc2626' --on card");
    expect(all).toContain("--color-icon-primary '#dc2626' --on card");
  }, 300_000);
});
