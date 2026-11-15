// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The font dial reads every weight or style word after a family, each
 * through the one typo limit (`Inter Bold Itallic`, `Inter Tihn`); a `new`
 * refused for its name keeps the font's repair; and the note on a family
 * near a system font with a weight word names lines set takes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt219-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('w', {cwd});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * The lines a refused command offers, without the CLI prefix.
 * @param {() => Promise<unknown>} run
 */
const offered = async run => {
  /** @type {any} */
  let err = null;
  try {
    await run();
  } catch (e) {
    err = e;
  }
  expect(err).not.toBeNull();
  return err.suggestions.map((/** @type {{name: string}} */ s) =>
    s.name.replace(/^.* editor /, ''),
  );
};

describe('weight and style words after a family', () => {
  it('reads a typo past another weight word, and never saves the name', async () => {
    for (const typed of [
      'Inter Bold Itallic',
      'Inter Bold Italc',
      'Georgia Bold Itallic',
    ])
      expect(
        await offered(() => themeEditSet('w', 'font', typed, {cwd})),
        typed,
      ).toContain(`set w font '"${typed}"'`);
    expect(
      await offered(() =>
        themeEditNew('n2', {cwd, settings: {font: 'Inter Bold Itallic'}}),
      ),
    ).toContain(`new n2 --font '"Inter Bold Itallic"'`);
  }, 240_000);

  it('reads a typo of a word whose headings rung is another word', async () => {
    for (const [typed, rung] of [
      ['Inter Tihn', 'light'],
      ['Inter Blakc', 'heavy'],
      ['Inter Normla', 'regular'],
      ['Inter Extrabld', 'heavy'],
    ])
      expect(
        await offered(() => themeEditSet('w', 'font', typed, {cwd})),
        typed,
      ).toEqual([
        'set w font Inter',
        `set w font '"${typed}"'`,
        `set w headings ${rung}`,
      ]);
  }, 240_000);
});

describe('a new refused for its name', () => {
  it('keeps the repair of a font the font readers refuse', async () => {
    expect(
      await offered(() =>
        themeEditNew('n_1', {cwd, settings: {font: 'Robto'}}),
      ),
    ).toContain('new n-1 --font roboto');
    expect(
      await offered(() =>
        themeEditNew('n_1', {cwd, settings: {font: 'Inter Bold'}}),
      ),
    ).toContain('new n-1 --font Inter --headings bold');
  }, 240_000);
});

describe('a family near a system font, with a weight word', () => {
  it('is kept with a note whose lines set takes', async () => {
    const r = await themeEditSet('w', 'font', 'Arail Bold', {cwd});
    expect(r.data.setting.value).toBe('Arail Bold');
    const note = r.data.notes.join('\n');
    expect(note).toMatch(/ set w font arial and .* set w headings bold/);
    expect(note).not.toMatch(/arial Bold/);
    await themeEditSet('w', 'font', 'arial', {cwd});
    await themeEditSet('w', 'headings', 'bold', {cwd});
  }, 240_000);
});
