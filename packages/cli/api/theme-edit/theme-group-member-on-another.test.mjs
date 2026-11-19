// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A group setting leaves out a member drawn on another member's
 * element (a clickable card on its card): the look reaches it there, and an
 * entry of its own would always beat the other member's later entries on
 * that element, so a later whole-theme look on cards ("surfaces glass")
 * would stop reaching clickable cards. A member named on its own keeps its
 * own entry.
 *
 * @position api/theme-edit — tests
 */

import fs from 'node:fs';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {themeFiles} from './_settings.mjs';

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-group-on-another-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} slug */
const css = slug => fs.readFileSync(themeFiles(cwd, slug).css, 'utf8');

describe('a group member drawn on another member', () => {
  it('takes the group look through that member, so a later look on cards reaches it', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    await themeEditNew('g', {cwd, like: 'neutral'});
    await themeEditSet('g', 'background-color', '#2563eb', {
      cwd,
      on: 'containers',
    });
    await themeEditSet('g', 'surfaces', 'glass', {cwd});
    const built = css('g');
    expect(built).toMatch(/\.astryx-card\s*\{[^}]*background-color: #2563eb/);
    expect(built).not.toMatch(/\.astryx-clickable-card\s*\{/);
    expect(built).not.toMatch(/\.astryx-selectable-card\s*\{/);
  }, 300_000);

  it('keeps a member named on its own', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    await themeEditNew('o', {cwd, like: 'neutral'});
    await themeEditSet('o', 'background-color', '#2563eb', {
      cwd,
      on: 'clickable-card',
      only: true,
    });
    expect(css('o')).toMatch(
      /\.astryx-clickable-card\s*\{[^}]*background-color: #2563eb/,
    );
  }, 300_000);
});
