// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A component's doc keyword never captures an ask that names another
 * part outright: "the side nav dark" is side-nav's, never AppShell's,
 * though AppShell's docs list "sidenav" among its words. The shell is
 * written only when asked as the shell.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-keyword-names-part-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} theme @param {string} ask */
const how = async (theme, ask) => {
  const {data} = /** @type {any} */ (await themeEditHow(ask, {cwd, theme}));
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    commands: r.commands.map(c => c.replace(/^.*? editor /, '')),
  }));
};

/** @param {Array<{commands: string[]}>} rs */
const writes = rs =>
  rs.flatMap(r => r.commands).filter(c => /^(set|undo) /.test(c));

describe('a doc keyword that names a part of its own', () => {
  it('the side and top nav are their own parts, never the app shell; the shell is still the shell', async () => {
    await themeEditNew('k1', {cwd, like: 'neutral'});
    for (const [ask, part] of [
      ['make the side nav dark', 'side-nav'],
      ['make the top nav dark', 'top-nav'],
      ['make the side nav navy with white text', 'side-nav'],
      ['make the top nav navy with white text', 'top-nav'],
    ]) {
      const lines = writes(await how('k1', ask)).join('\n');
      expect(lines, ask).toMatch(new RegExp(` --on ${part}\\b`));
      expect(lines, ask).not.toMatch(/ --on app-shell\b/);
    }
    const shell = writes(await how('k1', 'make the app shell dark'));
    expect(shell.join('\n')).toMatch(/ --on app-shell\b/);
  }, 240_000);
});
