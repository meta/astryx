// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `--only` means one thing to `set` and to the settings reader (one
 * rule, onlyMeans): every `only` set writes, the theme opens with again;
 * set takes none on a part styled on its own; and a saved one there (as
 * another editor saved it) is read and built as without it, named in one
 * note, never a refusal of the theme.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
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
      let took = 0;
      for (const on of members) {
        write([]);
        try {
          await themeEditSet('n', 'opacity', '0.9', {cwd, on, only: true});
        } catch (e) {
          // (Only a member this Core does not draw may refuse.)
          expect(String(/** @type {any} */ (e)?.code)).toBe(
            'ERR_THEME_UNKNOWN_PART',
          );
          continue;
        }
        took++;
        expect(read().settings).toEqual([
          expect.objectContaining({on, only: true}),
        ]);
        await themeEditShow('n', {cwd});
      }
      expect(took).toBeGreaterThan(0);
    },
    T,
  );

  it(
    'on a part styled on its own, set takes no --only and offers the line without it',
    async () => {
      write([]);
      /** @type {any} */
      let e = null;
      try {
        await themeEditSet('n', 'text-shadow', 'none', {
          cwd,
          on: 'segmented-control-item',
          state: 'selected',
          only: true,
        });
      } catch (x) {
        e = x;
      }
      expect(e?.message).toMatch(/styled on its own already/);
      expect(JSON.stringify(e)).toMatch(
        /set n text-shadow none --on segmented-control-item --state selected"/,
      );
    },
    T,
  );

  it(
    'a saved only on a part styled on its own opens, is read and built as without it, with one note',
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
      // (show writes no settings.)
      expect(fs.readFileSync(file(), 'utf8')).toBe(before);
      const css = fs.readFileSync(path.join(cwd, 'themes/n/n.css'), 'utf8');
      expect(css).toContain('rgba(0, 0, 0, 0.25)');
      // An undo by name, without --only, finds the saved entry itself.
      await themeEditUndo('n', {
        cwd,
        thing: 'text-shadow',
        on: 'segmented-control-item',
        state: 'selected',
      });
      expect(
        read().settings.filter(
          (/** @type {any} */ x) => x.state === 'selected',
        ),
      ).toEqual([]);
      write(settings);
      // The line a refusal would offer, without --only, replaces it: one
      // entry for the place, never a twin; a bare undo removes it.
      await themeEditSet('n', 'text-shadow', 'none', {
        cwd,
        on: 'segmented-control-item',
        state: 'selected',
      });
      const at = () =>
        read().settings.filter(
          (/** @type {any} */ x) =>
            x.on === 'segmented-control-item' && x.state === 'selected',
        );
      expect(at()).toEqual([
        expect.not.objectContaining({only: expect.anything()}),
      ]);
      await themeEditUndo('n', {
        cwd,
        thing: 'text-shadow',
        on: 'segmented-control-item',
        state: 'selected',
      });
      expect(at()).toEqual([]);
    },
    T,
  );

  it(
    'a saved only beside a plain entry of the same place opens; the later one shows',
    async () => {
      write([
        {
          thing: 'color',
          value: '#ffffff',
          source: 'property',
          on: 'pagination-item',
          state: 'selected',
          mode: 'light',
          only: true,
        },
        {
          thing: 'color',
          value: '#111111',
          source: 'property',
          on: 'pagination-item',
          state: 'selected',
          mode: 'light',
        },
      ]);
      const r = await themeEditShow('n', {cwd});
      expect(notes(r)).toMatch(/the earlier one is left out/);
      const css = fs.readFileSync(path.join(cwd, 'themes/n/n.css'), 'utf8');
      expect(css).toContain('#111111');
      // The next change saves only the later entry.
      await themeEditSet('n', 'corners', 'round', {cwd});
      expect(
        read().settings.filter(
          (/** @type {any} */ x) => x.on === 'pagination-item',
        ),
      ).toEqual([expect.objectContaining({value: '#111111'})]);
      expect(read().settings.some((/** @type {any} */ x) => x.only)).toBe(
        false,
      );
    },
    T,
  );

  it(
    'a fix line for a saved only on a part styled on its own carries no --only',
    async () => {
      write([
        {
          thing: 'color',
          value: '#ededed',
          source: 'property',
          on: 'card',
          only: true,
        },
      ]);
      const r = await themeEditShow('n', {cwd});
      const text = JSON.stringify(r);
      // (A line for the card is offered, and it carries no --only.)
      expect(text).toMatch(/ --on card\b/);
      expect(text).not.toMatch(/--on card --only/);
    },
    T,
  );
});
