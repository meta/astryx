// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A one-mode theme's text color on a part whose own fill is an image
 * (a gradient button face) is written for both modes. A region Core draws
 * in the other mode (a lightbox, an overlay) keeps that face, so it keeps
 * the text on it, and the contrast check measures it that way.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-whole-fill-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const GEL = 'linear-gradient(to bottom, #ffffff, #dedede)';

/** @param {string} slug */
const secondaryRule = slug => {
  const src = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.settings.ts`),
    'utf8',
  );
  const at = src.indexOf('"variant:secondary"');
  return src.slice(at, src.indexOf('}', src.indexOf('"color"', at)) + 1);
};

describe('a text color on an image fill in a one-mode theme', () => {
  it('is written for both modes, so a dark media region keeps it', async () => {
    await themeEditNew('gel', {cwd, like: 'neutral'});
    await themeEditSet('gel', 'mode', 'light-only', {cwd});
    await themeEditSet('gel', 'background', GEL, {
      cwd,
      on: 'button',
      when: 'variant:secondary',
    });
    const r = await themeEditSet('gel', 'color', '#000000', {
      cwd,
      on: 'button',
      when: 'variant:secondary',
      mode: 'light',
    });
    expect(secondaryRule('gel')).toMatch(/"color": "#000000"/);
    expect(secondaryRule('gel')).not.toMatch(/"@light"/);
    expect((r.data.problems ?? []).some(p => /lightbox/.test(String(p)))).toBe(
      false,
    );
    expect(r.data.notes.join(' ')).toMatch(
      /own background is the same in both modes, so its light text color is written for both/,
    );
  }, 240_000);

  it('keeps the fill-only problem, and its offered line fixes it', async () => {
    await themeEditNew('gel2', {cwd, like: 'neutral'});
    await themeEditSet('gel2', 'mode', 'light-only', {cwd});
    const r = await themeEditSet('gel2', 'background', GEL, {
      cwd,
      on: 'button',
      when: 'variant:secondary',
    });
    const media = (r.data.newProblems ?? []).find(p =>
      /lightbox/.test(p.problem),
    );
    expect(media?.fix).toMatch(
      /set gel2 color '#000000' --on button --when variant:secondary$/,
    );
    const fixed = await themeEditSet('gel2', 'color', '#000000', {
      cwd,
      on: 'button',
      when: 'variant:secondary',
    });
    expect(
      (fixed.data.problems ?? []).some(p => /lightbox/.test(String(p))),
    ).toBe(false);
  }, 240_000);

  it('leaves a two-mode theme writing the color for its mode only', async () => {
    await themeEditNew('two', {cwd, like: 'neutral'});
    await themeEditSet('two', 'background', GEL, {
      cwd,
      on: 'button',
      when: 'variant:secondary',
    });
    await themeEditSet('two', 'color', '#000000', {
      cwd,
      on: 'button',
      when: 'variant:secondary',
      mode: 'light',
    });
    expect(secondaryRule('two')).toMatch(/"@light": \{\s*"color": "#000000"/);
  }, 240_000);
});
