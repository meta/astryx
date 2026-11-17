// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A whole-theme change names the parts it leaves out, with the line
 * that reaches them (square corners and the pills; a border width and the
 * surfaces it does not reach, and the dividers it thickens), and the
 * "thick borders on everything" answer reaches every overlay while the
 * dividers keep their width.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture(
    'astryx-theme-change-names-parts-leaves-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {any} r */
const notesOf = r =>
  (r.data.leftOut ?? [])
    .map((/** @type {{note: string, run: string[]}} */ x) =>
      [x.note, ...x.run].join('\n'),
    )
    .join('\n');

describe('a whole-theme change', () => {
  it('square corners name the circles they keep round, with the line for one', async () => {
    await themeEditNew('c3', {cwd});
    const r = await themeEditSet('c3', 'corners', 'square', {cwd});
    // (The pills that are a styling choice, a badge, go square with the
    // dial; only the circles are kept.)
    expect(notesOf(r)).toMatch(/drawn as circles stay round \([^)]*avatar/);
    expect(notesOf(r)).not.toMatch(/circles stay round \([^)]*\bbadge\b/);
    expect(notesOf(r)).toContain(' set c3 corners square --on avatar');
    expect(notesOf(r)).not.toContain('--radius-full 0px');
  }, 240_000);

  it('a border width names the surfaces it does not reach and the dividers it thickens', async () => {
    await themeEditNew('b3', {cwd});
    const r = await themeEditSet('b3', '--border-width', '4px', {cwd});
    const notes = notesOf(r);
    expect(notes).toMatch(/does not reach the surfaces[^\n]*popover/);
    expect(notes).toMatch(/does not reach the surfaces[^\n]*tooltip/);
    expect(notes).toMatch(/dividers[^\n]*table-cell/);
    expect(notes).toContain(' --border-width 1px --on ');
  }, 240_000);
});

describe('"thick black borders on everything"', () => {
  it('reaches every overlay and keeps the dividers at their width', async () => {
    await themeEditNew('t4', {cwd});
    const r = await themeEditHow('thick black borders on everything', {
      cwd,
      theme: 't4',
    });
    const lines = JSON.stringify(r.data);
    for (const part of [
      'popover',
      'dropdown-menu',
      'selector-popup',
      'tooltip',
      'dialog',
      'toast',
    ])
      expect(lines, part).toContain(`--on ${part}`);
    expect(lines).toMatch(/--border-width 1px --on table-cell/);
  }, 240_000);
});
