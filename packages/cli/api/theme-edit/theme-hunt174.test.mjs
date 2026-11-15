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

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
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
    expect(list[0].part).toBe('toast');
    expect(list[0].line).toBe(
      `${P} set t background-color 'var(--color-background-popover)' --on toast`,
    );
    expect(at('button', ['disabled'])).toBeLessThan(6);
    expect(list[at('button', ['disabled'])].line).toMatch(
      /--on button --state disabled$/,
    );
    expect(at('side-nav-item', ['selected'])).toBeLessThan(6);
    expect(at('banner')).toBeLessThan(6);
    // Six lines reach six kinds: the pills (corners) and a borderless
    // surface (border width) are among them.
    const kinds = list.slice(0, 6).map(m => m.why.split(':')[0].split(',')[0]);
    expect(new Set(kinds).size).toBe(6);
  }, 240_000);

  it('a part whose only fill is the shared hover or pressed tint is never unreached', async () => {
    const r = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
    for (const part of ['link', 'toggle-button', 'dropdown-menu-item'])
      expect(r.unreached).not.toContain(part);
  }, 240_000);

  it('a followed line takes its part off the list', async () => {
    await themeEditSet(
      't',
      'background-color',
      'var(--color-background-popover)',
      {cwd, on: 'toast'},
    );
    expect((await missed()).map(m => m.part)).not.toContain('toast');
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
    expect(items.every(l => / --on /.test(l))).toBe(true);
    expect(text).toMatch(/\nunreached: +\d+ more parts keep the base's fill/);
  }, 240_000);
});
