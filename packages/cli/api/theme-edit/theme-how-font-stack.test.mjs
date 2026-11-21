// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A font asked for on a part is offered as its preset's whole stack:
 * "monospace numbers in tables" is ui-monospace, then the monospace fonts
 * other systems have, then monospace, never ui-monospace alone, which only
 * Apple systems draw.
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
