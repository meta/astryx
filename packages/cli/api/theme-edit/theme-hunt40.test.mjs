// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fortieth pass over `astryx experimental theme editor`: an exact
 * token hand-edited to a var() that names no token is named, as set refuses
 * it, and a font family name keeps one space for any run of spaces or tabs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {normalValue} from './_check.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt40-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
  await themeEditSet('t', '--color-accent', '#3366ff', {cwd});
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

describe('N40: a hand-edited var() that names no token', () => {
  it('is named by show and set, with the undo that removes it', async () => {
    const file = path.join(cwd, 'themes/t/t.settings.json');
    const kept = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(kept);
    for (const s of data.settings)
      if (s.thing === '--color-accent') s.value = 'var(--nope)';
    fs.writeFileSync(file, JSON.stringify(data));
    try {
      for (const run of [
        () => themeEditShow('t', {cwd}),
        () => themeEditSet('t', 'corners', 'pill', {cwd}),
      ]) {
        const err = await refusal(run);
        expect(err.code).toBe('ERR_THEME_INVALID');
        expect(err.message).toContain('--nope is not a design token');
        expect(
          (err.suggestions ?? []).map((/** @type {any} */ x) => x.name),
        ).toContainEqual(expect.stringMatching(/ undo t --color-accent$/));
      }
    } finally {
      fs.writeFileSync(file, kept);
    }
  }, 240_000);
});

describe('N37: spaces inside a font family name', () => {
  it('reads any run of spaces or tabs as one space', async () => {
    expect(normalValue('font', "'Open  Sans', serif")).toBe(
      "'Open Sans', serif",
    );
    expect(normalValue('font', "'Open\tSans'")).toBe("'Open Sans'");
    await themeEditSet('t', 'font', "'Open  Sans', serif", {cwd});
    const css = fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');
    expect(css).not.toMatch(/Open {2}Sans/);
    expect(css).toMatch(/Open Sans/);
  }, 240_000);
});
