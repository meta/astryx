// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sixty-fourth pass: the entry normalizer follows through. Quotes
 * only delimit (a curly quote inside a quoted CSS string is kept), JSON and
 * paste debris is read as the value, a font stack is read as families, flags
 * are cleaned like values, a saved dial value is offered cleaned, a theme
 * folder of empty folders is empty, and a mistyped theme name keeps the
 * command.
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
  familiesOf,
  normalValueText,
  normalizeEntry,
  withoutDebris,
} from './_check.mjs';
import {folderIsEmpty} from './_settings.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt64-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}
const names = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ x) => x.name);
const file = () => path.join(cwd, 'themes/b/b.settings.json');
const saved = (/** @type {string} */ thing) =>
  JSON.parse(fs.readFileSync(file(), 'utf8')).settings.find(
    (/** @type {any} */ x) => x.thing === thing && !x.on && !x.mode,
  )?.value;

describe('N64/N59: quotes only delimit', () => {
  it.each([
    ['"\u201CHi\u201D"', '"\u201CHi\u201D"'],
    ['"it\u2019s"', '"it\u2019s"'],
    ['\u201COpen Sans\u201D, serif', '"Open Sans", serif'],
    ['\u00ABInter\u00BB', '"Inter"'],
    ['\u2039Inter\u203A', '"Inter"'],
    ['`Inter`', '"Inter"'],
    ['\uFF02Inter\uFF02', '"Inter"'],
    ['\u2018Inter\u2019', "'Inter'"],
    // What delimiting quotes hold is kept as typed: a slash between spaces.
    ['\u201C / \u201D', '" / "'],
    ['\u201C \u203A \u201D', '" \u203A "'],
    ['\u00AB Inter \u00BB', '" Inter "'],
    // Curly quotes pair by kind, in any shape; one left unpaired is straight.
    ['\u201EInter\u201C', '"Inter"'],
    ['\u201AInter\u2018', "'Inter'"],
    ['\u201CInter"', '"Inter"'],
    ['Macy\u2019s, serif', "Macy's, serif"],
    ['"a\u00A0b" x\u00A0y', '"a\u00A0b" x y'],
  ])('%j reads as %j', (typed, want) => {
    expect(normalValueText(typed)).toBe(want);
  });

  // A font family trims the spaces inside its quotes (French guillemets);
  // other quoted text keeps them.
  it.each([
    ['--font-family-body', '\u00AB Inter \u00BB', '"Inter"'],
    ['--font-family-body', '\u00AB\u00A0Inter\u202F\u00BB', '"Inter"'],
    ['font', '\u00AB Inter \u00BB, serif', '"Inter", serif'],
    ['content', '\u201C / \u201D', '" / "'],
    ['content', '\u201C \u203A \u201D', '" \u203A "'],
  ])('%s %j is %j', (thing, typed, want) => {
    expect(normalizeEntry(thing, typed).value).toBe(want);
  });
});

describe('N66/N67/N62/N69: entry repair', () => {
  it.each([
    [
      ['"accent": "#e11d48"', ''],
      ['accent', '#e11d48'],
    ],
    [
      ['{"accent": "#e11d48"}', ''],
      ['accent', '#e11d48'],
    ],
    [
      ['{"accent"', '"#e11d48"}'],
      ['accent', '#e11d48'],
    ],
    [
      ['"--color-accent"', '#e11d48'],
      ['--color-accent', '#e11d48'],
    ],
    [
      ['accent', '#e11d48,'],
      ['accent', '#e11d48'],
    ],
    [
      ['accent', '= #e11d48'],
      ['accent', '#e11d48'],
    ],
    [
      ['accent', ': #e11d48'],
      ['accent', '#e11d48'],
    ],
    [
      ['accent', "#e11d48'"],
      ['accent', '#e11d48'],
    ],
    [
      ['accent', '#e11d48)'],
      ['accent', '#e11d48'],
    ],
    [
      ['accent: #e11d48; text-size: 18', ''],
      ['accent', '#e11d48'],
    ],
    [
      ['accent', '#e11d48; text-size: 18'],
      ['accent', '#e11d48'],
    ],
    // A `;` inside a quoted string is the string's, never a second
    // declaration.
    [
      ['content', '"Tip; note: x"'],
      ['content', '"Tip; note: x"'],
    ],
    [
      ['content', "'a; b: c'"],
      ['content', "'a; b: c'"],
    ],
    // An escaped quote inside a string is no stray quote.
    [
      ['content', '"\\""'],
      ['content', '"\\""'],
    ],
    [
      ['content', "'\\''"],
      ['content', "'\\''"],
    ],
    [
      ['--color\u2013accent', 'red'],
      ['--color-accent', 'red'],
    ],
    [
      ['--color\u2011accent', 'red'],
      ['--color-accent', 'red'],
    ],
    [
      ['textSize', '18'],
      ['text-size', '18'],
    ],
    [
      ['text_size', '18'],
      ['text-size', '18'],
    ],
    [
      ['text\u2011size', '18'],
      ['text-size', '18'],
    ],
  ])('%j is %j', ([thing, value], [t, v]) => {
    expect(normalizeEntry(thing, value)).toEqual({thing: t, value: v});
  });

  it('keeps a value with no debris as typed', () => {
    for (const v of [
      'rgb(1 2 3)',
      '"Macy\u2019s", serif',
      "it's",
      'calc(1px + 2px)',
    ])
      expect(withoutDebris(v)).toBe(v);
  });

  it.each([
    ['accent', '#e11d48,'],
    ['text-size', '18,'],
    ['"text-size"', '18'],
    ['textSize', '18'],
  ])(
    'set b %s %j lands',
    async (thing, value) => {
      await themeEditSet('b', thing, value, {cwd});
    },
    240_000,
  );

  it.each([
    ['text-size', '18px;', / set b text-size 18$/],
    ['text-size', '14pt;', / set b text-size 18\.67$/],
    ['text-size', '"18"', / set b text-size 18$/],
    ['accent', '"#e11d48",', / set b accent '#e11d48'$/],
  ])('set b %s %j suggests the value typed', async (thing, value, want) => {
    const err = await refusal(() => themeEditSet('b', thing, value, {cwd}));
    expect(names(err).join('\n')).toMatch(new RegExp(want.source, 'm'));
  });
});

