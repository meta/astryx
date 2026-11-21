// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` on a part's colon list: the part named before the
 * colon owns every item after it. An item is read on its own words, with
 * that part as its place: a part word in it is a piece of the part
 * ("tables: … header background" is the table header), the page in it is
 * the element of the part its state picks ("pagination: … the active
 * page"), "the rest" is the part without the state another item named, and
 * an item with no part of its own is the part's, never the whole theme's
 * or the item before's. A kind said of the part ("filled buttons",
 * "outlined buttons") names which parts and adds no look.
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
  cwd = makeLinkedFixture('astryx-theme-how-list-owner-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** The first sequence the answer offers, as `set` lines. @param {string} q */
const first = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const lead = (data.results ?? []).find(r =>
    r.commands.some(c => / editor set /.test(c)),
  );
  return (lead?.commands ?? [])
    .flatMap(c => c.split(' && '))
    .filter(c => / editor set /.test(c))
    .map(c => c.replace(/^.* editor set \S+ /, ''));
};

/**
 * @type {Array<[string, {q: string, has: string[], never: RegExp}]>}
 */
const ROWS = [
  [
    'an "and" item of a colon list a state leads is in that state',
    {
      q: 'selected tabs: bold text and a #0069d6 fill',
      has: [
        'font-weight 700 --on tab --state selected',
        "background-color '#0069d6' --on tab --state selected",
      ],
      never: /--on tab$/,
    },
  ],
  [
    'a hovered list paints no resting button',
    {
      q: 'hovered buttons: a shadow and a #eeeeee fill',
      has: [
        "box-shadow 'var(--shadow-med)' --on button --state hover",
        "background-color '#eeeeee' --on button --state hover --mode light",
      ],
      never: /--on button(?: --when \S+)?(?: --mode \S+)?$/,
    },
  ],
  [
    'a disabled list fills only disabled buttons',
    {
      q: 'disabled buttons: gray text and a #eeeeee fill',
      has: ["background-color '#eeeeee' --on button --state disabled"],
      never: /--on button(?: --when \S+)?(?: --mode \S+)?$/,
    },
  ],
  [
    "a selected item's list keeps its text in the state",
    {
      q: 'selected side nav items: a #0069d6 fill and white text',
      has: [
        "background-color '#0069d6' --on side-nav-item --state selected",
        "color '#ffffff' --on side-nav-item --state selected",
      ],
      never: /--on side-nav-item$/,
    },
  ],
  [
    'a kind of the part ("filled buttons") keeps the list\'s text size on the part',
    {
      q: 'filled buttons: pill shaped, 40px tall, 14px medium text, 24px horizontal padding',
      has: ['font-size 14px --on button', 'font-weight 500 --on button'],
      never: /^text-size\b/,
    },
  ],
  [
    'a kind of the part ("outlined buttons") adds no border, and the length is the text\'s',
    {
      q: 'outlined buttons: 14px medium text and pill shaped',
      has: ['font-size 14px --on button', 'corners pill --on button'],
      never: /^border\b/,
    },
  ],
  [
    "the page in a part's list is the element of it the state picks, and its text is that element's",
    {
      q: 'pagination: 6px radius, 1px #dee2e6 border, and the active page #0d6efd with white text',
      has: [
        "background-color '#0d6efd' --on pagination-item --state selected",
        "color '#ffffff' --on pagination-item --state selected",
      ],
      never: /^--color-text-primary\b/,
    },
  ],
  [
    '"on the rest" is the part without the state another item named, and a later item is the part\'s',
    {
      q: 'tabs: 2px #4f46e5 underline on the selected tab, #6b7280 text on the rest, 14px medium text',
      has: [
        "background-color '#4f46e5' --on tab-indicator --state selected",
        "color '#6b7280' --on tab",
        'font-size 14px --on tab',
        'font-weight 500 --on tab',
      ],
      never:
        /'#6b7280' --on tab --state selected|^font-\S+ \S+ --on tab-indicator/,
    },
  ],
  [
    "a part word in the first item is a piece of the part, and the next item is the part's",
    {
      q: 'tables: #f8f9fa header background and a #f8f9fa hover',
      has: [
        "background-color '#f8f9fa' --on table-header-cell --mode light",
        "background-color '#f8f9fa' --on table-row --state hover --mode light",
      ],
      never:
        /--on table-row --mode light$|--on table-header-cell --state hover/,
    },
  ],
];

describe("a part's colon list owns its items", () => {
  it.each(ROWS)('%s', async (_name, row) => {
    if (unbuilt) return;
    const lines = await first(row.q);
    for (const line of row.has) expect(lines, row.q).toContain(line);
    for (const line of lines) expect(line, row.q).not.toMatch(row.never);
  });

  it('names two text colors said in a state list, never as a "then" step', async () => {
    if (unbuilt) return;
    const {data} = await themeEditHow(
      'hovered tabs: white text and gray text',
      {
        cwd,
        theme: 'n',
      },
    );
    const r = data.results?.[0];
    expect(
      r.commands.some(c =>
        c.endsWith("color '#9e9e9e' --on tab --state hover"),
      ),
    ).toBe(true);
    expect(r.text).toContain(
      'two colors were said for the text, #ffffff and #9e9e9e; the later one, #9e9e9e, is written',
    );
    expect(r.text).not.toMatch(/"then"/);
  });

  it('reads "the active page in pagination" as its current page cell', async () => {
    if (unbuilt) return;
    expect(await first('the active page in pagination blue')).toContain(
      "background-color '#2563eb' --on pagination-item --state selected",
    );
  });
});
