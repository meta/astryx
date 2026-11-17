// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A page color answer says where the page color shows: the parts the
 * part data reads drawing it at rest, and what a page built from none of
 * them needs.
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
      expect(t).toMatch(
        /the page color shows only where a part draws it \([^)]*app-shell/,
      );
      expect(t).toMatch(
        /the theme's page color paints inside AppShell; a page without AppShell keeps the browser's white until its own CSS adds one line: body \{ background: var\(--color-background-body\) \}/,
      );
    }, 240_000);

  it('a question with no page color says nothing of it', async () => {
    expect(texts(await how('q0', 'rounder buttons'))).not.toMatch(
      /the page color shows/,
    );
  }, 240_000);
});
