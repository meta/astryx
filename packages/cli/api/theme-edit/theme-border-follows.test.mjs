// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The emphasized border (input and selector frames) is never fainter
 * than the border: a fainter border leaves it, a stronger one carries it.
 * When it follows, the set result says so, and show names what it follows
 * (never the theme's own source).
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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
/** @type {any} */
let faint;
/** @type {any} */
let strong;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-d-border-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('st', {cwd, like: 'neutral'});
  await themeEditSet('st', 'neutral', '#64748b', {cwd});
  await themeEditSet('st', 'mode', 'light-only', {cwd});
  faint = (await themeEditSet('st', '--color-border', '#e3e8ee', {cwd})).data;
  await themeEditNew('br', {cwd, like: 'neutral'});
  await themeEditSet('br', 'neutral', '#000000', {cwd});
  await themeEditSet('br', 'mode', 'light-only', {cwd});
  strong = (await themeEditSet('br', '--color-border', '#000000', {cwd})).data;
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} d */
const changedNames = d =>
  /** @type {string[]} */ (d.changedTokens ?? []).map(c => c.split(/[\s:]/)[0]);

describe('the emphasized border', () => {
  it('stays when the border is fainter than it', () => {
    expect(changedNames(faint)).not.toContain('--color-border-emphasized');
    expect(faint.notes.join('\n')).not.toMatch(/follows it/);
  });

  it('follows a stronger border, and the result says so', () => {
    expect(changedNames(strong)).toContain('--color-border-emphasized');
    expect(strong.notes.join('\n')).toMatch(
      /--color-border-emphasized follows it \(the frames of inputs and selectors/,
    );
  });

  it('show names what it follows, not the theme source', async () => {
    const {data} = /** @type {any} */ (await themeEditShow('br', {cwd}));
    const neutral = data.colors.find(
      (/** @type {any} */ c) => c.color === 'neutral',
    );
    const line = String(neutral.tokens['--color-border-emphasized']);
    expect(line).toMatch(/follows your --color-border/);
    expect(line).not.toMatch(/theme\.ts/);
  });
});
