// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The corners dial gives the chat radius back to the container radius:
 * Core's chat surfaces (a composer, its drawer, a message bubble) read
 * --radius-chat, which Core defaults to the container radius and the bundled
 * themes pin to a value of their own, so a theme that makes its corners
 * smaller makes the drawer's top corners smaller too, never leaving them at
 * the base's pinned radius.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {radiusAt} from './_settings.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;
/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-corners-chat-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['butter']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** A token's value in the built theme stylesheet. @param {string} slug @param {string} token */
const builtToken = (slug, token) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  return new RegExp(`${token}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
};

describe('the corners dial and chat surfaces', () => {
  it(
    'writes --radius-chat as the container radius for each corners value, on a base that pins its chat radius',
    async ctx => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        ctx.skip();
        return;
      }
      await themeEditNew('c', {cwd, like: 'butter'});
      for (const value of ['small', 'square', 'round']) {
        await themeEditSet('c', 'corners', value, {cwd});
        expect(builtToken('c', '--radius-container'), value).toBeTruthy();
        expect(builtToken('c', '--radius-chat'), value).toBe(
          'var(--radius-container)',
        );
      }
      await themeEditSet('c', 'corners', 'small', {cwd});
      expect(builtToken('c', '--radius-chat')).not.toBe('28px');
    },
    T,
  );

  it(
    'keeps following an exact container radius set after the dial, whatever is edited next',
    async ctx => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        ctx.skip();
        return;
      }
      await themeEditNew('e', {cwd, like: 'butter'});
      await themeEditSet('e', 'corners', 'small', {cwd});
      await themeEditSet('e', '--radius-container', '5px', {cwd});
      expect(builtToken('e', '--radius-container')).toBe('5px');
      expect(builtToken('e', '--radius-chat')).toBe('var(--radius-container)');
      // (An unrelated change rebuilds with the radii it keeps: chat still
      // reads the one container radius.)
      await themeEditSet('e', 'corners', 'small', {cwd, on: 'button'});
      expect(builtToken('e', '--radius-container')).toBe('5px');
      expect(builtToken('e', '--radius-chat')).toBe('var(--radius-container)');
    },
    T,
  );

  it('is the container radius whatever chat radius the base pins', () => {
    // (Most bundled themes pin their chat radius at 28px.)
    const base = {
      light: {
        '--radius-element': '8px',
        '--radius-container': '12px',
        '--radius-page': '24px',
        '--radius-chat': '28px',
      },
    };
    for (const value of ['small', 'round', '3px'])
      expect(radiusAt(base, value, '--radius-chat')).toBe(
        radiusAt(base, value, '--radius-container'),
      );
  });
});
