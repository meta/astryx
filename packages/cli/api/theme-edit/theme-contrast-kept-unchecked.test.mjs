// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where the editor cannot draw the components, nothing is measured:
 * doctor lists a kept contrast problem as kept, never as lapsed.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-kept-unchecked-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('ku', {cwd, like: 'neutral'});
  await themeEditSet('ku', 'background-color', '#17a2b8', {
    cwd,
    on: 'button',
    when: 'variant:primary',
  });
  await themeEditSet('ku', 'contrast-accepted', "the original's button", {
    cwd,
    on: 'button',
    when: 'variant:primary',
    ground: 'button',
    mode: 'light',
  });
}, 300_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a kept contrast problem the editor cannot measure', () => {
  it('is listed as kept', async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      ctx.skip();
      return;
    }
    vi.resetModules();
    vi.doMock('./_context.mjs', async importOriginal => {
      /** @type {any} */
      const real = await importOriginal();
      return {
        ...real,
        context: async (/** @type {string} */ root) => ({
          ...(await real.context(root)),
          unchecked: 'react-dom was not found',
        }),
      };
    });
    const {editorKeptContrastAt} = await import('./_adapter.mjs');
    const {acceptedContrastCheck} = await import('../doctor/theme-checks.mjs');
    const kept = await editorKeptContrastAt(cwd);
    expect(kept).toEqual([
      expect.objectContaining({slug: 'ku', inEffect: true, ratioNow: null}),
    ]);
    const message = String(acceptedContrastCheck(kept)?.message);
    expect(message).toMatch(/is kept as designed/);
    expect(message).not.toMatch(/no longer/);
    vi.doUnmock('./_context.mjs');
  }, 300_000);
});
