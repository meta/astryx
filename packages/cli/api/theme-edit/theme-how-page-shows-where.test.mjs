// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A page color answer says where the page color shows: inside
 * AppShell, with the body rule only as the fallback, and the parts the part
 * data reads drawing it at rest. The token's own answer and the first set
 * of it in a theme say the same.
 */

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
  cwd = makeLinkedFixture(
    'astryx-theme-how-page-shows-where-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('q0', {cwd, like: 'neutral'});
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
// (The readable-text line set's own check adds beside a fill is measured
// on its own: these asks read the rest.)
const writes = rs =>
  rs
    .filter(r => !/^readable text on that fill/.test(r.text))
    .flatMap(r => r.commands)
    .filter(c => /^(set|undo) /.test(c));

/** Run each line as offered. @param {string[]} lines */
const follow = async lines => {
  for (const line of lines) {
    const args =
      line.match(/'[^']*'|\S+/g)?.map(w => w.replace(/^'|'$/g, '')) ?? [];
    const r = await runCli(['experimental', 'theme', 'editor', ...args], cwd);
    expect(r.status, line).toBe(0);
  }
};

/** @param {Array<{text: string}>} rs */
const texts = rs => rs.map(r => r.text).join('\n');

describe('where the page color shows', () => {
  for (const ask of [
    'page background',
    'a cream page background',
    'Make the app feel warmer: a cream page background, a terracotta accent color, and a serif font for headings.',
  ])
    it(`names the parts that draw it: ${ask}`, async () => {
      const t = texts(await how('q0', ask));
      // (AppShell first, the body line only as the fallback.)
      expect(t).toMatch(
        /Your theme's page color shows inside AppShell\. Wrap the page in AppShell; if you can't, add `body \{ background: var\(--color-background-body\) \}` to global CSS/,
      );
      expect(t).toMatch(/The parts that paint it: [^)]*app-shell/);
    }, 240_000);

  it('a question with no page color says nothing of it', async () => {
    expect(texts(await how('q0', 'rounder buttons'))).not.toMatch(
      /page color shows inside AppShell/,
    );
  }, 240_000);
});

describe('the token path', () => {
  const NOTE =
    /^Your theme's page color shows inside AppShell\. Wrap the page in AppShell; if you can't, add `body \{ background: var\(--color-background-body\) \}` to global CSS/;

  it('how asked by the token name leads with the note', async () => {
    const {data} = /** @type {any} */ (
      await themeEditHow('--color-background-body', {cwd, theme: 'q0'})
    );
    expect(data.note).toMatch(NOTE);
    expect(Object.keys(data).indexOf('note')).toBeLessThan(
      Object.keys(data).indexOf('source'),
    );
  }, 240_000);

  it('set says it once per theme, with its first page color', async () => {
    await themeEditNew('pg', {cwd, like: 'neutral'});
    const first = /** @type {any} */ (
      await themeEditSet('pg', '--color-background-body', '#fdf6e3', {cwd})
    );
    expect(JSON.stringify(first.data?.notes ?? first.notes ?? [])).toMatch(
      /page color shows inside AppShell/,
    );
    const second = /** @type {any} */ (
      await themeEditSet('pg', '--color-background-body', '#1c1a16', {
        cwd,
        mode: 'dark',
      })
    );
    expect(
      JSON.stringify(second.data?.notes ?? second.notes ?? []),
    ).not.toMatch(/page color shows inside AppShell/);
  }, 240_000);
});

describe('a theme with one mode', () => {
  it('says the page must take its page color in every OS mode', async () => {
    await themeEditNew('one', {cwd, like: 'neutral'});
    await themeEditSet('one', 'mode', 'dark-only', {cwd});
    const {data} = /** @type {any} */ (
      await themeEditHow('--color-background-body', {cwd, theme: 'one'})
    );
    expect(data.note).toMatch(
      /This theme has one mode \(dark-only\): .* in every OS mode/,
    );
    const both = /** @type {any} */ (
      await themeEditHow('--color-background-body', {cwd, theme: 'q0'})
    );
    expect(both.data.note).not.toMatch(/one mode/);
  }, 240_000);
});
