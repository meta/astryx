// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Families the editor knows written with no comma between them
 * (`Georgia Verdana`) are refused with the list and the name kept as typed
 * in quotes; one family of several words stays one family; a typo of a
 * family with a weight or style word after it is read by the font rule.
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt185-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} call */
const lines = async call => {
  try {
    await call();
  } catch (e) {
    return /** @type {any} */ (e.suggestions ?? []).map(
      (/** @type {{name: string}} */ s) => s.name,
    );
  }
  throw new Error('expected a refusal');
};

describe('families with no comma between them', () => {
  it('are refused with the list and the name kept in quotes', async () => {
    await themeEditNew('j1', {cwd});
    expect(
      await lines(() => themeEditSet('j1', 'font', 'Georgia Verdana', {cwd})),
    ).toEqual([
      expect.stringMatching(/ set j1 font 'Georgia, Verdana'$/),
      expect.stringMatching(/ set j1 font '"Georgia Verdana"'$/),
    ]);
    expect(
      (
        await lines(() =>
          themeEditSet(
            'j1',
            '--font-family-body',
            'Times New Roman Arial, serif',
            {
              cwd,
            },
          ),
        )
      )[0],
    ).toMatch(/ set j1 --font-family-body 'Times New Roman, Arial, serif'$/);
  }, 240_000);

  it('one family of several words stays one family', async () => {
    await themeEditNew('j2', {cwd});
    for (const family of ['Helvetica Neue', 'Arial Black', 'Open Sans']) {
      const r = await themeEditSet('j2', 'font', family, {cwd});
      expect(r.data.setting.value, family).toBe(family);
    }
  }, 240_000);
});

describe('a family typo with a weight or style word after it', () => {
  it('of a preset is refused with the preset and the weight', async () => {
    await themeEditNew('j3', {cwd});
    expect(
      await lines(() => themeEditSet('j3', 'font', 'Georiga Bold', {cwd})),
    ).toEqual([
      expect.stringMatching(/ set j3 font georgia$/),
      expect.stringMatching(/ set j3 font '"Georiga Bold"'$/),
      expect.stringMatching(/ set j3 headings bold$/),
    ]);
  }, 240_000);

  it('near a system font only is kept as typed, with the note', async () => {
    await themeEditNew('j4', {cwd});
    const r = await themeEditSet('j4', 'font', 'Arail Black', {cwd});
    expect(r.data.setting.value).toBe('Arail Black');
    expect(r.data.notes.join('\n')).toContain(" set j4 font 'arial black'");
  }, 240_000);
});
