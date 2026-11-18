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
  // (Real families: in the font catalog, or said after a cue.)
  for (const [ask, line] of [
    // (A catalog font is written as its preset.)
    ['Inter headings', 'set q0 font inter --on heading'],
    ['Georgia body text', 'set q0 font georgia --on body'],
    ['Segoe UI headings', 'set q0 font segoe --on heading'],
    [
      'use JetBrains Mono for headings',
      'set q0 font jetbrains-mono --on heading',
    ],
    ['headings in Lora', 'set q0 font Lora --on heading'],
    ['body text in Merriweather', 'set q0 font Merriweather --on body'],
    ['Fraunces headings', 'set q0 font Fraunces --on heading'],
    [
      'use Playfair Display for headings',
      "set q0 font 'Playfair Display' --on heading",
    ],
    [
      'use Acme Grotesk for headings',
      "set q0 font 'Acme Grotesk' --on heading",
    ],
    // (A catalog family that is no word the editor reads.)
    ['Basic headings', 'set q0 font Basic --on heading'],
    ['headings in Lobster', 'set q0 font Lobster --on heading'],
  ])
    it(
      ask,
      async () => {
        expect(writes(await how('q0', ask))[0]).toBe(line);
      },
      240_000,
    );

  // (Any other capitalized word is not a family: a feel, a look, a part, a
  // role, a weight or a style.)
  for (const ask of [
    'Softer text',
    'Warm text',
    'Elegant headings',
    'Friendly headings',
    'Modern headings',
    'Playful titles',
    'Clean body text',
    'Bold headings',
    'Navbar text white',
    'Page titles 32px',
    'Dialog titles smaller',
    'Primary text darker',
    'headings in Italic',
    'text in Blue',
    'use Bold for headings',
  ])
    it(`no family: ${ask}`, async () => {
      expect(
        writes(await how('q0', ask)).some(line =>
          /^set q0 (?:font|font-family) /.test(line),
        ),
      ).toBe(false);
    }, 240_000);

  it('a catalog family that is also a word the editor reads keeps the reading, and offers the family', async () => {
    const {data} = /** @type {any} */ (
      await themeEditHow('Assistant headings', {cwd, theme: 'q0'})
    );
    const results = /** @type {any[]} */ (data.results ?? []);
    const offer = results.find(r => r.offer);
    expect(results[0]?.offer).toBeFalsy();
    expect(offer?.text).toMatch(/"Assistant" is also a font family/);
    expect(offer?.commands?.[0]).toMatch(
      / set q0 font Assistant --on heading$/,
    );
    // (A casing said in words is the text's case, never a family.)
    for (const ask of [
      'titles in All Caps, rounder cards',
      'body text in Sentence Case',
    ])
      expect(
        writes(await how('q0', ask)).some(line =>
          /^set q0 (?:font|font-family) /.test(line),
        ),
        ask,
      ).toBe(false);
    // (With a cue it is the family.)
    expect(writes(await how('q0', 'headings in Assistant'))[0]).toBe(
      'set q0 font Assistant --on heading',
    );
  }, 240_000);

  it('a capitalized word the readers know keeps its reading', async () => {
    expect(writes(await how('q0', 'Bold headings'))[0]).toBe(
      'set q0 headings bold',
    );
  }, 240_000);
});
