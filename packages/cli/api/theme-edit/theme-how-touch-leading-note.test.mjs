// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` says, in a line height answer on a base whose touch
 * phone rule sets its own type scale, that the line heights reset there; a
 * base without that rule answers with no such note.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

// The assertions are about answer text, not rendered pages.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-touch-leading-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'y2k']);
  if (!unbuilt) {
    await themeEditNew('n', {cwd, like: 'neutral'});
    await themeEditNew('y', {cwd, like: 'y2k'});
  }
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q @param {string} theme */
const text = async (q, theme) =>
  ((await themeEditHow(q, {cwd, theme})).data.results ?? [])
    .map(r => r.text)
    .join('\n');

describe('a line height on a base whose touch rule sets the type scale', () => {
  it('says the line heights reset on touch phones', async test => {
    if (unbuilt) return test.skip(unbuilt);
    expect(await text('1.5 line height', 'n')).toMatch(
      /on touch phones this base's type scale resets line heights; a Core fix is pending/,
    );
  }, 240_000);

  it('says nothing of it on a base without that rule', async test => {
    if (unbuilt) return test.skip(unbuilt);
    expect(await text('1.5 line height', 'y')).not.toMatch(/touch phones/);
  }, 240_000);
});
