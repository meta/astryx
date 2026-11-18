// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A font family said by its name, in capitals, beside the text it is
 * for ("Fraunces headings", "use Playfair Display for headings", "headings
 * in Lora") is that family on that text, as "font Lora" is; a capitalized
 * word the readers know ("Bold headings") keeps its own reading.
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
  cwd = makeLinkedFixture('astryx-theme-how-family-named-', FIXTURE_PACKAGES);
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

describe('a family said by name', () => {
  for (const [ask, line] of [
    ['Fraunces headings', 'set q0 font Fraunces --on heading'],
    [
      'use Playfair Display for headings',
      "set q0 font 'Playfair Display' --on heading",
    ],
    ['Merriweather body text', 'set q0 font Merriweather --on body'],
    ['headings in Lora', 'set q0 font Lora --on heading'],
  ])
    it(
      ask,
      async () => {
        expect(writes(await how('q0', ask))[0]).toBe(line);
      },
      240_000,
    );

  for (const ask of [
    'Navbar text white',
    'Page titles 32px',
    'Dialog titles smaller',
    'Primary text darker',
  ])
    it(`a capitalized part, place or role is no family: ${ask}`, async () => {
      expect(
        writes(await how('q0', ask)).some(line =>
          /^set q0 (?:font|font-family) (?:Navbar|Page|Dialog|Primary)\b/.test(
            line,
          ),
        ),
      ).toBe(false);
    }, 240_000);

  it('a capitalized word the readers know keeps its reading', async () => {
    expect(writes(await how('q0', 'Bold headings'))[0]).toBe(
      'set q0 headings bold',
    );
  }, 240_000);
});
