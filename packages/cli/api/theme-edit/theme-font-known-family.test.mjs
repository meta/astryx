// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A family the editor does not know is kept as typed, with a note
 * when a font a system ships is spelled near it (Corben is a real family,
 * no typo of Corbel); a typo of a preset is refused with the preset, a
 * name listed both as a preset and a system font counted once.
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
  cwd = makeLinkedFixture('astryx-theme-font-known-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('a font family', () => {
  it('the editor does not know is kept as typed, with a note naming the system font near it', async () => {
    await themeEditNew('k1', {cwd});
    for (const [family, near] of [
      ['Corben', 'corbel'],
      ['Gabriela', 'gabriola'],
      ['Candal', 'candara'],
      ['Sitara', 'sitka'],
    ]) {
      const r = await themeEditSet('k1', 'font', family, {cwd});
      expect(r.data.setting.value, family).toBe(family);
      expect(r.data.notes.join('\n'), family).toContain(
        `"${family}" is kept as typed`,
      );
      expect(r.data.notes.join('\n'), family).toContain(` set k1 font ${near}`);
    }
  }, 240_000);

  it('a typo of a preset that is also a system font is refused with the preset', async () => {
    await themeEditNew('k2', {cwd});
    for (const [typed, meant] of [
      ['Gerogia', 'georgia'],
      ['Verdnaa', 'verdana'],
      ['Tahmoa', 'tahoma'],
      ['Helvetcia', 'helvetica'],
      // A preset is read before the system fonts near it (Corbel, Menlo).
      ['Corier', 'courier'],
      ['Monlo', 'mono'],
    ]) {
      /** @type {any} */
      let err = null;
      try {
        await themeEditSet('k2', 'font', typed, {cwd});
      } catch (e) {
        err = e;
      }
      expect(err, typed).not.toBeNull();
      expect(
        err.suggestions.map((/** @type {{name: string}} */ s) => s.name),
        typed,
      ).toContainEqual(
        expect.stringMatching(new RegExp(` set k2 font ${meant}$`)),
      );
    }
  }, 240_000);

  it('a font only macOS ships is noted as such', async () => {
    await themeEditNew('k3', {cwd});
    for (const family of ['Andale Mono', 'Arial Narrow']) {
      const r = await themeEditSet('k3', 'font', `${family}, monospace`, {cwd});
      expect(r.data.notes.join('\n'), family).toContain(
        `"${family}" ships only on macOS`,
      );
    }
  }, 240_000);
});
