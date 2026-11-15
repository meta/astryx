// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The input readers agree: a font typo reads as the one family it is
 * near (a preset and the family it names are one reading; a family near a
 * system font only is kept as typed, with the line that sets that font), a saved value set reads gets set's
 * repair on show and compile too, the editor's own printed line pasted
 * back carries its scope, a saved mode on a dial is refused as set refuses
 * it, night reads as dark, undo compares colors as colors, two headings
 * words are one new line, a token in another style is offered as the
 * token, and an entry saved in a typed form gets set's reading.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt162-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/**
 * The refusal a call gives, as its message and suggested lines.
 * @param {() => Promise<unknown>} call
 */
const refusal = async call => {
  try {
    await call();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      message: String(err.message),
      lines: (err.suggestions ?? []).map(
        (/** @type {{name: string}} */ s) => s.name,
      ),
    };
  }
  throw new Error('expected a refusal');
};
/** @param {string} slug */
const settingsFile = slug =>
  path.join(cwd, `themes/${slug}/${slug}.settings.json`);
/** @param {string} slug @param {(d: any) => void} change */
const editSettings = (slug, change) => {
  const d = JSON.parse(fs.readFileSync(settingsFile(slug), 'utf8'));
  change(d);
  fs.writeFileSync(settingsFile(slug), JSON.stringify(d, null, 2));
};

describe('a font typo', () => {
  it('of a family that is both a preset and a system font reads as that family', async () => {
    await themeEditNew('f1', {cwd});
    for (const [typed, meant] of [
      ['Verdena', 'verdana'],
      ['Helvetca', 'helvetica'],
      ['Robotto', 'roboto'],
      ['Segoe IU', "'segoe ui'"],
    ]) {
      const r = await refusal(() => themeEditSet('f1', 'font', typed, {cwd}));
      expect(r.lines.join('\n'), typed).toContain(` set f1 font ${meant}`);
    }
  }, 240_000);

  it("of a system family of several words, or inside a list, is kept as typed, and the note's line sets it", async () => {
    await themeEditNew('f2', {cwd});
    const words = await themeEditSet('f2', 'font', 'Times New Romna', {cwd});
    expect(words.data.setting.value).toBe('Times New Romna');
    expect(words.data.notes.join('\n')).toContain(
      " set f2 font 'times new roman'",
    );
    const list = await themeEditSet(
      'f2',
      'font',
      'Helvetica, Arail, sans-serif',
      {cwd},
    );
    expect(list.data.setting.value).toBe('Helvetica, Arail, sans-serif');
    expect(list.data.notes.join('\n')).toContain(
      " set f2 font 'Helvetica, arial, sans-serif'",
    );
  }, 240_000);
});

describe('a damaged saved value', () => {
  it("gets set's repair on show, as on a change", async () => {
    await themeEditNew('d3', {cwd});
    editSettings('d3', d =>
      d.settings.push({
        thing: 'opacity',
        value: '0,5',
        source: 'property',
        on: 'card',
      }),
    );
    const r = await refusal(() => themeEditShow('d3', {cwd}));
    expect(r.lines.join('\n')).toContain(' set d3 opacity 0.5 --on card');
  }, 240_000);

  it('saved in a typed form gets the reading set gives it', async () => {
    await themeEditNew('d12', {cwd});
    editSettings('d12', d =>
      d.settings.push({thing: 'corners: pill', value: '', source: 'dial'}),
    );
    const r = await refusal(() => themeEditShow('d12', {cwd}));
    expect(r.lines.join('\n')).toContain(' set d12 corners pill');
    editSettings('d12', d => {
      d.settings = [
        {thing: 'background-color', value: 'red --on card', source: 'property'},
      ];
    });
    const flags = await refusal(() => themeEditShow('d12', {cwd}));
    expect(flags.lines.join('\n')).toContain(
      ' set d12 background-color red --on card',
    );
  }, 240_000);

  it('a mode saved on a dial is refused as set refuses --mode', async () => {
    await themeEditNew('d6', {cwd});
    editSettings('d6', d =>
      d.settings.push({
        thing: 'corners',
        value: 'pill',
        source: 'dial',
        mode: 'dark',
      }),
    );
    const r = await refusal(() => themeEditShow('d6', {cwd}));
    expect(r.message).toContain('a dial is the same in light and dark');
    expect(r.lines.join('\n')).toContain(' undo d6 corners');
    expect(r.lines.join('\n')).toContain(' set d6 corners pill');
  }, 240_000);
});

describe('the editor reads', () => {
  it('its own printed line pasted back, with its scope', async () => {
    await themeEditNew('p5', {cwd});
    const r = await themeEditSet('p5', 'opacity = 0.7 on card', '', {cwd});
    expect(JSON.stringify(r.data)).toContain('card');
    await themeEditUndo('p5', {cwd, thing: 'opacity = 0.7 on card'});
    expect(
      JSON.parse(fs.readFileSync(settingsFile('p5'), 'utf8')).settings,
    ).toEqual([]);
  }, 240_000);

  it('night as dark only', async () => {
    await themeEditNew('m8', {cwd});
    const r = await refusal(() => themeEditSet('m8', 'mode', 'night', {cwd}));
    expect(
      r.lines.filter((/** @type {string} */ l) => / set m8 mode /.test(l)),
    ).toEqual([expect.stringContaining(' set m8 mode dark-only')]);
  }, 240_000);

  it('a saved color in another spelling, on undo', async () => {
    await themeEditNew('c9', {cwd});
    await themeEditSet('c9', 'background-color', '#ff0000', {cwd, on: 'card'});
    await themeEditUndo('c9', {
      cwd,
      thing: 'background-color',
      value: '#F00',
      on: 'card',
    });
    const saved = JSON.parse(fs.readFileSync(settingsFile('c9'), 'utf8'));
    expect(saved.settings).toEqual([]);
  }, 240_000);

  it('two headings words as one new line, and "and" as a list', async () => {
    const r = await refusal(() =>
      themeEditNew('h10', {cwd, settings: {headings: 'bold wide'}}),
    );
    expect(r.lines).toEqual([
      expect.stringMatching(/ new h10 --headings bold --headings wide$/),
    ]);
    await themeEditNew('h10b', {cwd});
    const and = await refusal(() =>
      themeEditSet('h10b', 'headings', 'bold and wide', {cwd}),
    );
    expect(and.lines.join('\n')).toContain(' set h10b headings wide');
  }, 240_000);

  it('a token in another style, offered as the token', async () => {
    await themeEditNew('t11', {cwd});
    for (const typed of ['--color_accent', '--colorAccent', '--color accent']) {
      const r = await refusal(() => themeEditSet('t11', typed, 'red', {cwd}));
      expect(r.lines.join('\n'), typed).toContain(
        ' set t11 --color-accent red',
      );
    }
  }, 240_000);
});
