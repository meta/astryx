// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Text is measured on the ground it is drawn on, a state Core paints as it
 * mounts included: the census draws each open scene that only mounts into
 * its state (a table with a row selected), takes the fill Core paints on
 * the part's own element (the selected row's) as the ground of the text
 * inside, a cell's secondary supporting line included, and reads no text
 * hidden for screen readers alone (a selection checkbox's "Select row").
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {context} from './_context.mjs';
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
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-selected-row-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('text on a state Core paints as it mounts', () => {
  it('measures a selected row’s text on the row’s fill, and no text for screen readers alone', async ctx => {
    if (unbuilt) return ctx.skip();
    const {parts} = /** @type {any} */ (await context(cwd));
    const pairs = /** @type {any[]} */ (parts.pairs);
    expect(
      pairs.some(
        p =>
          p.text === 'table-cell' &&
          p.bg.target === 'table-row' &&
          p.bg.tokens[0] === '--color-accent-muted',
      ),
    ).toBe(true);
    // (A cell's secondary supporting line sits on the selected fill too.)
    expect(
      pairs.some(
        p =>
          p.fg.tokens[0] === '--color-text-secondary' &&
          p.bg.target === 'table-row' &&
          p.bg.tokens[0] === '--color-accent-muted',
      ),
    ).toBe(true);
    // (The header row is never drawn selected: its cells stay on their
    // own ground.)
    expect(
      pairs.some(
        p => p.text === 'table-header-cell' && p.bg.target === 'table-row',
      ),
    ).toBe(false);
    // (A label clipped to one pixel is read by screen readers alone.)
    expect(pairs.some(p => /^(Select row|Option 1)$/.test(p.sample))).toBe(
      false,
    );
  }, 600_000);

  it('names text in a selected row too faint on the theme’s selected fill', async ctx => {
    if (unbuilt) return ctx.skip();
    await themeEditNew('sr', {cwd, like: 'neutral'});
    await themeEditSet('sr', 'mode', 'light-only', {cwd});
    const {data} = await themeEditSet('sr', '--color-accent-muted', '#222222', {
      cwd,
    });
    expect(
      data.problems.some((/** @type {any} */ p) =>
        /^text in table-cell \(.*\) is [\d.]+:1 in light \(--color-text-primary on table-row's #222222\)/.test(
          String(p.text ?? p.message ?? p),
        ),
      ),
    ).toBe(true);
  }, 600_000);
});
