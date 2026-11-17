// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Long asks in `editor how` bind each clause to its own part: a part
 * word in a clause wins over one carried from before; a carried part
 * reaches only the clause right after the one that named it (or every item
 * of a list its part leads, until another part is said); a look out of
 * reach, with no theme word or dial, is named, never written theme-wide or
 * on a part said further back; a mode pair stays on one part. The table
 * holds long asks that wrote on the wrong part, each also said with two
 * other parts' clauses in between; no answer may write theme-wide, or on a
 * part, beyond the ones listed for it.
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
 * Each ask, the settings it may write theme-wide, and the parts it may
 * write on.
 * @type {Array<[string, string[], string[]]>}
 */
const LOCK = [
  [
    'rounder cards, compact tables and a teal accent',
    ['accent'],
    ['card', 'table-row'],
  ],
  [
    'compact tables, no borders on cards, and a teal accent',
    ['accent'],
    ['card', 'table-row'],
  ],
  [
    'dark sidebar with white text, rounder cards, and bigger headings',
    [
      '--text-heading-1-size',
      '--text-heading-2-size',
      '--text-heading-3-size',
      '--text-heading-4-size',
      '--text-heading-5-size',
      '--text-heading-6-size',
    ],
    ['card', 'side-nav'],
  ],
  ['compact tables and a teal accent', ['accent'], ['table-row']],
  [
    'bigger headings and lighter body text',
    [
      '--color-text-primary',
      '--text-heading-1-size',
      '--text-heading-2-size',
      '--text-heading-3-size',
      '--text-heading-4-size',
      '--text-heading-5-size',
      '--text-heading-6-size',
    ],
    [],
  ],
  ['compact tables, no borders on cards', [], ['card', 'table-row']],
  ['the danger button outline, and links underlined', [], ['button', 'link']],
  ['badges 4px corners, 12px text and no border', [], ['badge']],
  [
    'tooltips #0f0f0f with white text, 4px corners and 12px text',
    [],
    ['tooltip'],
  ],
  [
    'side nav #08090a, items 13px text, selected item #1c1d1f with #f7f8f8 text',
    [],
    ['side-nav', 'side-nav-item'],
  ],
  ['badges pill corners, 12px text and no border', [], ['badge']],
  [
    'list items: 1px #dee2e6 border, 8px 16px padding, active item #0d6efd with white text',
    [],
    ['list-item'],
  ],
  [
    'navigation bar: #f3edf7 background, 80px tall; the selected item gets a #e8def8 pill',
    [],
    ['app-shell-header', 'top-nav-item'],
  ],
  [
    'outline buttons: 1px border #0d6efd, blue text, filled blue on hover with white text',
    [],
    ['button'],
  ],
  ['cards: rounded-lg, shadow and ring-1 ring-black/5', [], ['card']],
  ['badges pill shaped, 12px text, gray #E3E3E3 background', [], ['badge']],
  [
    'inputs with a 1px bottom border that turns accent and 2px when focused',
    [],
    ['inputs'],
  ],
  [
    'softer shadows on cards, bolder headings, and a green success color',
    ['headings', 'success'],
    [],
  ],
  [
    'smaller badges, rounder avatars, and a red danger color',
    ['danger'],
    ['badge'],
  ],
  [
    'navigation bar dark with white links, cards with no shadow, and an orange accent',
    ['accent'],
    ['app-shell-header', 'card'],
  ],
  ['bolder headings and a green success color', ['headings', 'success'], []],
  ['rounder avatars and a red danger color', ['--color-error', 'danger'], []],
  [
    'tables with 13px text, uppercase 11px headers and a #f6f8fa header background',
    [],
    ['table-header-cell', 'table-row'],
  ],
  [
    'selected tab text #635bff with a 2px #635bff underline, other tabs #6c7688',
    [],
    ['tab'],
  ],
  [
    'page white in light mode and #191919 in dark mode, sidebar #f7f7f5 in light mode and #202020 in dark mode, text #37352f in light mode',
    ['--color-background-body', '--color-text-primary'],
    ['app-shell', 'layout-content', 'side-nav'],
  ],
  [
    'sidebar #f7f7f5 in light mode and #202020 in dark mode, text #37352f in light mode',
    ['--color-text-primary'],
    ['side-nav'],
  ],
  ['code #eb5757 text on #f7f6f3, 4px corners', [], ['code']],
  [
    'filled buttons: pill shaped, 40px tall, 14px medium text, 24px horizontal padding',
    [],
    ['button'],
  ],
  [
    'segmented buttons: pill shaped, 1px #79747e border, and #e8def8 when selected',
    [],
    ['segmented-control', 'segmented-control-item'],
  ],
  [
    'pagination: 6px radius, 1px #dee2e6 border, and the active page #0d6efd with white text',
    [],
    ['button', 'pagination', 'pagination-dot'],
  ],
  [
    'tabs: 2px #4f46e5 underline on the selected tab, #6b7280 text on the rest, 14px medium text',
    [],
    ['tab', 'tab-indicator'],
  ],
  ['filled buttons: 14px medium text', [], ['button']],
  [
    'make dialogs wider, their titles bigger, and the backdrop darker',
    ['--color-overlay'],
    ['dialog-header'],
  ],
  [
    'primary button border color rgba(0,0,0,0.1) on top and sides and rgba(0,0,0,0.25) on the bottom',
    [],
    ['button'],
  ],
  ['make dialogs wider and their titles bigger', [], ['dialog-header']],
  ['make cards rounder and their titles bigger', [], ['card']],
  [
    'headings 600 weight with tight letter spacing, body text 14px and line height 1.6',
    ['--text-body-leading', 'headings', 'text-size'],
    ['heading'],
  ],
  [
    'tabs 14px text, selected tab #171717 with a 2px #171717 underline, other tabs #666666',
    [],
    ['tab', 'tab-indicator'],
  ],
  [
    'page #08090a, sidebar #0f1011, sidebar items #8a8f98 and selected item #f7f8f8 text on #1c1d1f',
    ['--color-background-body'],
    ['app-shell', 'layout-content', 'side-nav', 'side-nav-item'],
  ],
  ['kbd hints #2e3035 with #8a8f98 text and 4px corners', [], []],
  ['toggle lists with gray arrows, 14px text and no borders', [], ['switch']],
  [
    'table rows 40px tall, row borders #ebeef1 and row hover #f6f8fa',
    [],
    ['table-row'],
  ],
  [
    'inputs #ffffff in light mode and #1a1f36 in dark mode, borders #d5dbe1 in light mode and #30313d in dark mode, text #1a1f36 in light mode',
    [],
    ['inputs'],
  ],
  [
    'cards: white background, 8px radius, shadow-sm, ring-1 ring-gray-900/5',
    [],
    ['card'],
  ],
  [
    'tables: 1px #dee2e6 borders, 8px cell padding, #f8f9fa header background, and a #f8f9fa hover',
    [],
    ['table-cell', 'table-header', 'table-row'],
  ],
  [
    'banners/primary buttons: border color rgba(0,0,0,0.1) on top and sides and rgba(0,0,0,0.25) on the bottom',
    [],
    ['banner', 'button'],
  ],
  [
    'label badges: pill shaped, 12px medium text, 1px #d1d9e0 border, transparent background',
    [],
    ['badge'],
  ],
  [
    'underline nav: 2px #fd8c73 underline on the selected item, #59636e text on the rest, 14px text',
    [],
    ['tab'],
  ],
  [
    'navigation rail: #fef7ff background, 80px wide; the selected item gets a #e8def8 pill',
    [],
    ['side-nav', 'side-nav-item'],
  ],
  [
    'the top nav: #111827 background, white text, and the current item #1f2937 with white text',
    [],
    ['top-nav', 'top-nav-item'],
  ],
  ['the top nav: #111827 background and white text', [], ['top-nav']],
  ['selected tab text white, other tabs gray', [], ['tab']],
  ['4px top corners and square bottom corners', ['corners'], []],
  [
    'table header: uppercase 12px text, gray #6b7280',
    [],
    ['table-header-cell'],
  ],
  [
    'white page, never use pure black for text',
    ['--color-background-body', '--color-text-primary'],
    ['app-shell', 'layout-content'],
  ],
  ['badges with a subtle colored background and dark text', [], ['badge']],
  ['lozenges: subtle gray background, bold uppercase 11px text', [], ['badge']],
  ['tooltips 4px corners and 12px text', [], ['tooltip']],
  [
    'toasts: #322f35 background, #f5eff7 text, #d0bcff action button text',
    [],
    ['toast'],
  ],
  ['menus with 4px padding and 32px rows', [], ['dropdown-menu-item', 'menus']],
  ['table header text uppercase, gray, 12px, bold', [], ['table-header-cell']],
  ['popovers 8px corners, 1px #DFE1E6 border, no shadow', [], ['popover']],
  [
    'pure white page, light only',
    ['--color-background-body'],
    ['app-shell', 'layout-content'],
  ],
  ['status badges: green stable, amber pending, red critical', [], ['badge']],
  ['inputs 32px tall with a 2px border when focused', [], ['inputs']],
  ['cards 8px corners, brighter and more cheerful', [], ['card']],
  ['bold headings, red #c8102e and blue #003da5 accents', ['accent'], []],
  [
    'big touch targets, large bold text, thick borders',
    ['--border-width', '--text-body-weight'],
    ['button', 'inputs'],
  ],
  ['inputs: 1px border #79747e, 2px #6750a4 when focused', [], ['inputs']],
  ["date picker: today's date circled in #0969da", [], []],
  [
    'form controls: 1px #ced4da border, 6px radius, 38px tall, glow rgba(13,110,253,.25) when focused',
    [],
    ['inputs'],
  ],
  ['snackbars #322f35 with #f5eff7 text and an #d0bcff action', [], ['toast']],
  ['checkboxes 16px with 3px corners', [], ['checkbox-indicator']],
  ['table rows divided by 1px #e5e7eb lines', [], ['table-row']],
  [
    'primary #0c66e4, hover #0055cc, pressed #09326c',
    ['--color-accent', 'accent'],
    [],
  ],
  [
    'rounder cards, rounder cards, compact tables, compact tables and a teal accent',
    ['accent'],
    ['card', 'table-row'],
  ],
  [
    'compact tables, rounder cards, compact tables, no borders on cards, and a teal accent',
    ['accent'],
    ['card', 'table-row'],
  ],
  [
    'dark sidebar with white text, rounder cards, compact tables, rounder cards, and bigger headings',
    [
      '--text-heading-1-size',
      '--text-heading-2-size',
      '--text-heading-3-size',
      '--text-heading-4-size',
      '--text-heading-5-size',
      '--text-heading-6-size',
    ],
    ['card', 'side-nav', 'table-row'],
  ],
  [
    'compact tables, rounder cards, compact tables, no borders on cards',
    [],
    ['card', 'table-row'],
  ],
  [
    'the danger button outline, rounder cards, compact tables, and links underlined',
    [],
    ['button', 'card', 'link', 'table-row'],
  ],
  [
    'badges 4px corners, rounder cards, compact tables, 12px text and no border',
    ['text-size'],
    ['badge', 'card', 'table-row'],
  ],
  [
    'tooltips #0f0f0f with white text, rounder cards, compact tables, 4px corners and 12px text',
    [],
    ['tooltip'],
  ],
  [
    'side nav #08090a, rounder cards, compact tables, items 13px text, selected item #1c1d1f with #f7f8f8 text',
    [],
    ['card', 'side-nav', 'side-nav-item', 'table-row'],
  ],
  [
    'badges pill corners, rounder cards, compact tables, 12px text and no border',
    ['text-size'],
    ['badge', 'card', 'table-row'],
  ],
  [
    'list items: 1px #dee2e6 border, rounder cards, compact tables, 8px 16px padding, active item #0d6efd with white text',
    [],
    ['list-item'],
  ],
  [
    'navigation bar: #f3edf7 background, rounder cards, compact tables, 80px tall; the selected item gets a #e8def8 pill',
    [],
    ['app-shell-header', 'table-header-cell', 'top-nav-item'],
  ],
  [
    'outline buttons: 1px border #0d6efd, rounder cards, compact tables, blue text, filled blue on hover with white text',
    [],
    ['button'],
  ],
  [
    'cards: rounded-lg, rounder cards, compact tables, shadow and ring-1 ring-black/5',
    [],
    ['card'],
  ],
  [
    'badges pill shaped, rounder cards, compact tables, 12px text, gray #E3E3E3 background',
    ['text-size'],
    ['badge', 'card', 'table-row'],
  ],
  [
    'softer shadows on cards, rounder cards, compact tables, bolder headings, and a green success color',
    ['headings', 'success'],
    ['card', 'table-row'],
  ],
  [
    'smaller badges, rounder cards, compact tables, rounder avatars, and a red danger color',
    ['danger'],
    ['badge', 'card', 'table-row'],
  ],
  [
    'navigation bar dark with white links, rounder cards, compact tables, cards with no shadow, and an orange accent',
    ['accent'],
    ['app-shell-header', 'card', 'table-header-cell', 'table-row'],
  ],
  [
    'tables with 13px text, rounder cards, compact tables, uppercase 11px headers and a #f6f8fa header background',
    [],
    ['card', 'table-header-cell', 'table-row'],
  ],
  [
    'selected tab text #635bff with a 2px #635bff underline, rounder cards, compact tables, other tabs #6c7688',
    [],
    ['card', 'tab', 'table-row'],
  ],
  [
    'page white in light mode and #191919 in dark mode, rounder cards, compact tables, sidebar #f7f7f5 in light mode and #202020 in dark mode, text #37352f in light mode',
    ['--color-background-body', '--color-text-primary'],
    ['app-shell', 'card', 'layout-content', 'side-nav', 'table-row'],
  ],
  [
    'sidebar #f7f7f5 in light mode and #202020 in dark mode, rounder cards, compact tables, text #37352f in light mode',
    ['--color-text-primary'],
    ['card', 'side-nav', 'table-row'],
  ],
  [
    'code #eb5757 text on #f7f6f3, rounder cards, compact tables, 4px corners',
    [],
    ['code'],
  ],
  [
    'filled buttons: pill shaped, rounder cards, compact tables, 40px tall, 14px medium text, 24px horizontal padding',
    [],
    ['button'],
  ],
  [
    'segmented buttons: pill shaped, rounder cards, compact tables, 1px #79747e border, and #e8def8 when selected',
    [],
    ['segmented-control', 'segmented-control-item'],
  ],
  [
    'pagination: 6px radius, rounder cards, compact tables, 1px #dee2e6 border, and the active page #0d6efd with white text',
    [],
    ['button', 'pagination', 'pagination-dot'],
  ],
  [
    'tabs: 2px #4f46e5 underline on the selected tab, rounder cards, compact tables, #6b7280 text on the rest, 14px medium text',
    [],
    ['tab', 'tab-indicator'],
  ],
  [
    'make dialogs wider, rounder cards, compact tables, their titles bigger, and the backdrop darker',
    ['--color-overlay'],
    ['card', 'dialog', 'table-header', 'table-row'],
  ],
  [
    'headings 600 weight with tight letter spacing, rounder cards, compact tables, body text 14px and line height 1.6',
    ['--text-body-leading', 'headings', 'text-size'],
    ['card', 'heading', 'table-row'],
  ],
  [
    'tabs 14px text, rounder cards, compact tables, selected tab #171717 with a 2px #171717 underline, other tabs #666666',
    [],
    ['card', 'tab', 'tab-indicator', 'table-row'],
  ],
  [
    'page #08090a, rounder cards, compact tables, sidebar #0f1011, sidebar items #8a8f98 and selected item #f7f8f8 text on #1c1d1f',
    ['--color-background-body'],
    [
      'app-shell',
      'card',
      'layout-content',
      'side-nav',
      'side-nav-item',
      'table-row',
    ],
  ],
  [
    'toggle lists with gray arrows, rounder cards, compact tables, 14px text and no borders',
    ['text-size'],
    ['card', 'switch', 'table-row'],
  ],
  [
    'table rows 40px tall, rounder cards, compact tables, row borders #ebeef1 and row hover #f6f8fa',
    [],
    ['card', 'table-row'],
  ],
  [
    'inputs #ffffff in light mode and #1a1f36 in dark mode, rounder cards, compact tables, borders #d5dbe1 in light mode and #30313d in dark mode, text #1a1f36 in light mode',
    ['--color-border', '--color-text-primary'],
    ['card', 'inputs', 'table-row'],
  ],
  [
    'cards: white background, rounder cards, compact tables, 8px radius, shadow-sm, ring-1 ring-gray-900/5',
    [],
    ['card'],
  ],
  [
    'tables: 1px #dee2e6 borders, rounder cards, compact tables, 8px cell padding, #f8f9fa header background, and a #f8f9fa hover',
    [],
    ['table-cell', 'table-header', 'table-row'],
  ],
  [
    'label badges: pill shaped, rounder cards, compact tables, 12px medium text, 1px #d1d9e0 border, transparent background',
    [],
    ['badge'],
  ],
  [
    'underline nav: 2px #fd8c73 underline on the selected item, rounder cards, compact tables, #59636e text on the rest, 14px text',
    [],
    ['tab'],
  ],
  [
    'navigation rail: #fef7ff background, rounder cards, compact tables, 80px wide; the selected item gets a #e8def8 pill',
    [],
    ['side-nav', 'side-nav-item'],
  ],
  [
    'the top nav: #111827 background, rounder cards, compact tables, white text, and the current item #1f2937 with white text',
    [],
    ['top-nav', 'top-nav-item'],
  ],
  [
    'selected tab text white, rounder cards, compact tables, other tabs gray',
    [],
    ['card', 'tab', 'table-row'],
  ],
  [
    'table header: uppercase 12px text, rounder cards, compact tables, gray #6b7280',
    [],
    ['table-header-cell'],
  ],
  [
    'white page, rounder cards, compact tables, never use pure black for text',
    ['--color-background-body', '--color-text-primary'],
    ['app-shell', 'card', 'layout-content', 'table-row'],
  ],
  [
    'lozenges: subtle gray background, rounder cards, compact tables, bold uppercase 11px text',
    [],
    ['badge'],
  ],
  [
    'toasts: #322f35 background, rounder cards, compact tables, #f5eff7 text, #d0bcff action button text',
    [],
    ['toast'],
  ],
  [
    'table header text uppercase, rounder cards, compact tables, gray, 12px, bold',
    [],
    ['card', 'table-header-cell', 'table-row'],
  ],
  [
    'popovers 8px corners, rounder cards, compact tables, 1px #DFE1E6 border, no shadow',
    ['--border-width', '--color-border', '--color-border-emphasized'],
    [
      'card',
      'code-block-header',
      'divider',
      'dropdown-menu-divider',
      'popover',
      'tab-list',
      'table-cell',
      'table-header-cell',
      'table-row',
    ],
  ],
  [
    'pure white page, rounder cards, compact tables, light only',
    ['--color-background-body', 'mode'],
    ['app-shell', 'card', 'layout-content', 'table-row'],
  ],
  [
    'status badges: green stable, rounder cards, compact tables, amber pending, red critical',
    [],
    ['badge'],
  ],
  [
    'cards 8px corners, rounder cards, compact tables, brighter and more cheerful',
    [],
    ['card', 'table-row'],
  ],
  [
    'bold headings, rounder cards, compact tables, red #c8102e and blue #003da5 accents',
    ['accent'],
    [],
  ],
  [
    'big touch targets, rounder cards, compact tables, large bold text, thick borders',
    ['--text-body-weight'],
    ['button', 'card', 'inputs', 'table-row'],
  ],
  [
    'inputs: 1px border #79747e, rounder cards, compact tables, 2px #6750a4 when focused',
    [],
    ['card', 'inputs', 'table-row'],
  ],
  [
    'form controls: 1px #ced4da border, rounder cards, compact tables, 6px radius, 38px tall, glow rgba(13,110,253,.25) when focused',
    [],
    ['card', 'inputs', 'table-row'],
  ],
  [
    'primary #0c66e4, rounder cards, compact tables, hover #0055cc, pressed #09326c',
    ['accent'],
    ['card', 'table-row'],
  ],
];

/**
 * @typedef {{q: string, has?: string[], never?: RegExp, says?: RegExp, noWide?: boolean}} Row
 * @type {Array<[string, Row]>}
 */
const ROWS = [
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

  it('no long ask writes beyond its own parts and theme words', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    /** @type {string[]} */
    const off = [];
    for (const [q, wide, parts] of LOCK) {
      const r = await answer(q);
      for (const line of r.lines) {
        const on = / --on (\S+)/.exec(line)?.[1];
        if (on ? !parts.includes(on) : !wide.includes(line.split(' ')[0]))
          off.push(`${q} => ${line}`);
      }
    }
    expect(off).toEqual([]);
  }, 900_000);
});
