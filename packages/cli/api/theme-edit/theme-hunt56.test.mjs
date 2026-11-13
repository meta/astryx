// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fifty-sixth pass over `astryx experimental theme editor`: a
 * part setting saved for one mode never locks a theme that keeps one mode,
 * and a part's length reads only a length token.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt56-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('hunt56', () => {
  it.each(['dark', 'light'])(
    'N22-1: a part setting saved with --mode %s keeps a one-mode theme editable, and both modes bring it back',
    async mode => {
      const slug = `m${mode}`;
      await themeEditNew(slug, {cwd});
      await themeEditSet(slug, 'background', '#203040', {
        cwd,
        on: 'card',
        mode,
      });
      await themeEditSet(slug, 'mode', 'dark-only', {cwd});
      await themeEditShow(slug, {cwd});
      await themeEditSet(slug, 'padding', '4px', {cwd, on: 'card'});
      const back = await themeEditSet(slug, 'mode', 'both', {cwd});
      expect(back.type).toBe('themeEdit.set');
      const shown = await themeEditShow(slug, {cwd});
      expect(
        /** @type {any} */ (shown.data).settings.some(
          (/** @type {any} */ s) => s.thing === 'background' && s.mode === mode,
        ),
      ).toBe(true);
    },
    240_000,
  );

  it.each([
    ['padding', 'var(--color-accent)', 'card', /--color-accent is a color/],
    [
      'border-radius',
      'var(--color-accent)',
      'card',
      /--color-accent is a color/,
    ],
    ['padding', 'var(--font-family-body)', 'dialog', /is a font/],
    [
      'padding',
      'calc(var(--color-accent) * 2)',
      'card',
      /--color-accent is a color/,
    ],
  ])(
    'N22-3: %s %s on %s is refused (a length takes a length token)',
    async (prop, value, on, why) => {
      await themeEditNew('wt', {cwd}).catch(() => {});
      const r = await refusal(() => themeEditSet('wt', prop, value, {cwd, on}));
      expect(r.code).toBe('ERR_THEME_BAD_VALUE');
      expect(r.message).toMatch(why);
      expect(r.run[0]).toMatch(/var\(--(spacing-4|radius-container)\)/);
    },
    240_000,
  );

  it('N22-3: a length token is still taken', async () => {
    await themeEditNew('ok', {cwd});
    const r = await themeEditSet('ok', 'padding', 'var(--spacing-4)', {
      cwd,
      on: 'card',
    });
    expect(r.type).toBe('themeEdit.set');
  }, 240_000);

  it.each([
    ['var(color-text-primary)', 'var(--color-text-primary)'],
    ['var(-x)', null],
    ['var()', null],
    ['var(--)', null],
  ])(
    'F22: %s is refused as no variable reference, with the repaired form',
    async (value, fixed) => {
      await themeEditNew('vr', {cwd}).catch(() => {});
      const r = await refusal(() =>
        themeEditSet('vr', '--color-accent', value, {cwd}),
      );
      expect(r.message).toMatch(/is not a CSS variable reference/);
      if (fixed) expect(r.run[0]).toContain(`'${fixed}'`);
    },
    240_000,
  );
});
