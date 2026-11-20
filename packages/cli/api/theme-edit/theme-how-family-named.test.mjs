// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A font family said by its name, in capitals, beside the text it is
 * for ("Inter headings", "use Playfair Display for headings", "headings
 * in Lora") is that family on that text, as "font Lora" is; a capitalized
 * word the readers know ("Bold headings") keeps its own reading, and a
 * one-word name only Fontsource publishes, said with no cue ("Stylish
 * headings"), is offered, never written.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditUndo,
} from './theme-edit.mjs';
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
    ['headings in Fraunces', 'set q0 font Fraunces --on heading'],
    [
      'use Playfair Display for headings',
      "set q0 font 'Playfair Display' --on heading",
    ],
    [
      'use Acme Grotesk for headings',
      "set q0 font 'Acme Grotesk' --on heading",
    ],
    // (A catalog family that is no word the editor reads, with a cue.)
    ['headings in Basic', 'set q0 font Basic --on heading'],
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
    // (A one-word name only Fontsource publishes, said with no cue, may be
    // a plain word: it is offered, never written.)
    for (const [ask, name, on] of [
      ['Stylish headings', 'Stylish', 'heading'],
      ['Fraunces headings', 'Fraunces', 'heading'],
    ]) {
      const {data} = /** @type {any} */ (
        await themeEditHow(ask, {cwd, theme: 'q0'})
      );
      const results = /** @type {any[]} */ (data.results ?? []);
      expect(
        results
          .filter(r => !r.offer)
          .flatMap(r => r.commands)
          .some(c => / set q0 (?:font|font-family) /.test(c)),
        ask,
      ).toBe(false);
      expect(results.find(r => r.offer)?.commands?.[0], ask).toMatch(
        new RegExp(` set q0 font ${name} --on ${on}$`),
      );
    }
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

describe('a mode said with capitals', () => {
  it('is the mode, never a font family', async () => {
    for (const ask of [
      'headings in Dark Mode white',
      'body text in Dark Mode #e5e5e5',
    ]) {
      const lines = writes(await how('q0', ask));
      expect(lines.length, ask).toBeGreaterThan(0);
      expect(lines.join('\n'), ask).not.toMatch(/\bfont\b/);
      expect(lines.join('\n'), ask).toMatch(/--mode dark/);
    }
  }, 240_000);
});

describe('a family run that ends at a comma', () => {
  it('keeps the font', async () => {
    expect(
      writes(await how('q0', 'headings in Lora, rounder cards')),
    ).toContain('set q0 font Lora --on heading');
  }, 240_000);
});

describe('a cue or text noun that starts its sentence', () => {
  it('reads the family as it does in lower case', async () => {
    for (const ask of ['Use Lora for headings', 'Headings in Lora'])
      expect(writes(await how('q0', ask))).toContain(
        'set q0 font Lora --on heading',
      );
  }, 240_000);
});

describe('a frame said as a step from the value now', () => {
  it('stays on the member, never on its family group', async () => {
    const lines = writes(
      await how('q0', 'dialogs with a thinner border and a softer shadow'),
    ).join('\n');
    expect(lines).not.toMatch(/--on overlays/);
  }, 240_000);
});

describe('a color-blind piece in a list', () => {
  it('reads the other pieces as typed and answers before the first offer', async () => {
    const font = writes(
      await how('q0', 'color-blind friendly statuses, headings in Lora'),
    );
    expect(font).toContain('set q0 font Lora --on heading');
    const {data} = /** @type {any} */ (
      await themeEditHow(
        'color-blind friendly statuses and a card background #ffffff',
        {cwd, theme: 'q0'},
      )
    );
    const texts = data.results.map((/** @type {any} */ r) => r);
    const blind = texts.findIndex((/** @type {any} */ r) =>
      /^color-blind readers/.test(r.text),
    );
    const offer = texts.findIndex((/** @type {any} */ r) => r.offer);
    expect(blind).toBeGreaterThanOrEqual(0);
    if (offer >= 0) expect(blind).toBeLessThan(offer);
  }, 240_000);
});

describe('the base theme asked for by name', () => {
  it('adds the base before it is used', async () => {
    const answer = JSON.stringify(await how('q0', 'use the default theme'));
    expect(answer).toMatch(/astryx theme add neutral\b/);
    expect(answer).toMatch(/then astryx theme use neutral/);
  }, 240_000);

  it('says plainly when the theme has no base', async () => {
    await themeEditSet('q0', 'base', 'none', {cwd});
    try {
      const answer = JSON.stringify(await how('q0', 'use the default theme'));
      expect(answer).toMatch(/has no base theme/);
      expect(answer).not.toMatch(/theme use neutral/);
    } finally {
      await themeEditUndo('q0', {cwd, thing: 'base'});
    }
  }, 240_000);
});
