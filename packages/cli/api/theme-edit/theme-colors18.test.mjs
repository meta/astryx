// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Token and dial values a refusal suggests are of the right kind and
 * keep the number given, and a var() fallback is checked wherever it sits.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-colors18-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
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
  e.suggestions.map((/** @type {any} */ x) => x.name);

describe('N10: a token the part does not read', () => {
  it('suggests only tokens of the same kind', async () => {
    const err = await refusal(() =>
      themeEditSet('b', '--font-weight-bold', '700', {cwd, on: 'heading'}),
    );
    for (const n of names(err)) expect(n).not.toMatch(/-size 700|leading 700/);
  });
});

describe('N8: a size token without a unit', () => {
  it.each([
    ['--font-size-base', '16', '16px'],
    ['--border-width', '1', '1px'],
    ['--spacing-4', '4', '4px'],
  ])('%s %s suggests %s', async (token, value, want) => {
    const err = await refusal(() => themeEditSet('b', token, value, {cwd}));
    expect(names(err)[0]).toMatch(new RegExp(` set b ${token} ${want}$`));
  });
});

describe('N9: text-size in other spellings', () => {
  it.each(['20px', '2e1', '+20', '1.25rem'])('%s suggests 20', async v => {
    const err = await refusal(() => themeEditSet('b', 'text-size', v, {cwd}));
    expect(names(err)).toContainEqual(
      expect.stringMatching(/ set b text-size 20$/),
    );
  });
});

describe('N7: var() fallbacks inside a value', () => {
  it.each([
    ['--text-body-leading', 'calc(var(--nope, 1.5em))'],
    ['--spacing-4', 'calc(var(--nope, red))'],
    ['--color-accent', 'color-mix(in srgb, var(--nope, 12px), red)'],
    ['--text-body-leading', 'var(--nope,)'],
    ['--spacing-4', 'calc(var(--nope,) * 2)'],
  ])('%s %s is refused, and nothing changes', async (token, value) => {
    const css = path.join(cwd, 'themes/b/b.css');
    const before = fs.readFileSync(css, 'utf8');
    const err = await refusal(() => themeEditSet('b', token, value, {cwd}));
    expect(err.code).toBe('ERR_THEME_BAD_VALUE');
    expect(fs.readFileSync(css, 'utf8')).toBe(before);
  });

  it('accepts a fallback of the right kind inside calc()', async () => {
    await expect(
      themeEditSet('b', '--spacing-4', 'calc(var(--nope, 4px) * 2)', {cwd}),
    ).resolves.toBeTruthy();
  }, 240_000);
});
