// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Long asks in `editor how` bind each clause to its own part: a part
 * word in a clause wins over one carried from before; a carried part
 * reaches only the clause right after the one that named it (or every item
 * of a list its part leads, until another part is said); a look out of
 * reach, with no theme word or dial, is named, never written theme-wide or
 * on a part said further back; a mode pair stays on one part. The table
 * holds the rows each rule is read from; the long asks that once wrote on
 * the wrong part are run in the files beside this one, four quarters of
 * one table (long-ask-binding-rows), so each file stays fast.
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
      has: ["--color-text-primary '#ffffff' --on list-item --state selected"],
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
        '--text-heading-1-size 1.275rem',
        '--text-heading-2-size 1.063rem',
        '--text-heading-3-size 0.903rem',
        '--text-heading-4-size 0.744rem',
        '--text-heading-5-size 0.637rem',
        '--text-heading-6-size 0.531rem',
        "background-color '#0f172a' --on table-header-cell",
      ],
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
      q: 'translucent glassy window frames, soft blue-tinted glass, white content',
      has: [
        "background-color 'color-mix(in srgb, #2563eb 15%, transparent)' --on containers",
      ],
      never: /background-color '#2563eb'/,
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
    'a with-list under a subject that names no part writes nothing theme-wide',
    {q: 'kbd hints #2e3035 with #8a8f98 text and 4px corners', noWide: true},
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
