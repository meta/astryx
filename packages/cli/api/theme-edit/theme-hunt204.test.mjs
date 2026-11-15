// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A status setting wins over a part's plain one-mode color whatever
 * was set first (the variant blocks a plain color is written into come
 * before every other condition); value questions read what the part draws
 * (its focus ring when focused, a toast's text on its own inverted
 * surface, a card's shadow at rest); and a one-mode borders ask gives the
 * lines a part does not draw yet with their color see-through in the other
 * mode, so the whole answer runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt204-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
  await themeEditNew('o', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * The answers to an ask: each result's text and commands, as the editor
 * prints them (without the runner).
 * @param {string} theme @param {string} ask
 */
const how = async (theme, ask) => {
  const {data} = /** @type {any} */ (await themeEditHow(ask, {cwd, theme}));
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    commands: r.commands.map(c => c.replace(/^.*? editor /, '')),
  }));
};

/** The commands that write, of every answer. @param {Array<{commands: string[]}>} rs */
const writes = rs =>
  rs
    .flatMap(r => r.commands)
    .flatMap(c => c.split(/ && (?:\S+ )*?editor /))
    .map(c => c.replace(/^.*? editor /, ''))
    .filter(c => /^(set|undo) /.test(c));

describe('a status setting and a later plain one-mode color', () => {
  it('the status border shows, though its block was made first', async () => {
    await themeEditSet('o', 'box-shadow', 'none', {
      cwd,
      on: 'selector',
      when: 'status:error',
      state: 'focus-within',
      only: true,
    });
    await themeEditSet('o', 'border-color', '#dc2626', {
      cwd,
      on: 'selector',
      only: true,
      mode: 'dark',
    });
    await themeEditSet('o', 'border-color', '#00aa00', {
      cwd,
      on: 'selector',
      when: 'status:error',
      only: true,
      mode: 'dark',
    });
    const css = fs.readFileSync(path.join(cwd, 'themes/o/o.css'), 'utf8');
    const plain = css.indexOf('#dc2626');
    const status = css.indexOf('#00aa00');
    expect(plain).toBeGreaterThan(-1);
    // Same weight: the later rule wins, and the status one is later.
    expect(status).toBeGreaterThan(plain);
    expect(css.slice(css.lastIndexOf('}', status), status)).toContain(
      'data-status="error"',
    );
  }, 300_000);
});

describe('value questions read what the part draws', () => {
  it.each([
    [
      'ne',
      'what is the focus ring of inputs in dark mode',
      /draws a box-shadow ring when focused: inset 0 0 0 2px #474747 in dark mode/,
    ],
    [
      'ne',
      'what is the focus ring of buttons in light mode',
      /button draws an outline when focused: 2px #1b1b1b in light mode/,
    ],
    [
      'ne',
      'what color is the toast text in dark mode',
      /toast has color #111111 \(--color-on-light, on its \S+ surface\) in dark mode/,
    ],
    [
      'ne',
      'what color is the toast text in light mode',
      /toast has color #ffffff \(--color-on-dark, on its \S+ surface\) in light mode/,
    ],
    [
      'ne',
      'what is the shadow of cards in dark mode',
      /card has box-shadow none in dark mode now/,
    ],
  ])(
    '%s %s',
    async (theme, ask, want) => {
      const rs = await how(theme, ask);
      expect(writes(rs)).toEqual([]);
      expect(rs[0].text).toMatch(want);
      expect(rs.flatMap(r => r.commands).join('\n')).not.toMatch(
        / mode dark-only| buttons /,
      );
    },
    120_000,
  );
});

describe('all borders in one mode', () => {
  it('gives every step, the new lines see-through in the other mode', async () => {
    const w = writes(await how('ne', 'make all borders red in dark mode'));
    expect(w).toContain("set ne --color-border '#dc2626' --mode dark");
    expect(w).toContain(
      "set ne border '1px solid light-dark(transparent, #dc2626)' --on dialog",
    );
    // A line's width and style never take --mode.
    expect(
      w.filter(c => /^set ne border '/.test(c) && /--mode/.test(c)),
    ).toEqual([]);
  }, 120_000);
});
