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
        "background-color '#0d6efd' --on button --state current",
        "color '#ffffff' --on button --state current",
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

  it('reads "the active page in pagination" as its current page button', async () => {
    if (unbuilt) return;
    expect(await first('the active page in pagination blue')).toContain(
      "background-color '#2563eb' --on button --state current",
    );
  });
});
