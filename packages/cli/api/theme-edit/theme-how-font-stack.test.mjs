// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A font asked for on a part is offered as its preset's whole stack:
 * "monospace numbers in tables" is ui-monospace, then the monospace fonts
 * other systems have, then monospace, never ui-monospace alone, which only
 * Apple systems draw. A family a font is said to be like ("MS Sans
 * Serif-like") is that family.
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
  it('is that family, never the generic stack the rest names', async () => {
    const said = await commandsFor(
      'Type: MS Sans Serif-like pixel sans 11px, tight leading',
    );
    expect(said).toContain(`font 'MS Sans Serif'`);
    expect(said).not.toMatch(/ font system(\s|$)/);
    expect(await commandsFor('MS Sans Serif-like type')).toContain(
      `font 'MS Sans Serif'`,
    );
    // (A generic word alone, or one look word before "type", stays as it
    // was.)
    const large = await commandsFor('Large type in a serif');
    expect(large).not.toMatch(/ font '?Large'?(\s|$)/);
    expect(large).toMatch(/ font serif(\s|$)/);
    // (A name whose kind is not the kind said is a look: the kind wins.)
    const nyt = await commandsFor('NYT-style serif headings');
    expect(nyt).not.toMatch(/ font '?NYT'?/);
    expect(nyt).toMatch(/ font serif --on heading/);
    expect(
      await commandsFor('Bloomberg-like monospaced numbers in tables'),
    ).not.toMatch(/Bloomberg/);
    // (A shipped font the name begins is that font; a label keeps no
    // likeness suffix.)
    expect(await commandsFor('Comic Sans type')).toMatch(/ font comic(\s|$)/);
    expect(await commandsFor('Font: MS Sans Serif-like pixel sans')).toContain(
      `font 'MS Sans Serif'`,
    );
    expect(await commandsFor('a sans font')).toMatch(/ font system(\s|$)/);
  }, 240_000);
});
