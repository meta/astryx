// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Real families near a known name keep a line for what was typed;
 * a ratio's comma separates its numbers; a saved entry set repairs gets
 * that repair; a base reads in any of its names; a list item of weight,
 * style or size words is no family; a JSON string's quotes are JSON's.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {baseWord} from './_normal.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt127-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('b', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** [thing, value, flags, lines that must be offered, a pattern no line matches] */
const CASES =
  /** @type {Array<[string, string, Record<string, string>, RegExp[], RegExp | null]>} */ ([
    // A family near a generic or preset keeps a line for it as written.
    [
      'font',
      'Inder',
      {},
      [/ set b font inter$/, / set b font '"Inder"'$/],
      null,
    ],
    [
      'font',
      'Monaspace, monospace',
      {},
      [/ set b font '"Monaspace", monospace'$/],
      null,
    ],
    [
      'font-family',
      'Inter, Serifa',
      {on: 'heading'},
      [/ set b font-family 'Inter, "Serifa"' --on heading$/],
      null,
    ],
    // A ratio's comma separates its numbers.
    [
      'aspect-ratio',
      '16,9',
      {on: 'card'},
      [/ set b aspect-ratio '16 \/ 9' --on card$/],
      /16\.9/,
    ],
    [
      'aspect-ratio',
      '4,3',
      {on: 'card'},
      [/ set b aspect-ratio '4 \/ 3' --on card$/],
      /4\.3/,
    ],
    // A base in any of its names.
    ['base', 'neutral-theme', {}, [/ set b base neutral$/], / base none$/],
    ['base', 'neutralTheme', {}, [/ set b base neutral$/], / base none$/],
    ['base', 'neutral theme', {}, [/ set b base neutral$/], / base none$/],
    // A list item of weight, style or size words is no family.
    [
      'font',
      'Inter, bold',
      {},
      [/ set b font Inter$/, / set b headings bold$/],
      null,
    ],
    [
      'font',
      'Inter, semibold, sans-serif',
      {},
      [/ set b font 'Inter, sans-serif'$/],
      null,
    ],
    ['--font-family-body', 'Inter, bold', {}, [], /'Inter, bold'/],
  ]);

describe('hunt127', () => {
  it.each(CASES)(
    '%s %s %j',
    async (thing, value, flags, lines, never) => {
      const r = await refusal(() =>
        themeEditSet('b', thing, value, {cwd, ...flags}),
      );
      for (const line of lines)
        expect(
          r.run.some(x => line.test(x)),
          `${line}\n${r.run.join('\n')}`,
        ).toBe(true);
      if (never) for (const x of r.run) expect(x).not.toMatch(never);
    },
    120_000,
  );

  it('a family typed in quotes is kept as written', async () => {
    await themeEditSet('b', 'font', '"Monaspace", monospace', {cwd});
  }, 120_000);

  it("a JSON entry's string quotes are JSON's, for a font list too", async () => {
    const r = await themeEditSet('b', '{"font": "Inter, serif"}', '', {cwd});
    expect(JSON.stringify(r.data)).toContain('Inter, serif');
  }, 120_000);

  it('a saved entry set repairs gets that repair beside the undo', async () => {
    const file = path.join(cwd, 'themes', 'b', 'b.settings.json');
    const before = fs.readFileSync(file, 'utf8');
    try {
      for (const [entry, lines] of [
        [
          {thing: 'CORNERS', value: 'pill', source: 'dial'},
          [/ set b corners pill$/],
        ],
        [{thing: 'corners', value: 8, source: 'dial'}, [/ set b corners 8px$/]],
        [
          {thing: '--spacing-2', value: 8, source: 'token'},
          [/ set b --spacing-2 8px$/],
        ],
        [
          {thing: 'font', value: 'Inter 16px', source: 'dial'},
          [/ set b font Inter$/, / set b text-size 16$/],
        ],
      ]) {
        const data = JSON.parse(before);
        // The damaged entry alone for its setting (not listed twice).
        data.settings = [
          ...(data.settings ?? []).filter(
            (/** @type {any} */ x) =>
              x.thing !== String(entry.thing).trim().toLowerCase(),
          ),
          entry,
        ];
        fs.writeFileSync(file, JSON.stringify(data));
        const r = await refusal(() =>
          themeEditSet('b', '--spacing-4', '12px', {cwd}),
        );
        expect(r.run[0]).toMatch(/ undo b /);
        for (const line of /** @type {RegExp[]} */ (lines))
          expect(
            r.run.some(x => line.test(x)),
            r.run.join('\n'),
          ).toBe(true);
      }
    } finally {
      fs.writeFileSync(file, before);
    }
  }, 240_000);

  it('reads a base in any of its names', () => {
    for (const w of [
      'neutral',
      'Neutral',
      'neutral-theme',
      'neutralTheme',
      'neutral theme',
      'theme-neutral',
      '@astryxdesign/theme-neutral',
    ])
      expect(baseWord(w), w).toBe('neutral');
  });
});
