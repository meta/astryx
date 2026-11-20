// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file show's `unreached`: a part counts as reached only when its fill and
 * its text color changed from the base (or a setting is on it); the most
 * visible parts come first; the text counts them (the parts the theme's own
 * changes missed are named, with their lines, under missed), and the JSON
 * lists them all.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-part-counts-reached-fill-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  // An accent alone: parts painted with the neutral surfaces (a toast on
  // its inverted surface, a tooltip, a banner) keep the base's fill.
  await themeEditSet('t', 'accent', '#00aa2a', {cwd});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('unreached', () => {
  it("lists a part whose fill stays the base's, most visible first", async () => {
    const r = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
    const list = /** @type {string[]} */ (r.unreached);
    for (const part of ['toast', 'tooltip', 'banner'])
      expect(list).toContain(part);
    // Overlays come first: in the ten the text names.
    for (const part of ['toast', 'tooltip'])
      expect(list.indexOf(part)).toBeLessThan(10);
  }, 240_000);

  it('a part counts as reached once its fill and its text both changed', async () => {
    // The neutral color reaches the inverted surface a toast draws on and
    // the text on it.
    await themeEditSet('t', 'neutral', '#101010', {cwd});
    const r = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
    expect(r.unreached).not.toContain('toast');
  }, 240_000);

  it('a setting on a part takes it off the list', async () => {
    await themeEditSet('t', 'background-color', '#222222', {cwd, on: 'banner'});
    const r = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
    expect(r.unreached).not.toContain('banner');
  }, 240_000);

  it('the text counts them; the JSON names them all', async () => {
    const text = (
      await runCli(['experimental', 'theme', 'editor', 'show', 't'], {cwd})
    ).stdout;
    const line = text.split('\n').find(l => l.startsWith('unreached:')) ?? '';
    const json = JSON.parse(
      (
        await runCli(
          ['experimental', 'theme', 'editor', 'show', 't', '--json'],
          {cwd},
        )
      ).stdout,
    ).data.unreached;
    expect(json.length).toBeGreaterThan(10);
    expect(line).toMatch(
      /^unreached: +\d+ more parts? whose fill or text color is still the base's.* \(show --json lists each\)$/,
    );
    const set = (
      await runCli(
        ['experimental', 'theme', 'editor', 'set', 't', 'corners', 'pill'],
        {cwd},
      )
    ).stdout;
    expect(set).not.toContain('unreached');
  }, 240_000);
});
