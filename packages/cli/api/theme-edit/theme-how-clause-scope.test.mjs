// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`'s clause scope, as one table: for every clause in an
 * ask, its part (its own, the part before it only as a modifier of it, or
 * the whole theme), its state (named, never widened) and its mode (its
 * own, a sentence's leading mode, a run's trailing mode, and the
 * light/dark color rule). Each row is a wrong write found in the blind,
 * clone and wild passes, and the answer it must give now; a few rows
 * guard the modifier forms that must still take the part before.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-how-clause-scope-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  // (A theme whose changes show's missed list has an entry for: the
  // disabled primary button after a new accent.)
  await themeEditNew('mt', {cwd, like: 'neutral'});
  await themeEditSet('mt', 'accent', '#dc2626', {cwd});
  // (A base whose cards draw dark text in dark mode.)
  await themeEditNew('bt', {cwd, like: 'butter'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * @param {string} q
 * @param {string} [theme]
 */
const answer = async (q, theme = 'n') => {
  const {data} = await themeEditHow(q, {cwd, theme});
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
    texts: results.map(r => r.text),
  };
};

/**
 * One row: the ask, and what its answer must be. `first` is the exact
 * first sequence; `has` lines it holds; `lead` its first line; `never` a
 * line no command may match.
 * @typedef {{
 *   q: string,
 *   theme?: string,
 *   first?: string[],
 *   has?: string[],
 *   lead?: string,
 *   never?: RegExp,
 *   firstText?: RegExp,
 *   textNever?: RegExp,
 * }} Row
 */

/** @type {Array<[string, Row]>} */
const PART = [
  // A whole-theme clause after a part clause is the theme's.
  [
    '"make everything more compact" after a part',
    {
      q: 'buttons: 3px radius; make everything more compact',
      first: ['border-radius 3px --on button', 'spacing less'],
    },
  ],
  [
    '"text color #303030" after a part',
    {
      q: 'primary buttons with white text; text color #303030',
      has: ["--color-text-primary '#303030' --mode light"],
    },
  ],
  [
    '"; 14px text"',
    {
      q: 'cards with a subtle shadow; 14px text',
      first: ["box-shadow 'var(--shadow-low)' --on card", 'text-size 14'],
    },
  ],
  [
    '", larger text"',
    {
      q: 'pill buttons, larger text',
      first: ['corners pill --on button', 'text-size more'],
    },
  ],
  [
    '"; roomier spacing"',
    {
      q: 'cards: 24px radius; roomier spacing',
      first: ['border-radius 24px --on card', 'spacing more'],
    },
  ],
  [
    '", thick borders"',
    // ("big buttons" is an ask of its own now, wild N14: both run.)
    {
      q: 'big buttons, thick borders',
      first: ['spacing more --on button', '--border-width 2px'],
    },
  ],
  [
    'font, text size and surfaces after a with-list',
    {
      q: 'white cards with 12px corners, SF Pro font, 17px text, flat surfaces',
      has: ['border-radius 12px --on card', "font 'SF Pro'", 'text-size 17'],
      never: /(?:font|text-size|box-shadow).*--on card/,
    },
  ],
  [
    '", Inter font, compact spacing"',
    {
      q: 'primary buttons #303030, Inter font, compact spacing',
      first: [
        "background-color '#303030' --on button --when variant:primary",
        'font inter',
        'spacing compact',
      ],
    },
  ],
  [
    "wild: a page's text is the theme's",
    {
      q: 'sepia page #f6f0e4 in light mode, dark brown text',
      first: [
        // (The page joins with its frame and main panel lines.)
        "--color-background-body '#f6f0e4' --mode light",
        "background-color '#f6f0e4' --on app-shell --mode light",
        "background-color '#f6f0e4' --on layout-content --mode light",
        "--color-text-primary '#92400e' --mode light",
      ],
    },
  ],
  [
    'wild: "a black page with green text"',
    {
      q: 'black page with green text',
      first: [
        "--color-background-body '#000000' --mode dark",
        "background-color '#000000' --on app-shell --mode dark",
        "background-color '#000000' --on layout-content --mode dark",
        "--color-text-primary '#16a34a' --mode dark",
      ],
    },
  ],
  [
    'wild: "green text on a black page" paints the page black, the text green',
    {
      q: 'green text on a black page',
      first: [
        "--color-background-body '#000000' --mode dark",
        "background-color '#000000' --on app-shell --mode dark",
        "background-color '#000000' --on layout-content --mode dark",
        "--color-text-primary '#16a34a' --mode dark",
      ],
    },
  ],
  // The modifier forms still take the part before.
  [
    'a with-modifier',
    {
      q: 'navy header with white text',
      lead: "background-color '#1e3a8a' --on app-shell-header",
      has: ["--color-text-primary '#ffffff' --on app-shell-header"],
    },
  ],
  [
    "a part's colon list",
    {
      q: 'cards: white background, 1px border, 12px radius',
      has: ['border-width 1px --on card', 'border-radius 12px --on card'],
    },
  ],
  [
    "a part's own text color after a comma",
    {
      q: 'buttons blue, white text',
      first: [
        "background-color '#2563eb' --on button --when variant:primary",
        "background-color '#2563eb' --on button --when variant:secondary",
        "background-color '#2563eb' --on button --when variant:ghost",
        "color '#ffffff' --on button",
      ],
    },
  ],
  [
    'a clause after one naming its part in a state',
    {
      q: 'when I tab to a link, show a thick outline',
      lead: "border '2px solid var(--color-border)' --on link --state focus-visible",
    },
  ],
];

/** @type {Array<[string, Row]>} */
const STATE_MODE = [
  [
    '"when off" is the resting look, checked kept',
    {
      q: 'switches: track #e5e7eb when off',
      lead: "background-color '#e5e7eb' --on switch",
      // (The checked look kept is the accent it draws, never the off gray:
      has: [
        "background-color 'var(--color-accent)' --on switch --state checked",
      ],
    },
  ],
  [
    'a leading "in dark mode:" covers every clause',
    {
      q: 'in dark mode: page #202020, cards #2B2B2B, card border #1D1D1D, accent #4CC2FF',
      first: [
        "--color-background-body '#202020' --mode dark",
        "background-color '#202020' --on app-shell --mode dark",
        "background-color '#202020' --on layout-content --mode dark",
        "background-color '#2b2b2b' --on card --when variant:default --mode dark",
        "background-color '#2b2b2b' --on card --when variant:transparent --mode dark",
        "background-color '#2b2b2b' --on card --when variant:muted --mode dark",
        "border-color '#1d1d1d' --on card --mode dark",
        "--color-accent '#4cc2ff' --mode dark",
      ],
    },
  ],
  [
    "a run's trailing mode covers the run",
    {
      q: 'secondary buttons white with a 1px border and a small shadow in light mode',
      lead: "background-color '#ffffff' --on button --when variant:secondary --mode light",
    },
  ],
  [
    'each half of a mode pair keeps its own mode and fill',
    {
      q: 'primary buttons black with white text in light mode and white with black text in dark mode',
      first: [
        "background-color '#000000' --on button --when variant:primary --mode light",
        "color '#ffffff' --on button --when variant:primary --mode light",
        "background-color '#ffffff' --on button --when variant:primary --mode dark",
        "color '#000000' --on button --when variant:primary --mode dark",
      ],
    },
  ],
  [
    'mode pairs never cross a sentence',
    {
      q: 'text #171717 in light mode and #ededed in dark mode; secondary text #4d4d4d in light mode and #a1a1a1 in dark mode',
      first: [
        "--color-text-primary '#171717' --mode light",
        "--color-text-primary '#ededed' --mode dark",
        "--color-text-secondary '#4d4d4d' --mode light",
        "--color-text-secondary '#a1a1a1' --mode dark",
      ],
    },
  ],
];

/** @type {Array<[string, Row]>} */
const COLOR_RULE = [
  [
    "a light page color is the light mode's",
    {
      q: 'cream background',
      lead: "--color-background-body '#fef3c7' --mode light",
    },
  ],
  [
    'a typed light page color',
    {
      q: 'page bg #F2F2F7',
      lead: "--color-background-body '#f2f2f7' --mode light",
    },
  ],
  [
    '"in both modes" writes it whole',
    {
      q: 'make the page #fffbeb in both modes',
      lead: "--color-background-body '#fffbeb'",
    },
  ],
  [
    'white cards',
    {
      q: 'cards: white background',
      lead: "background-color '#ffffff' --on card --when variant:default --mode light",
    },
  ],
  [
    'a dark card and its text',
    {
      q: 'cards #0f1011; main text #f7f8f8',
      first: [
        "background-color '#0f1011' --on card --when variant:default --mode dark",
        "background-color '#0f1011' --on card --when variant:transparent --mode dark",
        "background-color '#0f1011' --on card --when variant:muted --mode dark",
        "--color-text-primary '#f7f8f8' --mode dark",
      ],
    },
  ],
  [
    'a light fill on a button variant',
    {
      q: 'secondary buttons: background #f6f8fa',
      lead: "background-color '#f6f8fa' --on button --when variant:secondary --mode light",
    },
  ],
  [
    'a light border on a part keeps the dark border color',
    {
      q: 'cards: 1px border #e5e7eb',
      lead: "border '1px solid light-dark(#e5e7eb, var(--color-border))' --on card",
    },
  ],
  [
    'a light theme border color',
    {
      q: 'body text should be #1a1f36; borders #e3e8ee',
      first: [
        "--color-text-primary '#1a1f36' --mode light",
        "--color-border '#e3e8ee' --mode light",
      ],
    },
  ],
  [
    'a color word said for dark mode is its dark tone',
    {
      q: 'the info banner subtle gray in dark mode',
      lead: "background-color '#374151' --on banner --when status:info --mode dark",
    },
  ],
  [
    "a light selected row is the light mode's",
    {
      q: 'selected rows light blue',
      lead: "--color-accent-muted '#dbeafe' --on table-row --state selected --mode light",
    },
  ],
  [
    'wild: muted text a dark page would not read',
    {
      q: 'muted text #6b7280',
      lead: "--color-text-secondary '#6b7280' --mode light",
    },
  ],
  [
    'a link color a dark page would not read',
    {
      q: 'links dark blue #0033aa',
      lead: "--color-text-accent '#0033aa' --mode light",
    },
  ],
  [
    'navy buttons spare the variants whose text it would hide, and the destructive red',
    {
      q: 'navy buttons',
      lead: "background-color '#1e3a8a' --on button --when variant:primary",
      never: /variant:(?:secondary|ghost|destructive)/,
    },
  ],
  [
    "a page gray is the theme's gray per mode, never one gray",
    {
      q: 'page background is too blue, make it gray',
      // (A gray: the theme's gray step and its mirror, per the parent's
      // ruling on gray words on a surface.)
      lead: "--color-background-body 'light-dark(#9e9e9e, #525252)'",
    },
  ],
  [
    'the color a complaint names is the part now, never a value',
    {
      q: 'the pink page background is a bit much, make the page a warm cream in light mode',
      lead: "--color-background-body '#fef3c7' --mode light",
      never: /#db2777|#fceef4|#360a1e/,
    },
  ],
];

/** @type {Array<[string, Row]>} */
const LATER_ASKS = [
  [
    'a ban on black text after a page never paints the page',
    {
      q: 'white page, never use pure black for text',
      lead: "--color-background-body '#ffffff' --mode light",
      never: /--color-background-body '#000000'/,
    },
  ],
  [
    '"instead of outlined" takes the part\'s own outline away',
    {
      q: 'inputs filled gray instead of outlined',
      has: ['border none --on inputs'],
      never: /--border-width/,
    },
  ],
  [
    "the part's text in its with-list",
    {
      q: 'badges with a subtle colored background and dark text',
      lead: "color '#111827' --on badge",
      never: /^--color-text-primary/,
    },
  ],
  [
    'the header row is the header cells',
    {q: 'table header row gray', never: /--on table-row/},
  ],
  [
    "a light border keeps the part's own dark-mode border",
    {
      q: 'inputs: 1px border #d5dbe1',
      lead: "border '1px solid light-dark(#d5dbe1, var(--color-border-emphasized))' --on inputs",
    },
  ],
  [
    '"unselected tabs gray" is their text, the selected look said',
    {
      q: 'selected tab text white, unselected tabs gray',
      has: ["color '#9e9e9e' --on tab"],
      never: /background-color/,
    },
  ],
  [
    "a direction is never swapped for a color word's dark tone",
    {
      q: 'make the card background darker',
      theme: 'bt',
      textNever: /dark tone/,
    },
  ],
  [
    'a dark link color the dark page would not read',
    {q: 'dark red links', lead: "--color-text-accent '#991b1b' --mode light"},
  ],
  [
    'a token list: each item its own, light ones light mode',
    {
      q: 'primary #4f46e5, primary hover #4338ca, page background #f9fafb, card surface #ffffff, text #111827, muted text #6b7280, border #e5e7eb',
      has: [
        "--color-background-body '#f9fafb' --mode light",
        "background-color '#ffffff' --on card --when variant:default --mode light",
        "--color-text-primary '#111827' --mode light",
      ],
      never: /--color-text-[a-z]+ '#111827' --on card/,
    },
  ],
];

/** @type {Array<[string, Row]>} */
const OTHER = [
  [
    'softer corners are rounder',
    {q: 'softer corners', first: ['corners more']},
  ],
  [
    'a prohibition on part text never writes the color',
    {q: 'never use pure black for button text', never: /'#000000'/},
  ],
  [
    'a size word before what changes is the amount',
    {
      q: 'a small shadow on inputs',
      first: ["box-shadow 'var(--shadow-low)' --on inputs"],
    },
  ],
  [
    "the ask leads show's missed list",
    {
      q: 'secondary buttons white with a subtle bottom shadow',
      theme: 'mt',
      firstText: /^all of it/,
    },
  ],
  [
    'a missed entry that says otherwise is not offered',
    {
      q: 'disabled primary buttons #9ca3af',
      theme: 'mt',
      never: /--color-neutral/,
    },
  ],
];

describe('clause scope', () => {
  for (const [group, rows] of /** @type {const} */ ([
    ['part', PART],
    ['state and mode', STATE_MODE],
    ['the light/dark color rule', COLOR_RULE],
    ['', LATER_ASKS],
    ['and the rest', OTHER],
  ]))
    describe(group, () => {
      it.each(rows)(
        '%s',
        async (_, row, test) => {
          if (unbuilt) {
            console.warn(`skipped: ${unbuilt}`);
            test.skip();
          }
          const r = await answer(row.q, row.theme);
          if (row.first) expect(r.first, row.q).toEqual(row.first);
          if (row.lead) expect(r.first[0], row.q).toBe(row.lead);
          for (const h of row.has ?? []) expect(r.all, row.q).toContain(h);
          if (row.never)
            for (const c of r.all) expect(c, row.q).not.toMatch(row.never);
          if (row.firstText) expect(r.texts[0], row.q).toMatch(row.firstText);
          if (row.textNever)
            for (const t of r.texts)
              expect(t, row.q).not.toMatch(row.textNever);
        },
        300_000,
      );
    });
});
