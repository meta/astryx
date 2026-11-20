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

describe('a lone color after a piece', () => {
  it('is the text of a part that is only text, the fill of a plain fill, and the accent after a button', async () => {
    expect(
      writes(await how('q0', 'bold headings, dark gray')).join('\n'),
    ).toMatch(/color '#[0-9a-f]{6}' --on heading/);
    expect(writes(await how('q0', 'large headings, navy')).join('\n')).toMatch(
      /color '#[0-9a-f]{6}' --on heading/,
    );
    expect(writes(await how('q0', 'rounder cards, white')).join('\n')).toMatch(
      /background-color '#ffffff' --on card/,
    );
    expect(
      writes(await how('q0', 'big buttons, a sky blue, high contrast')).join(
        '\n',
      ),
    ).toMatch(/accent '#[0-9a-f]{6}'/);
  }, 240_000);
});

describe('a lone color after a link, a group or labels', () => {
  it('is the link text, the group fill, and the form label text', async () => {
    const link = writes(await how('q0', 'bold links, red')).join('\n');
    expect(link).not.toMatch(/background-color '#dc2626' --on link/);
    expect(link).toMatch(/'#dc2626'/);
    expect(writes(await how('q0', 'rounded inputs, white')).join('\n')).toMatch(
      /'#ffffff' --on inputs/,
    );
    expect(writes(await how('q0', 'bold labels, dark gray'))).toContain(
      "set q0 color '#374151' --on field-label",
    );
  }, 240_000);
});

describe('a lone color after a part that draws with the accent', () => {
  it('is the accent when it has a hue, and the part fill when it has none', async () => {
    const box = writes(await how('q0', 'rounded checkboxes, navy')).join('\n');
    expect(box).toMatch(/accent '#1e3a8a'/);
    for (const [ask, part, ink] of [
      ['rounded checkboxes, white', 'checkbox-indicator', '#ffffff'],
      ['rounded checkboxes, black', 'checkbox-indicator', '#000000'],
      ['rounded radios, white', 'radio-indicator', '#ffffff'],
    ])
      expect(writes(await how('q0', ask)).join('\n')).toMatch(
        new RegExp(`background-color '${ink}' --on ${part}`),
      );
    for (const [ask, ink] of [
      ['rounder buttons, white', '#ffffff'],
      ['bigger buttons, black', '#000000'],
      ['rounder buttons, gray', '#[0-9a-f]{6}'],
      ['rounder buttons, dark gray', '#374151'],
    ])
      expect(writes(await how('q0', ask)).join('\n')).toMatch(
        new RegExp(`background-color '${ink}' --on button`),
      );
    expect(
      writes(await how('q0', 'rounder buttons, dark gray')).join('\n'),
    ).not.toMatch(/accent '#374151'/);
    expect(
      writes(await how('q0', 'rounder progress bars, white')).join('\n'),
    ).toMatch(/background-color '#ffffff' --on progress-bar/);
  }, 240_000);
});

describe('a lone color after a part that does not draw with the accent', () => {
  it('reads as it always has, never as the accent', async () => {
    for (const [ask, line] of [
      ['bigger icons, red', "--color-icon-primary '#dc2626'"],
      ['bigger tabs, blue', "background-color '#2563eb' --on tab"],
      ['rounder avatars, purple', "background-color '#7c3aed' --on avatar"],
    ]) {
      const lines = writes(await how('q0', ask));
      expect(lines, ask).toContain(`set q0 ${line}`);
      expect(lines.join('\n'), ask).not.toMatch(/^set q0 accent /m);
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

// (Asks reviewers raised on this reading that it does not answer yet: each
// is the answer it should give.)
describe('a lone color after a part, asks still open', () => {
  it.todo(
    '"rounder buttons, white, headings in Lora" fills the buttons white and sets Lora on headings',
  );
});
