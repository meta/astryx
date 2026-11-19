// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page color's main-panel line: followed after the frame's line
 * (or before it), the main panel draws the page color; the see-through
 * rule the frame's line writes for the main area never covers a panel
 * color a setting gives.
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
    'astryx-theme-main-panel-page-color-',
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

/** @param {string} name */
const fresh = async name => {
  await themeEditNew(name, {cwd, like: 'neutral'});
  return name;
};

/** The built rules for the main panel, in order. @param {string} t */
const panelRules = t =>
  [
    ...fs
      .readFileSync(path.join(cwd, 'themes', t, `${t}.css`), 'utf8')
      .matchAll(/([^{}]*astryx-layout-content[^{]*)\{([^}]*)\}/g),
  ].map(m => ({sel: m[1].trim(), body: m[2]}));

describe('the main panel', () => {
  it('takes the page color the second line gives it, in either order', async () => {
    const t = await fresh('m1');
    const rs = await how(t, 'page background #0b1020 in dark mode');
    const lines = rs[0].commands.filter(c => /^set /.test(c));
    expect(lines).toContain(
      `set ${t} background-color '#0b1020' --on layout-content --mode dark`,
    );
    await follow(lines);
    const rules = panelRules(t);
    expect(rules.some(r => /#0b1020/.test(r.body))).toBe(true);
    expect(
      rules.some(r => /role="main"/.test(r.sel) && /transparent/.test(r.body)),
    ).toBe(false);
    const t2 = await fresh('m2');
    await themeEditSet(t2, 'background-color', '#000000', {
      cwd,
      on: 'layout-content',
      mode: 'dark',
    });
    await themeEditSet(t2, 'background-color', '#000000', {
      cwd,
      on: 'app-shell',
      mode: 'dark',
    });
    expect(
      panelRules(t2).some(
        r => /role="main"/.test(r.sel) && /transparent/.test(r.body),
      ),
    ).toBe(false);
  }, 240_000);

  it('a page color alone still makes the main area see-through', async () => {
    const t = await fresh('m3');
    await themeEditSet(t, 'background-color', '#000000', {
      cwd,
      on: 'app-shell',
      mode: 'dark',
    });
    expect(
      panelRules(t).some(
        r => /role="main"/.test(r.sel) && /transparent/.test(r.body),
      ),
    ).toBe(true);
  }, 240_000);
});
