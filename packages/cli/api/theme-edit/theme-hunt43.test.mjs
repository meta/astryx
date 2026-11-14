// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The forty-third pass over `astryx experimental theme editor`: a font
 * list missing a comma is offered with the comma put back (never as one
 * escaped family), and a font pasted with its property name is the family
 * list it names.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {familyListMeant} from './_css.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt43-', FIXTURE_PACKAGES);
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

const css = () => fs.readFileSync(path.join(cwd, 'themes/b/b.css'), 'utf8');

describe('N43: a font list missing a comma', () => {
  it.each([
    ['"Open Sans" serif', '"Open Sans", serif'],
    ["'Georgia' serif", '"Georgia", serif'],
    ['"A" "B"', '"A", "B"'],
    ['Georgia "Times"', 'Georgia, "Times"'],
  ])('%s reads as %s', (typed, want) => {
    expect(familyListMeant(typed)).toBe(want);
  });

  it('is offered with the comma, never one escaped family, and that line works', async () => {
    const err = await refusal(() =>
      themeEditSet('b', '--font-family-body', '"Open Sans" serif', {cwd}),
    );
    const names = err.suggestions.map((/** @type {any} */ x) => x.name);
    expect(names.join('\n')).not.toContain('\\"');
    const line = names.find((/** @type {string} */ n) =>
      n.includes('--font-family-body'),
    );
    expect(line).toContain('"Open Sans", serif');
    await themeEditSet('b', '--font-family-body', '"Open Sans", serif', {cwd});
    expect(css()).toMatch(/--font-family-body: "Open Sans", serif;/);
  }, 240_000);
});

describe('N44: a font pasted with its property name', () => {
  it('the dial reads font-family: Georgia, serif; as Georgia, serif', async () => {
    await themeEditSet('b', 'font', 'font-family: Georgia, serif;', {cwd});
    expect(css()).not.toContain('font-family: Georgia"');
    // The heading follows the dial (the body has an exact token above).
    expect(css()).toMatch(/--font-family-heading: Georgia, serif;/);
  }, 240_000);

  it('an exact font token reads it the same way', async () => {
    await themeEditSet(
      'b',
      '--font-family-heading',
      'font-family: "Georgia", serif;',
      {cwd},
    );
    expect(css()).toMatch(/--font-family-heading: "?Georgia"?, serif;/);
    expect(css()).not.toMatch(/"font-family:/);
  }, 240_000);
});

describe('R20-A: a font shorthand pasted', () => {
  it('font: bold 16px Inter reads as its family', async () => {
    await themeEditSet('b', 'font', 'font: bold 16px Inter', {cwd});
    // Body and heading carry exact tokens from above: the dial's own setting.
    const saved = JSON.parse(
      fs.readFileSync(path.join(cwd, 'themes/b/b.settings.json'), 'utf8'),
    ).settings.find((/** @type {any} */ x) => x.thing === 'font' && !x.on);
    expect(String(saved.value).toLowerCase()).toBe('inter');
    expect(css()).not.toMatch(/"font: bold/);
  }, 240_000);
});

describe('R20-B: a var() with a fallback', () => {
  it('is accepted, with a note when the name is near a token', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('b', '--spacing-4', 'var(--spacing-xl, 2rem)', {cwd})
    );
    expect(JSON.stringify(r.data ?? r)).not.toContain('would read nothing');
    expect(css()).toMatch(/--spacing-4: var\(--spacing-xl, 2rem\)/);
  }, 240_000);
});
