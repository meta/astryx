// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor set`: a form of a part's own name that names only that
 * part (another case, spaces for its dashes, its plural) is that part: the
 * setting is saved under the part's name and the result says what was
 * read. A bare `light` or `dark` for the mode is the one value it is the
 * first half of. A typo, or a word that could mean more than one value,
 * still refuses with the line that works.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-name-forms-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('n', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const saved = () =>
  JSON.parse(
    fs.readFileSync(path.join(cwd, 'themes/n/n.settings.json'), 'utf8'),
  );

/** @param {Promise<unknown>} p */
const refusal = async p => {
  try {
    await p;
  } catch (e) {
    return /** @type {any} */ (e);
  }
  throw new Error('expected a refusal');
};

describe('a part named by a form of its own name', () => {
  for (const [typed, part] of [
    ['buttons', 'button'],
    ['Cards', 'card'],
    ['text inputs', 'text-input'],
  ])
    it(
      `"${typed}" is saved as ${part}, and the result says so`,
      async () => {
        const r = /** @type {any} */ (
          await themeEditSet('n', 'padding', '6px', {cwd, on: typed})
        );
        expect(r.data.setting.on).toBe(part);
        expect(JSON.stringify(r.data.notes)).toContain(
          `read \`${typed}\` as \`${part}\``,
        );
        const entry = saved().settings.find(
          (/** @type {any} */ s) => s.thing === 'padding' && s.on === part,
        );
        expect(entry).toBeTruthy();
        expect(entry.note).toBeUndefined();
      },
      T,
    );

  it(
    'a typo still refuses, with the line that works',
    async () => {
      const e = await refusal(
        themeEditSet('n', 'padding', '6px', {cwd, on: 'cardz'}),
      );
      expect(e.code).toBe('ERR_THEME_UNKNOWN_PART');
      expect(JSON.stringify(e)).toMatch(/--on card\b/);
    },
    T,
  );
});

describe('a bare mode', () => {
  it(
    '`light` is light-only and `dark` dark-only, each said; an unclear word refuses',
    async () => {
      const light = /** @type {any} */ (
        await themeEditSet('n', 'mode', 'light', {cwd})
      );
      expect(saved().mode).toBe('light-only');
      expect(JSON.stringify(light.data.notes)).toContain(
        'read mode `light` as `light-only`',
      );
      await themeEditSet('n', 'mode', 'dark', {cwd});
      expect(saved().mode).toBe('dark-only');
      const e = await refusal(themeEditSet('n', 'mode', 'lite', {cwd}));
      expect(e.code).toBe('ERR_THEME_BAD_VALUE');
      await themeEditSet('n', 'mode', 'both', {cwd});
    },
    T,
  );
});
