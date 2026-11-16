// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Each clause of an `editor how` ask writes on what it names: the
 * whole theme only when it names nothing or says the whole theme; a
 * subject that resolves to no part writes nothing and names its words;
 * a part's list keeps its items on it (its pieces, its variants, a part
 * inside it, its modes and states said at the end of an item); and side
 * words, rings, statuses, padding shorthands, tints and layered shadows
 * are read as said. One row per ask.
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
  cwd = makeLinkedFixture(
    'astryx-theme-how-clause-subjects-',
    FIXTURE_PACKAGES,
  );
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
    text: results.map(r => r.text).join('\n'),
  };
};

/**
 * @typedef {{q: string, has?: string[], none?: boolean, says?: RegExp, never?: RegExp}} Row
 * @type {Array<[string, Row]>}
 */
const ROWS = [
  // A subject that is no part: nothing written, its words named.
  [
    'unknown two-word subject',
    {
      q: 'command palette 8px corners',
      none: true,
      says: /no part is called "command palette"/,
    },
  ],
  [
    'unknown subject said as a sentence',
    {q: 'the command palette should have 8px corners', none: true},
  ],
  ['unknown acronym', {q: 'FAB 16px corners', none: true, says: /"fab"/}],
  [
    'a font name before "font" is no subject',
    {q: 'Inter font', has: ['font inter']},
  ],
  [
    'a brand label is the theme',
    {
      q: 'Stripe: accent #635bff, 6px corners',
      has: ["accent '#635bff'", 'corners 6px'],
    },
  ],
  [
    'no subject words: the theme',
    {q: 'clean 8px corners', has: ['corners 8px']},
  ],
  // A part's list keeps its items.
  [
    'a part first, its looks joined by and',
    {
      q: 'tooltips 4px corners and 12px text',
      has: ['border-radius 4px --on tooltip', 'font-size 12px --on tooltip'],
    },
  ],
  [
    'a part first, its looks in a comma list',
    {
      q: 'popovers 8px corners, 1px #DFE1E6 border, no shadow',
      has: ['box-shadow none --on popover'],
      never: /^--border-width|^--color-border/,
    },
  ],
  [
    'a bare look word in a part list',
    {
      q: 'table header text uppercase, gray, 12px, bold',
      has: ['font-weight 700 --on table-header-cell'],
      never: /--text-body-weight/,
    },
  ],
  [
    'a piece of the head part',
    {
      q: 'progress bar: #0d6efd fill and #e9ecef track, 16px tall',
      has: ["background-color '#e9ecef' --on progress-bar-track"],
      never: /contradict/,
    },
  ],
  [
    'a variant item and its states',
    {
      q: 'buttons: primary #0052cc, hover #0065ff, pressed #0747a6',
      has: [
        "background-color '#0065ff' --on button --when variant:primary --state hover",
      ],
    },
  ],
  [
    'a part inside the head part',
    {
      q: 'toasts: #322f35 background, #f5eff7 text, #d0bcff action button text',
      has: ["color '#f5eff7' --on toast"],
      never: /--on button/,
    },
  ],
  [
    'a size beside a state line keeps no state',
    {
      q: 'inputs 32px tall with a 2px border when focused',
      has: [
        'min-height 32px --on inputs',
        'border-width 2px --on inputs --state focus-within',
      ],
    },
  ],
  [
    'a mode said alone is the look before',
    {
      q: 'pure white page, light only',
      has: ["--color-background-body '#ffffff' --mode light"],
    },
  ],
  [
    'a mode at the end of a with-item',
    {
      q: 'checked checkboxes white with a black check in dark mode',
      has: [
        "background-color '#ffffff' --on checkbox-indicator --state checked --mode dark --only",
        "color '#000000' --on checkbox-indicator-check --mode dark",
      ],
    },
  ],
  [
    'a mode at the end leaves the corners whole',
    {
      q: 'dropdown menus 8px corners with a 1px border #e5e7eb in light mode',
      has: ['border-radius 8px --on dropdown-menu'],
    },
  ],
  [
    'colors before their role',
    {
      q: 'bold headings, red #c8102e and blue #003da5 accents',
      never: /--on heading$/,
    },
  ],
  [
    'a size and corners together',
    {q: 'checkboxes 16px with 3px corners', never: /contradict/},
  ],
  // Readings.
  [
    'under is the bottom side',
    {
      q: 'border under the top bar',
      has: [
        "border-bottom '1px solid var(--color-border)' --on app-shell-header",
      ],
    },
  ],
  [
    'a side word in a part name is no side',
    {q: 'top nav bottom border', never: /border-top/},
  ],
  [
    'lines are the line, never the fill',
    {q: 'table rows divided by 1px #e5e7eb lines', never: /background-color/},
  ],
  [
    'valid is the success status',
    {
      q: 'valid inputs green border',
      has: ["border-color '#16a34a' --on inputs --when status:success"],
    },
  ],
  [
    'in error is the error status',
    {
      q: 'text fields in error red border',
      has: ["border-color '#dc2626' --on inputs --when status:error"],
    },
  ],
  [
    'an inset ring is a ring',
    {
      q: 'inputs: 1px inset ring #d1d5db',
      has: ["box-shadow 'inset 0 0 0 1px #d1d5db' --on inputs"],
    },
  ],
  [
    'a bare 0 in a padding shorthand',
    {q: 'badges: 0 7px padding', has: ["padding '0 7px' --on badge"]},
  ],
  [
    'a ring and a shadow together',
    {
      q: 'cards: 1px ring #e5e7eb and a small shadow',
      has: ["box-shadow '0 0 0 1px #e5e7eb, var(--shadow-low)' --on card"],
    },
  ],
  [
    'the text paired with its fill',
    {
      q: 'badges #26272b with #d0d6e0 text',
      has: ["color '#d0d6e0' --on badge --when variant:neutral"],
      never: /variant:blue/,
    },
  ],
  ['see-through is the fill', {q: 'menus semi-transparent', never: /opacity/}],
  [
    'bold colors are no weight',
    {q: 'bold warm colors', never: /--text-body-weight/},
  ],
  [
    'the others after a comma',
    {
      q: 'selected tab text white, the others gray',
      has: [
        "color '#ffffff' --on tab --state selected",
        "color '#9e9e9e' --on tab",
      ],
    },
  ],
  [
    'a bare size of a part that sizes itself',
    {
      q: 'checkboxes 16px',
      has: [
        'width 16px --on checkbox-indicator --only',
        'height 16px --on checkbox-indicator --only',
      ],
    },
  ],
  [
    'a why-so complaint asks for a step the other way',
    {q: 'why is everything so round', has: ['corners less']},
  ],
  [
    'a comparative of angular is a step, never square',
    {q: 'Ecken eckiger', has: ['corners less']},
  ],
  [
    'a part that paints no shadow steps from none',
    {
      q: 'ugh the cards look so flat, fix it',
      has: ["box-shadow 'var(--shadow-low)' --on card"],
    },
  ],
  [
    'a long list led by its part keeps every item on it',
    {
      q: 'badges 4px corners, 12px text and no border',
      has: ['font-size 12px --on badge'],
      never: /^text-size/,
    },
  ],
  [
    'a long list with a with-item keeps the size on its part',
    {
      q: 'tooltips #0f0f0f with white text, 4px corners and 12px text',
      has: ['font-size 12px --on tooltip'],
      never: /^text-size/,
    },
  ],
  [
    'a piece of the leading part in a comma list',
    {
      q: 'side nav #08090a, items 13px text, selected item #1c1d1f with #f7f8f8 text',
      has: ['font-size 13px --on side-nav-item'],
      never: /^text-size/,
    },
  ],
  [
    'a size word before a look is no part size',
    {
      q: 'big touch targets, large bold text, thick borders',
      never: /weight 700 --on inputs|--border-width 2px --on inputs/,
    },
  ],
  [
    'a product label is the whole theme',
    {q: 'spreadsheet tool: 12px text, square corners', has: ['corners square']},
  ],
];

describe('each clause writes on what it names', () => {
  it.each(ROWS)(
    '%s',
    async (_name, row, test) => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const r = await answer(row.q);
      if (row.none) expect(r.first, row.q).toEqual([]);
      for (const line of row.has ?? []) expect(r.first, row.q).toContain(line);
      if (row.says) expect(r.text, row.q).toMatch(row.says);
      if (row.never)
        for (const line of r.first) expect(line, row.q).not.toMatch(row.never);
    },
    300_000,
  );
});
