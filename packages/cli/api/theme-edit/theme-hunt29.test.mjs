// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twenty-ninth pass over `astryx experimental theme editor`: a
 * built type file replaced by a folder is named, a theme name one letter off
 * suggests the same command with the theme's name, and an empty name names
 * the themes here.
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt29-', FIXTURE_PACKAGES);
  await themeEditNew('brand', {cwd});
  await themeEditSet('brand', 'corners', 'pill', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

const names = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ x) => x.name);

describe('F1: a built type file replaced by a folder', () => {
  it.each(['brand.d.ts', 'brand.css.d.ts', 'brand.variants.d.ts'])(
    '%s is named, with ls -la, never --out or show',
    async name => {
      const file = path.join(cwd, 'themes/brand', name);
      const kept = fs.existsSync(file) ? fs.readFileSync(file) : null;
      fs.rmSync(file, {force: true});
      fs.mkdirSync(file);
      try {
        for (const run of [
          () => themeEditSet('brand', 'corners', 'small', {cwd}),
          () => themeEditUndo('brand', {cwd}),
          () => themeEditShow('brand', {cwd}),
        ]) {
          const err = await refusal(run);
          expect(err.message).toMatch(/is a folder/);
          expect(err.message).not.toContain('--out');
          expect(names(err).join('\n')).toMatch(/^ls -la /m);
          expect(names(err).join('\n')).not.toMatch(/ show brand$/m);
        }
      } finally {
        fs.rmSync(file, {recursive: true});
        if (kept) fs.writeFileSync(file, kept);
      }
    },
    240_000,
  );
});

describe('F2: a theme name one letter off', () => {
  it('suggests the same set with the theme name first', async () => {
    const err = await refusal(() =>
      themeEditSet('brnad', 'corners', 'small', {cwd}),
    );
    expect(err.code).toBe('ERR_UNKNOWN_THEME');
    expect(names(err)[0]).toMatch(/ set brand corners small$/);
    const later = names(err).findIndex((/** @type {string} */ n) =>
      / new brnad$/.test(n),
    );
    expect(later === -1 || later > 0).toBe(true);
  });

  it('show suggests show brand before new brnad', async () => {
    const err = await refusal(() => themeEditShow('brnad', {cwd}));
    expect(names(err)[0]).toMatch(/ show brand$/);
  });
});

describe('F3: an empty theme name', () => {
  it.each(['', ' ', '-', '???'])('%j names the themes here', async name => {
    const err = await refusal(() => themeEditShow(name, {cwd}));
    expect(err.message).toContain('The theme name is empty');
    expect(names(err)).toContainEqual(expect.stringMatching(/ show brand$/));
    expect(names(err).join('\n')).not.toContain('new my-theme');
  });
});
