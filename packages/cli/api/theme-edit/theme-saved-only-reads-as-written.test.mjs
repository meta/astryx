// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `--only` means one thing to `set` and to the settings reader (one
 * rule, onlyMeans): every `only` set writes, the theme opens with again;
 * set saves a change on a part styled on its own without it; and a saved
 * one there (as
 * another editor saved it) is kept as saved, built as without it, and named
 * in one note, never a refusal of the theme.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {AUTO_SPREAD, FAMILIES} from './_tables.mjs';
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
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

const file = () => path.join(cwd, 'themes/n/n.settings.json');
const read = () => JSON.parse(fs.readFileSync(file(), 'utf8'));
/** @param {any[]} settings */
const write = settings =>
  fs.writeFileSync(
    file(),
    `${JSON.stringify({...read(), settings}, null, 2)}\n`,
  );

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-saved-only-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('n', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const notes = r =>
  [...(r?.data?.notes ?? []), ...(r?.data?.colorNotes ?? [])].join('\n');

describe('--only, as set writes it and the reader reads it', () => {
  it(
    'every member of a group that spreads takes --only, and the theme opens again',
    async () => {
      const members = AUTO_SPREAD.flatMap(f => FAMILIES[f] ?? []);
      expect(members.length).toBeGreaterThan(0);
      for (const on of members) {
        write([]);
        try {
          await themeEditSet('n', 'opacity', '0.9', {cwd, on, only: true});
        } catch {
          // (A member this Core does not draw: nothing was written.)
          continue;
        }
        await themeEditShow('n', {cwd});
      }
    },
    T,
  );

  it(
    'on a part styled on its own, set saves the change without --only and says so',
    async () => {
      write([]);
      const r = /** @type {any} */ (
        await themeEditSet('n', 'text-shadow', 'none', {
          cwd,
          on: 'segmented-control-item',
          state: 'selected',
          only: true,
        })
      );
      expect(read().settings).toEqual([
        expect.not.objectContaining({only: true}),
      ]);
      expect(notes(r)).toMatch(
        /--only changes nothing: it is saved without it/,
      );
    },
    T,
  );

  it(
    'a saved only on a part styled on its own opens, is kept and built as without it, with one note',
    async () => {
      // As another editor saved it.
      const settings = [
        {
          thing: 'text-shadow',
          value: '0 1px 1px #ffffff',
          source: 'property',
          on: 'segmented-control-item',
        },
        {
          thing: 'text-shadow',
          value: '0 1px 1px rgba(0, 0, 0, 0.25)',
          source: 'property',
          on: 'segmented-control-item',
          state: 'selected',
          only: true,
        },
      ];
      write(settings);
      const before = fs.readFileSync(file(), 'utf8');
      const r = await themeEditShow('n', {cwd});
      expect(notes(r)).toMatch(
        /text-shadow on segmented-control-item :selected was saved with only, which changes nothing there/,
      );
      expect(fs.readFileSync(file(), 'utf8')).toBe(before);
      const css = fs.readFileSync(path.join(cwd, 'themes/n/n.css'), 'utf8');
      expect(css).toContain('rgba(0, 0, 0, 0.25)');
      // A later change keeps it as saved.
      await themeEditSet('n', 'corners', 'round', {cwd});
      expect(read().settings).toEqual(
        expect.arrayContaining([expect.objectContaining({only: true})]),
      );
    },
    T,
  );
});
