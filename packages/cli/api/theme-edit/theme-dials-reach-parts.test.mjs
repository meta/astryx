// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Whole-theme dials reach every part they name: corners move the chat
 * composer drawer's radius, the headings dial and a heading font reach a
 * part drawn as a heading element that reads none of the headings' tokens
 * (an empty state's title), and a setting on the inputs reaches the file
 * input. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
  cwd = makeLinkedFixture('astryx-theme-dials-reach-parts-', FIXTURE_PACKAGES);
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

describe('whole-theme dials', () => {
  it('reach the chat drawer, heading elements and the file input', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('z', {cwd, like: 'neutral'});
    await themeEditSet('z', 'corners', 'square', {cwd});
    await themeEditSet('z', 'headings', 'heavy', {cwd});
    await themeEditSet('z', 'font', 'Georgia', {cwd, on: 'heading'});
    await themeEditSet('z', 'border', 'none', {cwd, on: 'inputs'});
    const css = fs.readFileSync(path.join(cwd, 'themes', 'z', 'z.css'), 'utf8');
    expect(css).toMatch(/--radius-chat: 0px/);
    expect(css).toMatch(
      /\.astryx-empty-state-title \{\s*font-weight: 800;\s*font-family: var\(--font-family-heading\);/,
    );
    expect(css).toMatch(/\.astryx-file-input \{\s*border: none;/);
  }, 240_000);
});
