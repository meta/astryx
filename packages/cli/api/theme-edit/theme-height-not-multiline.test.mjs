// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A height set on a text input reaches the inputs drawn one line tall, never
 * the text area: a multi-line field grows with its rows, and a one-line
 * height would shut it to one line over its own text. The result names the
 * text area as not reached, with the line that sizes it too. Against a real
 * bundled base theme.
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
  cwd = makeLinkedFixture('astryx-theme-height-multiline-', FIXTURE_PACKAGES);
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

describe('a height on a text input', () => {
  it('reaches the one-line inputs, never the text area, and names it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('t', 'height', '21px', {cwd, on: 'text-input'})
    );
    expect(r.data.parts).toEqual(
      expect.arrayContaining(['text-input', 'number-input']),
    );
    expect(r.data.parts).not.toContain('text-area');
    const notes = r.data.notes.join('\n');
    expect(notes).toMatch(/height does not reach text-area/);
    // (A one-line field the census draws no height for, a complex selector,
    // or one drawn one line tall inside, is no multi-line field.)
    expect(notes).not.toMatch(/does not reach [^:]*complex-selector/);
    expect(notes).not.toMatch(/does not reach [^:]*date-time-input/);
    expect(notes).toContain('set t height 21px --on text-area --only');
    // (Run as printed, it sizes the text area alone.)
    const run = /** @type {any} */ (
      await themeEditSet('t', 'height', '21px', {
        cwd,
        on: 'text-area',
        only: true,
      })
    );
    expect(run.data.parts).toEqual(['text-area']);
  }, 240_000);
});
