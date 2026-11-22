// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A font asked for on a part is offered as its preset's whole stack:
 * "monospace numbers in tables" is ui-monospace, then the monospace fonts
 * other systems have, then monospace, never ui-monospace alone, which only
 * Apple systems draw. A family a font is said to be like ("MS Sans
 * Serif-like") is that family, and an older system name reaches the
 * family that replaced it.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-how-font-stack-', FIXTURE_PACKAGES);
  await themeEditNew('a', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} question */
const commandsFor = async question => {
  const {data} = /** @type {any} */ (
    await themeEditHow(question, {cwd, theme: 'a'})
  );
  return data.results.flatMap((/** @type {any} */ r) => r.commands).join('\n');
};

describe('a font on a part', () => {
  it('is its preset whole, with the fallbacks of its kind', async () => {
    const mono = await commandsFor('monospace numbers in tables');
    expect(mono).toContain(
      `font-family 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' --on table-row`,
    );
    expect(mono).not.toMatch(/font-family ui-monospace(\s|$)/);
  }, 240_000);

  it('keeps a stack the question gives as it is', async () => {
    expect(await commandsFor('Inter, sans-serif font on buttons')).toContain(
      `font-family 'Inter, sans-serif' --on button`,
    );
  }, 240_000);
});

describe('a family said as like another', () => {
  it('is that family, as typed, and the kind said still wins', async () => {
    expect(
      await commandsFor(
        'Type: MS Sans Serif-like pixel sans 11px, tight leading',
      ),
    ).toContain(`font 'MS Sans Serif'`);
    expect(await commandsFor('Font: MS Sans Serif-like pixel sans')).toContain(
      `font 'MS Sans Serif'`,
    );
    // ("system sans" is the system font, never "without"; a size said
    // beside a typeface is the base text size.)
    const bulma = await commandsFor('system sans 16px, 1.5 leading.');
    expect(bulma).toContain('font system');
    expect(bulma).toContain('text-size 16');
    expect(await commandsFor('serif 16px')).toContain('text-size 16');
    // ("sans-serif" and "sans serif" name no serif.)
    expect(
      await commandsFor('Type: MS Sans Serif-like pixel sans-serif 11px'),
    ).toContain(`font 'MS Sans Serif'`);
    expect(
      await commandsFor('Type: MS Sans Serif-like pixel sans serif 11px'),
    ).toContain(`font 'MS Sans Serif'`);
    // (A title-case suffix after a label is read the same.)
    expect(await commandsFor('Font: NYT-Style serif headings')).toContain(
      'font serif --on heading',
    );
    // (A kind said as a whole word wins; a word that only holds one,
    // "artisans", "monoline", is no kind.)
    expect(await commandsFor('NYT-style serif headings')).toMatch(
      / font serif --on heading/,
    );
    expect(await commandsFor('NYT-style serif headings for artisans')).toMatch(
      / font serif --on heading/,
    );
    expect(
      await commandsFor('Bloomberg-like monospaced numbers in tables'),
    ).not.toMatch(/Bloomberg/);
    expect(await commandsFor('IBM Plex Serif-like monoline headings')).toMatch(
      / font 'IBM Plex Serif' --on heading/,
    );
    // (A shipped font the name begins is that font.)
    expect(await commandsFor('Comic Sans-like pixel sans')).toMatch(
      / font comic(\s|$)/,
    );
    // (A generic word alone stays the system stack.)
    expect(await commandsFor('a sans font')).toMatch(/ font system(\s|$)/);
  }, 240_000);
});

describe('an older name of a system family', () => {
  it('is written first, then the family that replaced it', async () => {
    const {fontOf} = await import('./_settings.mjs');
    const f = fontOf('MS Sans Serif');
    expect(f.family.replace(/"/g, '')).toBe('MS Sans Serif');
    expect(f.fallbacks.replace(/"/g, '')).toBe(
      'Microsoft Sans Serif, system-ui, sans-serif',
    );
  });
});
