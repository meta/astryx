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
  it('white text on destructive buttons is written as said, as main writes it', async () => {
    const lines = writes(await how('q0', 'white text on destructive buttons'));
    expect(lines).toEqual([
      "set q0 color '#ffffff' --on button --when variant:destructive",
    ]);
    await follow(lines);
  }, 240_000);

  it('white text on every button goes to each variant in the modes it reads in there', async () => {
    // (Measured at 4.5:1 on each variant's own fill: the primary fill reads
    // white in light mode only, 1.1:1 on its #f1f1f1 dark fill; the
    // secondary wash reads it in dark mode only, 1.3:1 in light; the ghost
    // button sits on the page, so it reads in dark mode only; the destructive
    // button reads it in dark mode only, 10.5:1 there and 1.5:1 on its
    // #ffc4be light fill.)
    const lines = writes(await how('q0', 'white text on buttons'));
    expect(lines).toEqual([
      "set q0 color '#ffffff' --on button --when variant:primary --mode light",
      "set q0 color '#ffffff' --on button --when variant:secondary --mode dark",
      "set q0 color '#ffffff' --on button --when variant:ghost --mode dark",
      "set q0 color '#ffffff' --on button --when variant:destructive --mode dark",
    ]);
  }, 240_000);
});
