// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A text color set on a top bar's parts follows them into the phone menu:
 * the bar's links and its heading keep Core's color in the drawer where the
 * color would be unreadable there (named, with the line that gives it
 * anyway), and a color set for the drawer itself is measured on the
 * drawer's ground. Against a real bundled base theme.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-heading-drawer-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

describe('white text on a dark top bar', () => {
  it("holds the links and the heading at Core's color in the phone menu", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('fb', {cwd, like: 'neutral'});
    await themeEditSet('fb', 'mode', 'light-only', {cwd});
    await themeEditSet('fb', 'background-color', '#3b5998', {
      cwd,
      on: 'app-shell-header',
    });
    const items = /** @type {any} */ (
      await themeEditSet('fb', 'color', '#ffffff', {cwd, on: 'top-nav-item'})
    );
    expect(items.data.notes.join('\n')).toMatch(
      /top-nav-item keeps Core's color where it is drawn as mode=drawer/,
    );
    // (Held there, so no problem on the drawer for the links.)
    /** @param {any} r */
    const problems = r =>
      (r.data.newProblems ?? [])
        .map((/** @type {any} */ p) => p.problem)
        .join('\n');
    expect(problems(items)).not.toMatch(/top-nav-item.*mobile-nav-drawer/);
    const heading = /** @type {any} */ (
      await themeEditSet('fb', 'color', '#ffffff', {cwd, on: 'top-nav-heading'})
    );
    // (The heading is drawn as mode=drawer in the phone menu: held at
    // Core's color there, like the links, never a problem.)
    expect(heading.data.notes.join('\n')).toMatch(
      /top-nav-heading keeps Core's color where it is drawn as mode=drawer/,
    );
    expect(problems(heading)).not.toMatch(/mobile-nav-drawer/);
  }, 240_000);

  it("measures a color set for the drawer itself on the drawer's ground", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('fw', {cwd, like: 'neutral'});
    await themeEditSet('fw', 'mode', 'light-only', {cwd});
    const r = /** @type {any} */ (
      await themeEditSet('fw', 'color', '#ffffff', {
        cwd,
        on: 'top-nav-item',
        when: 'mode:drawer',
        only: true,
      })
    );
    expect(
      (r.data.newProblems ?? [])
        .map((/** @type {any} */ p) => p.problem)
        .join('\n'),
    ).toMatch(/top-nav-item.*mobile-nav-drawer/);
  }, 240_000);
});
