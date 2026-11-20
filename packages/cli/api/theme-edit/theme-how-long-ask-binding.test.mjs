// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Long asks in `editor how` bind each clause to its own part: a part
 * word in a clause wins over one carried from before; a carried part
 * reaches only the clause right after the one that named it (or every item
 * of a list its part leads, until another part is said); a look out of
 * reach, with no theme word or dial, is named, never written theme-wide or
 * on a part said further back; a mode pair stays on one part. The table
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
    'links in a sidebar that holds no link are its nav items, kept readable in the phone menu',
    {
      q: 'sidebar: #111827 background, white links',
      // (Dark mode only: the items also sit in the light phone menu.)
      has: ["color '#ffffff' --on side-nav-item --mode dark"],
      never: /--color-text-accent/,
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
    'links in tabs, which hold no link, are named, never written on the tab',
    {
      q: 'tabs: 14px text, blue links',
      has: ['font-size 14px --on tab'],
      never: /--color-text-accent/,
      says: /tab holds no link/,
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
