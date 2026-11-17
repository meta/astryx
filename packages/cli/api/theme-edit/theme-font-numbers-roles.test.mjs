// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The font dial reads a number after a known family as CSS does: a
 * weight from 1 to 1000 (decimals too), any other number no family; a word
 * with another first letter (Night, Right) is no weight typo; and a font
 * role in other letters (Body) is answered as that role.
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

// The assertions are about settings, notes and lines, not rendered pages:
// a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-font-numbers-roles-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('w', {cwd});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * The refusal a font setting gets.
 * @param {string} value
 * @param {Record<string, string>} [flags]
 */
const refusal = async (value, flags = {}) => {
  /** @type {any} */
  let err = null;
  try {
    await themeEditSet('w', 'font', value, {cwd, ...flags});
  } catch (e) {
    err = e;
  }
  expect(err, value).not.toBeNull();
  return {
    message: String(err.message),
    lines: err.suggestions.map((/** @type {{name: string}} */ s) =>
      s.name.replace(/^.* editor /, ''),
    ),
  };
};

describe('a number after a known family', () => {
  it('is a weight from 1 to 1000, a decimal too', async () => {
    for (const typed of ['Inter 450.5', 'Inter 50', 'Inter 1']) {
      const r = await refusal(typed);
      expect(r.message, typed).toMatch(/holds a weight where a family goes/);
      expect(r.lines, typed).toContain('set w font Inter');
    }
    expect((await refusal('Inter 450.5')).lines).toContain(
      'set w headings medium',
    );
  }, 240_000);

  it('is no family past 1000', async () => {
    for (const typed of ['Inter 1500', 'Arial 1200']) {
      const r = await refusal(typed);
      expect(r.message, typed).toMatch(/holds a number where a family goes/);
    }
    const kept = await themeEditSet('w', 'font', 'Source Sans 3', {cwd});
    expect(kept.data.setting.value).toBe('Source Sans 3');
  }, 240_000);
});

describe('a word with another first letter', () => {
  it('is no typo of a weight word', async () => {
    for (const typed of ['Inter Night', 'Inter Right']) {
      const r = await themeEditSet('w', 'font', typed, {cwd});
      expect(r.data.setting.value, typed).toBe(typed);
    }
  }, 240_000);
});

describe('a font role in other letters', () => {
  it('is answered as that role', async () => {
    for (const on of ['Body', 'BODY']) {
      const r = await refusal('Inter', {on});
      expect(r.lines[0], on).toMatch(/^set w font \w+ --on body$/);
      expect(r.lines.join('\n'), on).not.toMatch(/app-shell/);
    }
  }, 120_000);
});
