// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A mode or base entry a hand edit put in the settings list does
 * nothing there: show lists it only under a "misplaced" note, never as a
 * setting, and every change and refusal leads with the undo that removes it.
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
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt88-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {any[]} settings */
const handEdit = (slug, settings) => {
  const file = path.join(cwd, 'themes', slug, `${slug}.settings.json`);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  j.settings = settings;
  fs.writeFileSync(file, JSON.stringify(j, null, 2));
};

describe('a mode or base entry in the settings list', () => {
  it('is listed only under a misplaced note, and every change and refusal leads with its undo', async () => {
    await themeEditNew('mp', {cwd});
    handEdit('mp', [
      {thing: 'mode', value: 'dark-only', source: 'dial'},
      {thing: 'base', value: 'butter', source: 'dial'},
    ]);
    const shown = await themeEditShow('mp', {cwd});
    expect(shown.data.settings.map(s => s.thing)).not.toContain('mode');
    expect(shown.data.settings.map(s => s.thing)).not.toContain('base');
    expect(shown.data.notes[0]).toMatch(
      /^misplaced: the settings list holds mode = dark-only.*undo mp mode/,
    );
    expect(shown.data.notes[1]).toMatch(
      /^misplaced: .*base = butter.*undo mp base/,
    );

    const set = await themeEditSet('mp', 'corners', 'pill', {cwd});
    expect(set.data.notes[0]).toMatch(/^misplaced: .*undo mp mode/);

    const r = await refusal(() =>
      themeEditSet('mp', 'corners', 'banana', {cwd}),
    );
    expect(r.run[0]).toMatch(/ undo mp mode$/);
    expect(r.run[1]).toMatch(/ undo mp base$/);

    await themeEditUndo('mp', {cwd, thing: 'mode'});
    await themeEditUndo('mp', {cwd, thing: 'base'});
    const after = await themeEditShow('mp', {cwd});
    expect(after.data.notes.join('\n')).not.toMatch(/misplaced/);
    expect(after.data.settings.map(s => s.thing)).toEqual(['corners']);
  }, 240_000);
});
