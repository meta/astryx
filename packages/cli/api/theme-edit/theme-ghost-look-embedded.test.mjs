// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A ghost button's look names every part drawn as a ghost button inside
 * other components (a calendar's arrows, a code block's copy button, an
 * input's clear button, a toggle button), each with the line that keeps it
 * as Core draws it; a look for another variant names none of them. Against
 * a real bundled base theme.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-ghost-embedded-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

const GLOSS = 'linear-gradient(#ffffff, #e6e6e6)';

describe("a ghost button's look", () => {
  it('names each part drawn as a ghost button, with its keep-plain line', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('g', 'background-image', GLOSS, {
        cwd,
        on: 'button',
        when: 'variant:ghost',
      })
    );
    const note = String(
      r.data.notes.find((/** @type {string} */ n) => /^also reaches /.test(n)),
    );
    for (const part of ['calendar-nav', 'input-clear-button', 'toggle-button'])
      expect(note, part).toContain(part);
    expect(note).toMatch(/set g background-image \S+ --on calendar-nav/);
  }, 240_000);

  it('a look with two conditions names the parts drawn in both', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g2', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('g2', 'background-image', GLOSS, {
        cwd,
        on: 'button',
        when: 'variant:ghost+size:md',
      })
    );
    expect(r.data.notes.join('\n')).toMatch(/^also reaches .*calendar-nav/m);
  }, 240_000);

  it("a selected look's keep lines style one part, --only", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('sel', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('sel', 'background-image', GLOSS, {
        cwd,
        on: 'item',
        state: 'selected',
        only: true,
      })
    );
    // (A list item reaches the selected items in that state: its keep line
    // keeps it to itself.)
    const item = (r.data.embedded ?? []).find(
      (/** @type {any} */ e) => e.part === 'list-item',
    );
    expect(item?.keep).toMatch(/--on list-item --state selected --only$/);
  }, 240_000);

  it("a primary button's look names no ghost-drawn part", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('p', 'background-image', GLOSS, {
        cwd,
        on: 'button',
        when: 'variant:primary',
      })
    );
    expect(r.data.notes.join('\n')).not.toMatch(/also reaches .*calendar-nav/);
  }, 240_000);
});
