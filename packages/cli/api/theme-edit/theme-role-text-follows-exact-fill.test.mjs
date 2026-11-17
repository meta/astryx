// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A role's text and icons follow the fill the theme really shows: in
 * a mode where the theme sets the fill token exactly (a darker warning for
 * light), the text starts from that color, and the note names it and calls
 * the text by its role (warning text and icons, not links and accent text).
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-role-text-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('role text after an exact fill in one mode', () => {
  it('names the exact fill and the role, not the dial color or links', async () => {
    await themeEditNew('incident', {
      cwd,
      like: 'neutral',
      settings: {accent: '#3b82f6', warning: '#f59e0b'},
    });
    const {data} = /** @type {any} */ (
      await themeEditSet('incident', '--color-warning', '#c2690a', {
        cwd,
        mode: 'light',
      })
    );
    const note = /** @type {string[]} */ (data.notes).find(n =>
      n.startsWith('--color-text-warning light:'),
    );
    expect(note).toMatch(/your exact color \(#c2690a\)/);
    expect(note).toMatch(/so warning text and icons use shade/);
    expect(note).not.toMatch(/#f59e0b|links and accent text/);
  }, 120_000);
});
