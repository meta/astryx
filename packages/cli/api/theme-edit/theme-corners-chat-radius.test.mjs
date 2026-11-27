// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The corners dial writes the chat radius from the container radius:
 * Core's chat surfaces (a composer, its drawer, a message bubble) read
 * --radius-chat, which Core defaults to the container radius and the bundled
 * themes pin to a value of their own. The dial keeps the base's ratio of the
 * two, so a theme that makes its corners smaller makes the drawer's corners
 * smaller, and one that makes them rounder makes them rounder.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {chatRatio, radiusAt} from './_settings.mjs';

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
    'writes --radius-chat from the container radius at the base ratio for each corners value, on a base that pins its chat radius',
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
          'min(calc(var(--radius-container) * 28 / 12), 42px)',
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
      expect(builtToken('e', '--radius-chat')).toBe(
        'min(calc(var(--radius-container) * 28 / 12), 42px)',
      );
      // (An unrelated change rebuilds with the radii it keeps: chat still
      // reads the one container radius.)
      await themeEditSet('e', 'corners', 'small', {cwd, on: 'button'});
      expect(builtToken('e', '--radius-container')).toBe('5px');
      expect(builtToken('e', '--radius-chat')).toBe(
        'min(calc(var(--radius-container) * 28 / 12), 42px)',
      );
    },
    T,
  );

  it('is the container radius at the ratio the base pins', () => {
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
        Math.min(
          Math.round((radiusAt(base, value, '--radius-container') * 28) / 12),
          42,
        ),
      );
    // A base that pins no chat radius, or square containers, follows the
    // container radius.
    expect(chatRatio({light: {'--radius-container': '12px'}})).toBeNull();
    expect(
      chatRatio({light: {'--radius-container': '0px', '--radius-chat': '0px'}}),
    ).toBeNull();
  });

  it('rounder corners never make the chat radius smaller, and sharper never larger', () => {
    // (The neutral base: 12px containers, 28px chat.)
    const base = {
      light: {
        '--radius-element': '0.625rem',
        '--radius-container': '0.75rem',
        '--radius-page': '1.75rem',
        '--radius-chat': '28px',
      },
    };
    const rungs = ['square', 'small', 'medium', 'large', 'round', 'pill'];
    const chat = rungs.map(v => radiusAt(base, v, '--radius-chat'));
    for (let i = 1; i < chat.length; i++)
      expect(chat[i], rungs[i]).toBeGreaterThanOrEqual(chat[i - 1]);
    // A container radius above the base's gives a chat radius above 28px;
    // one below gives one below.
    for (const v of rungs) {
      const container = radiusAt(base, v, '--radius-container');
      const c = radiusAt(base, v, '--radius-chat');
      if (container > 12) expect(c, v).toBeGreaterThan(28);
      if (container < 12) expect(c, v).toBeLessThan(28);
    }
  });

  it('is never rounder than one and a half times the base chat radius', () => {
    const base = {
      light: {
        '--radius-element': '0.625rem',
        '--radius-container': '0.75rem',
        '--radius-page': '1.75rem',
        '--radius-chat': '28px',
      },
    };
    for (const v of ['round', 'pill', '24px'])
      expect(radiusAt(base, v, '--radius-chat'), v).toBe(42);
  });

  it(
    'a corner bound holds the chat radius and still follows a container radius set later',
    async ctx => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        ctx.skip();
        return;
      }
      await themeEditNew('b', {cwd, like: 'butter'});
      // (The bound's own answer, run as it is given.)
      const {data} = /** @type {any} */ (
        await themeEditHow('make corners never more than 8px', {
          cwd,
          theme: 'b',
        })
      );
      const steps = /** @type {string[]} */ (
        data.results.flatMap((/** @type {any} */ r) => r.commands)
      );
      const chat = steps.find(c => / --radius-chat /.test(c));
      expect(chat).toBeTruthy();
      await themeEditSet('b', 'corners', '8px', {cwd});
      await themeEditSet(
        'b',
        '--radius-chat',
        String(/ --radius-chat '?([^']+)'?$/.exec(String(chat))?.[1]),
        {cwd},
      );
      await themeEditSet('b', '--radius-container', '2px', {cwd});
      expect(builtToken('b', '--radius-chat')).toContain(
        'var(--radius-container)',
      );
    },
    T,
  );
});
