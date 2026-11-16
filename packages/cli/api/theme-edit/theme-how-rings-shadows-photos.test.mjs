// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How measures white banner text on every status's fill; a part's
 * fill brighter is lighter; answers a focus ring given for each mode on
 * the outline too;
 * lengths before "padding" are no shadow; a part with no shared shadow says
 * so; a photo is no part of the theme. Every line offered is run.
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
    'astryx-theme-how-rings-shadows-photos-',
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

describe('rings, shadows, photos', () => {
  it('a focus ring for each mode reaches the outline in each mode', async () => {
    const lines = writes(
      await how(
        'q0',
        'focus ring #0067c0 in light mode and #60a5fa in dark mode',
      ),
    );
    expect(lines).toContain(
      `set q0 --focus-outline-color '#0067c0' --mode light`,
    );
    expect(lines).toContain(
      `set q0 --focus-outline-color '#60a5fa' --mode dark`,
    );
  }, 240_000);

  it('lengths before padding are no shadow; a part with no shared shadow says so', async () => {
    const rs = await how('q0', 'buttons 5px 16px padding');
    expect(writes(rs)).toEqual([`set q0 padding '5px 16px' --on button`]);
    expect(texts(rs)).not.toMatch(/shadow/);
    expect(texts(await how('q0', 'bigger shadow on cards'))).toMatch(
      /card draws no shared shadow of its own/,
    );
  }, 240_000);

  it('a photo is no part of the theme', async () => {
    const rs = await how('q0', 'rounded photos');
    expect(writes(rs)).toEqual([]);
    expect(texts(rs)).toMatch(/no part is called "photos"/);
  }, 240_000);
});

describe('text across statuses, a brighter fill', () => {
  it('white banner text goes to the mode it reads in on every status', async () => {
    expect(writes(await how('q0', 'white text in the banner'))).toEqual([
      `set q0 color '#ffffff' --on banner --mode dark`,
    ]);
    // (A tone variant pairs its own text: a card's fainter text stays whole.)
    expect(writes(await how('q0', "make the card's fainter text red"))).toEqual(
      [`set q0 --color-text-secondary '#dc2626' --on card`],
    );
  }, 240_000);

  it("a part's fill brighter is lighter", async () => {
    const rs = await how('q0', 'make the cards brighter');
    expect(rs[0].text).toMatch(/^a lighter background on card/);
  }, 240_000);
});
