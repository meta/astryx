// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How reads a part against the theme: "<part> match the theme" gives
 * the steps show's missed list has for that part (and says so when it has
 * none); a color named like another part's ("grey like the dialogs", "the
 * same grey as the page") is that part's color, read, never changed; and
 * hard, unblurred or flat shadows keep their offsets with no blur. Every
 * line offered is run.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt225-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
  await themeEditNew('mt', {cwd, like: 'neutral'});
  // A new accent and square corners: the disabled primary button and the
  // full pills are what these changes missed.
  await themeEditSet('mt', 'accent', '#dc2626', {cwd});
  await themeEditSet('mt', 'corners', 'square', {cwd});
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

/** Run each line as offered. @param {string[]} lines */
const follow = async lines => {
  for (const line of lines) {
    const args =
      line.match(/'[^']*'|\S+/g)?.map(w => w.replace(/^'|'$/g, '')) ?? [];
    const r = await runCli(['experimental', 'theme', 'editor', ...args], cwd);
    expect(r.status, line).toBe(0);
  }
};

describe('a part matched to the theme', () => {
  it("gives the steps show's missed list has for it; followed, it is missed no more", async () => {
    const rs = await how('mt', 'button match the theme');
    expect(rs[0].text).toMatch(/^button \(disabled\): /);
    const lines = writes(rs);
    expect(lines).toEqual([
      "set mt background-color 'var(--color-neutral)' --on button --when variant:primary --state disabled",
      "set mt color 'var(--color-text-primary)' --on button --when variant:primary --state disabled",
    ]);
    await follow(lines);
    const again = await how('mt', 'button match the theme');
    expect(writes(again)).toEqual([]);
    expect(again[0].text).toContain("follows mt's changes already");
  }, 240_000);

  it('a full pill the corners left, as missed has it', async () => {
    expect(writes(await how('mt', 'make the badge match the theme'))).toEqual([
      "set mt border-radius 'var(--radius-element)' --on badge",
    ]);
  }, 120_000);

  it('a part nothing missed says so, and writes nothing', async () => {
    const rs = await how('mt', 'tooltip match the theme');
    expect(writes(rs)).toEqual([]);
    expect(rs[0].text).toContain("show's missed list has nothing for it");
  }, 120_000);
});

describe("a color named like another part's", () => {
  it('"grey like the dialogs" reads the dialog\'s fill and never changes the dialog', async () => {
    const lines = writes(
      await how('ne', 'make the menus grey like the dialogs'),
    );
    expect(lines).toEqual([
      "set ne background-color 'var(--color-background-surface)' --on dropdown-menu",
    ]);
    await follow(lines);
  }, 120_000);

  it('"the same grey as the page" is the page\'s color, never the neutral role', async () => {
    const lines = writes(
      await how('ne', 'make the cards the same grey as the page'),
    );
    expect(lines).toEqual([
      "set ne background-color 'var(--color-background-body)' --on card",
    ]);
    await follow(lines);
  }, 120_000);
});

describe('hard shadows', () => {
  it.each([
    ['make the shadows hard', 'h1'],
    ['no blur on shadows', 'h2'],
    ['flat shadows', 'h3'],
  ])(
    '%s: every shared shadow with no blur, never none',
    async (ask, theme) => {
      await themeEditNew(theme, {cwd, like: 'neutral'});
      const lines = writes(await how(theme, ask));
      expect(lines.map(l => l.split(' ')[2])).toEqual([
        '--shadow-low',
        '--shadow-med',
        '--shadow-high',
      ]);
      for (const l of lines) {
        expect(l).not.toContain(' none');
        // Every layer's blur (its third length) is 0.
        const value = /'([^']+)'/.exec(l)?.[1] ?? '';
        const blurs = [
          ...value.matchAll(
            /(?:^|\)\s*,\s*)(?:inset )?-?[\d.]+(?:px)? -?[\d.]+(?:px)? ([\d.]+)px/g,
          ),
        ].map(m => Number(m[1]));
        expect(blurs.length).toBeGreaterThan(0);
        expect(blurs.every(b => b === 0)).toBe(true);
      }
      await follow(lines);
      const css = fs.readFileSync(
        path.join(cwd, `themes/${theme}/${theme}.css`),
        'utf8',
      );
      expect(css).toMatch(/--shadow-med: 0 2px 0px/);
    },
    120_000,
  );
});
