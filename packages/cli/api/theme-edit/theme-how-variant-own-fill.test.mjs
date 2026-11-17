// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A text color for a part's variant is measured on the fill the
 * base theme draws for that variant (a destructive button on the muted
 * error fill), not on the token Core reads under it, so the mode it goes
 * to is the one it reads in. Every line offered is run.
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
    'astryx-theme-how-variant-own-fill-',
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

describe('a variant on its own fill', () => {
  it('white text on destructive buttons goes to the mode the drawn fill reads in', async () => {
    const lines = writes(await how('q0', 'white text on destructive buttons'));
    // (The neutral theme draws destructive buttons on the pale muted error
    // fill in light mode: white reads only in dark mode.)
    expect(lines).toEqual([
      "set q0 color '#ffffff' --on button --when variant:destructive --mode dark",
    ]);
    await follow(lines);
  }, 240_000);

  it('white text on every button leaves destructive to dark mode', async () => {
    const lines = writes(await how('q0', 'white text on buttons'));
    expect(lines).toContain(
      "set q0 color '#ffffff' --on button --when variant:destructive --mode dark",
    );
    expect(lines.join(' ')).not.toMatch(/variant:destructive --mode light/);
  }, 240_000);
});
