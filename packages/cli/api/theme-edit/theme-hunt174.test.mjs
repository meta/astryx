// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file show's `missed`: the parts the theme's own changes should have
 * reached and did not, one of each kind first (an inverted surface, a
 * disabled part drawn as the accent at reduced opacity, a selected state on
 * the base's fill, a status fill, a pill, a borderless surface), each with
 * the one line that reaches it, its state named; the text shows six, and
 * counts the other parts on the base's look. The shared hover and pressed
 * tints are no fill of a part's own.
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
  cwd = makeLinkedFixture('astryx-theme-hunt174-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', 'accent', '#00aa2a', {cwd});
  await themeEditSet('t', 'corners', 'square', {cwd});
  await themeEditSet('t', '--border-width', '2px', {cwd});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const P = 'astryx experimental theme editor';
const missed = async () =>
  /** @type {Array<{part: string, state?: string, why: string, line: string}>} */ (
    /** @type {any} */ (await themeEditShow('t', {cwd})).data.missed
  );

describe('missed', () => {
  it('names one of each kind first, each with the line that reaches it', async () => {
    const list = await missed();
    const at = (
      /** @type {string} */ part,
      /** @type {string} */ [state] = [],
    ) =>
      list.findIndex(m => m.part === part && (m.state ?? '') === (state ?? ''));
    // The toast's inverted surface still stands out from the page: drawn
    // so on purpose, not missed.
    expect(list.some(m => /inverted/.test(m.why))).toBe(false);
    expect(list[0].part).toBe('button');
    expect(list[0].line).toMatch(
      new RegExp(
        `^${P} set t background-color 'var\\(--color-neutral\\)' --on button --when variant:primary --state disabled && `,
      ),
    );
    expect(at('side-nav-item', ['selected'])).toBeLessThan(5);
    expect(at('banner')).toBeLessThan(5);
    // The first lines reach five kinds (disabled, selected, status, pills,
    // borderless), never several of one.
    const kinds = list.slice(0, 5).map(m => m.why.split(/[:,(]/)[0].trim());
    expect(new Set(kinds).size).toBe(5);
  }, 240_000);

  it('a part whose only fill is the shared hover or pressed tint is never unreached', async () => {
    const r = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
    for (const part of ['link', 'toggle-button', 'dropdown-menu-item'])
      expect(r.unreached).not.toContain(part);
  }, 240_000);

  it('a followed line takes its part off the list', async () => {
    await themeEditSet('t', 'background-color', 'var(--color-accent-muted)', {
      cwd,
      on: 'side-nav-item',
      state: 'selected',
    });
    expect(
      (await missed()).map(m => `${m.part}:${m.state ?? ''}`),
    ).not.toContain('side-nav-item:selected');
  }, 240_000);

  it('the text shows six with their lines and counts the rest', async () => {
    const text = (
      await runCli(['experimental', 'theme', 'editor', 'show', 't'], {cwd})
    ).stdout;
    const block = text.slice(text.indexOf('missed ('));
    const items = block
      .split('\n')
      .slice(1)
      .filter(l => l.startsWith('  line: '));
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(7);
    expect(
      items.every(l => / experimental theme editor (set|how) /.test(l)),
    ).toBe(true);
    expect(text).toMatch(/\nunreached: +\d+ more (parts?|missed)/);
  }, 240_000);
});