describe('N70: a font stack is read as families', () => {
  it.each([
    [
      '"SF Mono", Monaco, Consolas, monospace,',
      ['SF Mono', 'Monaco', 'Consolas', 'monospace'],
    ],
    [
      '""SF Mono", Monaco, Consolas, monospace"',
      ['SF Mono', 'Monaco', 'Consolas', 'monospace'],
    ],
    [
      '"Georgia, "Times New Roman", serif"',
      ['Georgia', 'Times New Roman', 'serif'],
    ],
  ])('%j', (typed, want) => {
    expect(familiesOf(typed)).toEqual(want);
  });

  it.each(['""', '"", serif', "'', serif"])(
    'an empty family %j is refused',
    async value => {
      const err = await refusal(() =>
        themeEditSet('b', '--font-family-body', value, {cwd}),
      );
      expect(err.code).toBe('ERR_THEME_BAD_VALUE');
      expect(names(err).join(' ')).not.toMatch(/""/);
    },
  );

  it('a stack wrapped in one more pair of quotes is offered unwrapped', async () => {
    const err = await refusal(() =>
      themeEditSet(
        'b',
        '--font-family-code',
        '""SF Mono", Monaco, Consolas, monospace"',
        {cwd},
      ),
    );
    const line = names(err)[0];
    expect(line).toMatch(/Monaco, Consolas, monospace'?$/);
    expect(line).not.toMatch(/""|", Monaco/);
  });
});

describe('N68: --mode is read like a value and kept in suggestions', () => {
  it.each(['dark ', 'dark\u00A0', '\u200Bdark', '\u201Cdark\u201D', 'dark:'])(
    '--mode %j',
    async mode => {
      await themeEditSet('b', '--color-accent', 'red', {cwd, mode});
      const s = JSON.parse(fs.readFileSync(file(), 'utf8')).settings.find(
        (/** @type {any} */ x) => x.thing === '--color-accent' && x.mode,
      );
      expect(s.mode).toBe('dark');
      await themeEditUndo('b', {cwd, thing: '--color-accent', mode: 'dark'});
    },
    240_000,
  );

  it('a near typo keeps --mode in the run line', async () => {
    const err = await refusal(() =>
      themeEditSet('b', '--color-accent', 'red', {cwd, mode: 'drak'}),
    );
    expect(names(err)[0]).toMatch(/--mode dark$/);
  });
});

describe('N65: a saved value with quotes', () => {
  /** @param {any} entry @param {() => Promise<void>} body */
  const withSaved = async (entry, body) => {
    const kept = fs.readFileSync(file(), 'utf8');
    const data = JSON.parse(kept);
    data.settings.push(entry);
    fs.writeFileSync(file(), JSON.stringify(data));
    try {
      await body();
    } finally {
      fs.writeFileSync(file(), kept);
    }
  };

  it.each(['"it\u2019s"', '"\u201CHi\u201D"'])(
    'a curly quote inside a quoted content string is valid: %j',
    async value => {
      await withSaved(
        {thing: 'content', value, source: 'property', on: 'badge'},
        async () => {
          await themeEditShow('b', {cwd});
        },
      );
    },
    240_000,
  );

  it('curly quotes around a token value are named, with the cleaned set line', async () => {
    await withSaved(
      {thing: '--color-accent', value: '\u201C#e11d48\u201D', source: 'token'},
      async () => {
        const err = await refusal(() => themeEditShow('b', {cwd}));
        expect(err.message).toContain('curly or other quotes');
        expect(err.message).not.toContain('no-break');
        expect(names(err)).toContainEqual(
          expect.stringMatching(/ set b --color-accent '#e11d48'$/),
        );
      },
    );
  }, 240_000);
});

describe('hunt64 (1): a saved dial value is offered cleaned', () => {
  it.each([
    'pill\u00A0',
    ' pill',
    'Pill',
    'corners: pill',
    '\u201Cpill\u201D',
    '"pill"',
  ])(
    '%j',
    async raw => {
      await themeEditSet('b', 'corners', 'pill', {cwd});
      const kept = fs.readFileSync(file(), 'utf8');
      fs.writeFileSync(file(), kept.replace('"pill"', JSON.stringify(raw)));
      try {
        const err = await refusal(() => themeEditShow('b', {cwd}));
        expect(names(err)).toContainEqual(
          expect.stringMatching(/ set b corners pill$/),
        );
      } finally {
        fs.writeFileSync(file(), kept);
      }
    },
    240_000,
  );
});

describe('hunt64 (2): a theme folder of empty folders is empty', () => {
  it('folderIsEmpty sees through empty subfolders, never a file', () => {
    const dir = path.join(cwd, 'scratch-empty');
    fs.mkdirSync(path.join(dir, 'tokens', 'deeper'), {recursive: true});
    expect(folderIsEmpty(dir)).toBe(true);
    fs.writeFileSync(path.join(dir, 'tokens', 'deeper', 'x.txt'), 'x');
    expect(folderIsEmpty(dir)).toBe(false);
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('new makes a theme in a folder holding only an empty tokens/', async () => {
    fs.mkdirSync(path.join(cwd, 'themes/e/tokens'), {recursive: true});
    await themeEditNew('e', {cwd});
    expect(fs.existsSync(path.join(cwd, 'themes/e/e.settings.json'))).toBe(
      true,
    );
  }, 240_000);
});

describe('hunt64 (3): a mistyped theme name keeps the command', () => {
  it.each([
    ['set', 'B', 'spacing', 'roomy', / set b spacing roomy$/],
    ['set', 'themes/b', 'spacing', 'roomy', / set b spacing roomy$/],
    ['undo', './b', 'corners', undefined, / undo b corners$/],
  ])(
    '%s %s',
    async (sub, theme, thing, value, want) => {
      await themeEditSet('b', 'corners', 'pill', {cwd});
      const err = await refusal(() =>
        sub === 'set'
          ? themeEditSet(theme, thing, /** @type {string} */ (value), {cwd})
          : themeEditUndo(theme, {cwd, thing}),
      );
      expect(names(err)[0]).toMatch(want);
      expect(names(err)).not.toContainEqual(expect.stringMatching(/ show b$/));
    },
    240_000,
  );
});

describe('#11527: quotes and declarations, set end to end', () => {
  it('a content string holding `; name:` is saved as typed', async () => {
    await themeEditSet('b', 'content', '"Tip; note: x"', {cwd, on: 'badge'});
    const s = JSON.parse(fs.readFileSync(file(), 'utf8')).settings.find(
      (/** @type {any} */ x) => x.thing === 'content' && x.on === 'badge',
    );
    expect(s.value).toBe('"Tip; note: x"');
    await themeEditUndo('b', {cwd, thing: 'content', on: 'badge'});
  }, 240_000);

  it.each(['\u201EInter\u201C', '\u201AInter\u2018', '\u201CInter"'])(
    'font %j saves no curly quote in the family',
    async value => {
      await themeEditSet('b', '--font-family-body', value, {cwd});
      expect(saved('--font-family-body')).not.toMatch(/[\u2018-\u201F]/);
      expect(saved('--font-family-body')).toContain('Inter');
    },
    240_000,
  );
});

describe('hunt74: a saved font family in French quotes', () => {
  it.each(['\u00AB Inter \u00BB', '\u00AB\u00A0Inter\u202F\u00BB'])(
    '%j offers the trimmed family',
    async raw => {
      const kept = fs.readFileSync(file(), 'utf8');
      const data = JSON.parse(kept);
      data.settings.push({
        thing: '--font-family-body',
        value: raw,
        source: 'token',
      });
      fs.writeFileSync(file(), JSON.stringify(data));
      try {
        const err = await refusal(() => themeEditShow('b', {cwd}));
        const line = names(err).find((/** @type {string} */ n) =>
          / set b --font-family-body /.test(n),
        );
        expect(line).toMatch(/ set b --font-family-body '"Inter"'$/);
      } finally {
        fs.writeFileSync(file(), kept);
      }
    },
    240_000,
  );
});
