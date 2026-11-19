// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A selected look reaches a part that marks its chosen one as active (a
 * pagination dot) in that state, never as a `:selected` pseudo-class, which
 * no element matches. Against a real bundled base theme.
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
  cwd = makeLinkedFixture('astryx-theme-selected-active-', FIXTURE_PACKAGES);
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

describe('a selected look on a part marked active', () => {
  it('lands in the active state, never as :selected', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('dots', {cwd, like: 'neutral'});
    // (A look that reaches the family: an effect stays on its own part.)
    await themeEditSet('dots', 'font-weight', '800', {
      cwd,
      on: 'segmented-control-item',
      state: 'selected',
    });
    const rules = [
      ...fs
        .readFileSync(path.join(cwd, 'themes', 'dots', 'dots.css'), 'utf8')
        .matchAll(/([^{}]+)\{([^{}]*)\}/g),
    ]
      .filter(m => m[2].includes('font-weight: 800'))
      .map(m => m[1].trim());
    expect(rules.filter(r => r.includes(':selected'))).toEqual([]);
    expect(rules.some(r => /astryx-pagination-dot\[data-active/.test(r))).toBe(
      true,
    );
  }, 240_000);
});
