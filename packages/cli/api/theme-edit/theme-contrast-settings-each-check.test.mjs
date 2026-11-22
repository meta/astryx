// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The contrast check reads the theme's settings, and the parts each
 * one lands on, anew for each check: a later setting, a setting for a state,
 * and a setting kept to its own part change what the next check in the same
 * process finds.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// (What these cases check comes from the theme, not the rendered pages: the
// renders are stood in for.)
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-contrast-each-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The problems show lists for text in tabs. @param {string} slug */
const tabProblems = async slug =>
  /** @type {Array<{problem: string}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd, section: 'actions'}))
      .data.openProblems
  )
    .filter(p => /^text in tab\b/.test(p.problem))
    .map(p => p.problem);

describe('the contrast check', () => {
  it('reads the settings anew for each check', async () => {
    await themeEditNew('t', {cwd, like: 'neutral'});
    await themeEditSet('t', 'background-color', '#6c757d', {cwd, on: 'tab'});
    const gray = await tabProblems('t');
    expect(gray.length).toBeGreaterThan(0);
    expect(gray.every(p => p.includes("tab's #6c757d"))).toBe(true);
    // A fill for every tab set after it: the next check reads that one.
    await themeEditSet('t', 'background-color', '#ffffff', {cwd, on: 'tab'});
    const white = await tabProblems('t');
    expect(white.length).toBeGreaterThan(0);
    expect(white.every(p => p.includes("tab's #ffffff"))).toBe(true);
    // A fill for the selected state wins over the one at rest there.
    await themeEditSet('t', 'background-color', '#6c757d', {
      cwd,
      on: 'tab',
      state: 'selected',
    });
    const selected = await tabProblems('t');
    const inState = selected.filter(p => p.includes('(selected)'));
    expect(inState).toHaveLength(1);
    expect(inState[0]).toContain("tab's #6c757d");
    expect(
      selected
        .filter(p => !p.includes('(selected)'))
        .every(p => p.includes("tab's #ffffff")),
    ).toBe(true);
  }, 400_000);

  it('reads the parts each setting lands on anew for each check', async () => {
    /** The parts whose text show finds too faint. @param {string} slug */
    const partsNamed = async slug => [
      ...new Set(
        /** @type {Array<{problem: string}>} */ (
          /** @type {any} */ (
            await themeEditShow(slug, {cwd, section: 'actions'})
          ).data.openProblems
        ).map(p => /^text in ([\w-]+) /.exec(p.problem)?.[1]),
      ),
    ];
    await themeEditNew('p', {cwd, like: 'neutral'});
    // A fill on one input reaches every input.
    await themeEditSet('p', 'background-color', '#6c757d', {
      cwd,
      on: 'text-input',
    });
    expect(await partsNamed('p')).toContain('date-input');
    // The same fill kept to that input: the next check reads it there only.
    await themeEditUndo('p', {cwd});
    await themeEditSet('p', 'background-color', '#6c757d', {
      cwd,
      on: 'text-input',
      only: true,
    });
    expect(await partsNamed('p')).toEqual(['text-input']);
  }, 400_000);
});
