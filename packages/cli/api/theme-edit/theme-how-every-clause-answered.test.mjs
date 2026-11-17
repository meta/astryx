// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every clause of an `editor how` ask ends as a command or a named
 * line, never silence; and long asks keep each clause's own reading: what
 * a look turns into in a state, a typed color beside a rule it keeps, hues
 * of a part's statuses, a typed color beside a theme color's word, a
 * part's underline, a size beside a text color, a page's title, the
 * theme's one mode, and the items of a list of several parts. One row per
 * ask.
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
  cwd = makeLinkedFixture('astryx-theme-how-every-clause-', FIXTURE_PACKAGES);
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
    all: results.flatMap(r => lines(r.commands)),
    first: lines(results[0]?.commands ?? []),
    text: results.map(r => r.text).join('\n'),
  };
};

/**
 * @typedef {{q: string, has?: string[], says?: RegExp, saysNot?: RegExp, saysOrHas?: RegExp[], firstHas?: string[], never?: RegExp}} Row
 * @type {Array<[string, Row]>}
 */
const ROWS = [
  // Named, never silent.
  [
    'a mood clause is named',
    {
      q: 'halloween reskin: pumpkin orange #ff7518 accent, dark mode feel, spooky',
      says: /not used: .*"dark mode feel"/,
    },
  ],
  [
    'a small-text clause beside others is named or written',
    {
      q: 'B2B procurement portal: neutral gray, dense compact forms, small text, square corners',
      says: /"small text"/,
    },
  ],
  [
    'a two-color look is named when unread',
    {
      q: 'luxury fashion brand: black and ivory, gold #b8975a accent, thin light headings, sharp square corners, no shadows, wide letter spacing on headings',
      says: /"ivory"/,
    },
  ],
  // Readings in long asks.
  [
    'what a look turns into in a state',
    {
      q: 'inputs: 1px bottom border that turns accent and 2px when focused',
      has: [
        "border-bottom '2px solid var(--color-accent)' --on inputs --state focus-within",
      ],
      never: /^border-bottom '1px solid var\(--color-accent\)'/,
    },
  ],
  [
    'a typed text color keeps the ban',
    {
      q: 'text #172B4D, never use pure black for text',
      has: ["--color-text-primary '#172b4d' --mode light"],
      never: /'#1f2937'/,
    },
  ],
  [
    'hues of a part’s statuses',
    {
      q: 'status badges: green, amber, red',
      has: ["background-color '#f59e0b' --on badge --when variant:warning"],
      never: /'#f59e0b' --on badge$/,
    },
  ],
  [
    'a typed color beside a theme color’s word',
    {
      q: 'accent buttons #0F6CBD',
      has: ["background-color '#0f6cbd' --on button --when variant:primary"],
    },
  ],
  [
    'a part’s underline is its indicator',
    {
      q: 'selected tab text #0F6CBD with a 2px underline',
      has: ['height 2px --on tab-indicator'],
      never: /text-decoration/,
    },
  ],
  [
    'a size beside a text color',
    {
      q: 'tooltips #172B4D with 12px white text',
      has: ['font-size 12px --on tooltip'],
    },
  ],
  [
    'a page’s title is its top heading',
    {
      q: 'page title 34px bold',
      has: ['font-size 34px --on heading --when level:1'],
      never: /^text-size/,
    },
  ],
  [
    'light mode only in a long ask',
    {
      q: 'big buttons, a cheerful sky blue, high contrast for older parents, light mode only',
      has: ['mode light-only'],
      never: /--mode dark$/,
    },
  ],
  [
    'a look after several parts is the theme’s',
    {
      q: 'dark cards #1c1c1e, popovers #2c2c2e, and subtle borders',
      never: /border .* --on popover$/,
    },
  ],
  [
    'a role after a list is the theme’s',
    {
      q: 'rounder cards, compact tables and a teal accent',
      has: ["accent '#0d9488'"],
      never: /var\(--color-accent\)' --on table-row/,
    },
  ],
  [
    'a tone of body text is its color',
    {q: 'bigger headings and lighter body text', never: /^text-size less$/},
  ],
  [
    'items after a comma leave the with-list',
    {
      q: 'dark sidebar with white text, rounder cards, and bigger headings',
      has: ['corners more --on card'],
      never: /side-nav-heading/,
    },
  ],
  [
    'a heading ask joins the whole with the line that passes',
    {
      q: 'make the buttons less round, make links red, and make headings bigger',
      has: ['corners less --on button', '--text-heading-1-size 1.725rem'],
    },
  ],
  [
    'a look word after a part is no compound part',
    {
      q: 'destructive buttons solid red #df1b41 with white text',
      has: [
        "background-color '#df1b41' --on button --when variant:destructive",
      ],
    },
  ],
  [
    'a highlight said of a part in a state',
    {
      q: 'table rows highlight #F7F8F9 on hover',
      has: [
        "background-color '#f7f8f9' --on table-row --state hover --mode light",
      ],
    },
  ],
  [
    'a mode said first scopes the ask after it',
    {q: 'dark mode only, accent teal', never: /^mode /},
  ],
  [
    'a softer, larger shadow is a bigger one',
    {
      q: 'Softer, larger card shadows only.',
      has: ["box-shadow 'var(--shadow-low)' --on card"],
    },
  ],
  [
    'hover and pressed colors are written or named, never dropped',
    {
      q: 'primary buttons #0C66E4, hover #0055CC, pressed #09326C',
      saysOrHas: [/#0055cc/i, /#09326c/i],
    },
  ],
  [
    'an off color is written or named, never dropped',
    {
      q: 'switches #34C759 when on, #E9E9EA when off',
      saysOrHas: [/#e9e9ea/i],
    },
  ],
  [
    'a mode the other lines carry is never named',
    {
      q: 'in dark mode, cards #2D2D2D and text #FFFFFF',
      saysNot: /not used: .*in dark mode/,
    },
  ],
  [
    'a side the look turns on is the side its state takes',
    {
      q: 'inputs with a 1px bottom border that turns accent and 2px when focused',
      has: [
        "border-bottom '1px solid var(--color-border)' --on inputs",
        "border-bottom '2px solid var(--color-accent)' --on inputs --state focus-within",
      ],
      never: /^border-(?:color|width) /,
    },
  ],
  [
    'a part that sizes itself, then its corners, in the comma form',
    {
      q: 'checkboxes 18px, 4px corners',
      has: [
        'width 18px --on checkbox-indicator --only',
        'border-radius 4px --on checkbox-indicator --only',
      ],
      never: /border-radius 18px/,
    },
  ],
  [
    'translucent said of a part with a fill',
    {
      q: 'nav bar translucent white',
      has: [
        "background-color 'color-mix(in srgb, #ffffff 80%, transparent)' --on app-shell-header --mode light",
      ],
    },
  ],
  [
    'a bare length said of a text style is its size',
    {q: 'footnotes 13px', has: ['--text-supporting-size 13px']},
  ],
  [
    'text after several parts is the theme’s',
    {
      q: 'page #202020, cards #2D2D2D and text #FFFFFF',
      has: ["--color-text-primary '#ffffff' --mode dark"],
      never: /--color-text-primary .* --on card/,
    },
  ],
  [
    'a status color after part clauses is the theme’s role',
    {
      q: 'softer shadows on cards, bolder headings, and a green success color',
      has: ["success '#16a34a'"],
      never: /^color .* --on heading/,
    },
  ],
  [
    'a danger color after part clauses never fills the part',
    {
      q: 'smaller badges, rounder avatars, and a red danger color',
      has: ["danger '#dc2626'"],
      never: /background-color '#dc2626' --on avatar/,
    },
  ],
  [
    'a color said for a theme kept to one mode is that color',
    {
      q: 'esports page: black background, square corners, dark mode only',
      has: ["--color-background-body '#000000'", 'mode dark-only'],
      never: /'#1b1b1b'/,
    },
  ],
  [
    'a lone color after a part item never fills that part',
    {
      q: 'big buttons, a sky blue, high contrast',
      never: /background-color .* --on button/,
    },
  ],
  [
    'a strip said as a noun takes nothing away',
    {
      q: 'pagination pages in one bordered strip',
      says: /not used: "pagination pages in one bordered strip"/,
      never: /border-width 0/,
    },
  ],
  [
    'controls and overlays are the two corner sizes Core keeps apart',
    {
      q: 'controls 4px corners, overlays 8px corners',
      has: ['--radius-element 4px', '--radius-container 8px'],
      saysNot: /contradict/,
    },
  ],
  [
    'a part word before another part word names a kind of it',
    {
      q: 'label badges: pill shaped, 12px medium text, 1px #d1d9e0 border, transparent background',
      has: ['font-size 12px --on badge'],
      never: /--on field-label/,
    },
  ],
  [
    'an underline nav is a row of tabs',
    {
      q: 'underline nav: 2px #fd8c73 underline on the selected item, #59636e text on the rest, 14px text',
      has: ['font-size 14px --on tab'],
      never: /^(?:text-size|--color-text-primary)/,
    },
  ],
  [
    'a navigation rail is the side nav',
    {
      q: 'navigation rail: #fef7ff background, 80px wide; the selected item gets a #e8def8 pill',
      has: ["background-color '#fef7ff' --on side-nav --mode light"],
      never: /--color-background-body|--on item /,
    },
  ],
  [
    'the top nav is the bar, never the frame that holds it',
    {
      q: 'the top nav: #111827 background, white text, and the current item #1f2937 with white text',
      has: ["background-color '#111827' --on top-nav"],
      never: /--on app-shell$/,
    },
  ],
  [
    'a color with a state and no look is the fill in that state',
    {
      q: 'tables: 1px #dee2e6 borders, 8px cell padding, #f8f9fa header background, and a #f8f9fa hover',
      has: [
        "background-color '#f8f9fa' --on table-row --state hover --mode light",
      ],
      never: /--color-border '#f8f9fa'/,
    },
  ],
  [
    'the product word before the colon is no page',
    {
      q: 'live sports scores page: high energy, dense, bold headings, team colors red #c8102e and blue #003da5 as accents, live badge in red',
      has: ["accent '#c8102e'", 'headings bold'],
      never: /--color-background-body|--on app-shell|^color .* --on heading/,
    },
  ],
  [
    'a body font said with headings is the body’s',
    {
      q: 'serif headings with a sans-serif body',
      has: ['font serif --on heading', 'font system --on body'],
      saysNot: /contradict/,
    },
  ],
  [
    'their titles are the titles of the part said before',
    {
      q: 'make dialogs wider, their titles bigger, and the backdrop darker',
      never: /^--text-heading-\d-size [^ ]+$/,
    },
  ],
  [
    'a color said of one side is that side’s line',
    {
      q: 'hovered tab border #eeeeee with a #dddddd bottom',
      has: ["border-bottom '1px solid #dddddd' --on tab --state hover"],
      never: /background-color '#dddddd'/,
    },
  ],
  [
    'per-side colors are lines, never a fill',
    {
      q: 'primary button border color rgba(0,0,0,0.1) on top and sides and rgba(0,0,0,0.25) on the bottom',
      never: /^background-color/,
    },
  ],
];

describe('every clause answered', () => {
  it.each(ROWS)(
    '%s',
    async (_name, row, test) => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const r = await answer(row.q);
      for (const line of row.has ?? []) expect(r.all, row.q).toContain(line);
      if (row.says) expect(r.text, row.q).toMatch(row.says);
      if (row.saysNot) expect(r.text, row.q).not.toMatch(row.saysNot);
      for (const line of row.firstHas ?? [])
        expect(r.first, row.q).toContain(line);
      for (const re of row.saysOrHas ?? [])
        expect(
          re.test(r.text) || r.all.some(line => re.test(line)),
          `${row.q}: ${re}`,
        ).toBe(true);
      if (row.never)
        for (const line of r.all) expect(line, row.q).not.toMatch(row.never);
    },
    300_000,
  );
});
