// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The family roles the census reads from the parts' own structure are
 * groups `--on` takes: each expands to its members, and a look set on one
 * never overwrites a member the theme set the same thing on itself.
 * Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {groupsOf} from './_settings.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-family-role-groups-', FIXTURE_PACKAGES);
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

describe('family role groups', () => {
  it('each expand to the members their structure gives', async ctx => {
    if (needBases(ctx)) return;
    const groups = groupsOf(await context(cwd));
    const has = (/** @type {string} */ g, /** @type {string[]} */ ms) =>
      expect(groups[g], g).toEqual(expect.arrayContaining(ms));
    has('button-like', ['button', 'toggle-button']);
    has('overlays', [
      'dialog',
      'drawer',
      'bottom-sheet',
      'popover',
      'hover-card',
    ]);
    has('option-rows', ['dropdown-menu-item', 'typeahead-option']);
    has('selected-items', [
      'calendar-day',
      'side-nav-item',
      'segmented-control-item',
    ]);
    has('accent-fills', ['button', 'progress-bar-fill']);
    has('inset-fields', ['text-input', 'slider-track']);
    // (A selectable item is never button-like; a tooltip is no surface.)
    expect(groups['button-like']).not.toContain('segmented-control-item');
    expect(groups.overlays).not.toContain('tooltip');
  }, 240_000);

  it('a look on a group keeps a member the theme set itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    await themeEditSet('k', 'background-image', 'linear-gradient(red, blue)', {
      cwd,
      on: 'toggle-button',
    });
    await themeEditSet(
      'k',
      'background-image',
      'linear-gradient(#ffffff, #e6e6e6)',
      {cwd, on: 'button-like'},
    );
    const css = fs.readFileSync(path.join(cwd, 'themes', 'k', 'k.css'), 'utf8');
    const rule = (/** @type {string} */ p) =>
      new RegExp(`\\.astryx-${p} \\{[^}]*\\}`).exec(css)?.[0] ?? '';
    expect(rule('button')).toMatch(/linear-gradient\(#ffffff, #e6e6e6\)/);
    expect(rule('toggle-button')).toMatch(/linear-gradient\(red, blue\)/);
  }, 240_000);
});
