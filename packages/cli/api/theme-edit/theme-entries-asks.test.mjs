// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme editor reads what a person types or pastes: saved entries
 * and the forms they are written in, input readers and their repairs,
 * lengths and font lists, on the plain theme `b`. Each block below starts
 * from the project as the fixture made it; all of them share one fixture.
 *
 * @position api/theme-edit — tests
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {
  familiesOf,
  normalizeEntry,
  normalValueText,
  withoutDebris,
} from './_check.mjs';
import {folderIsEmpty} from './_settings.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {readSetLine, splitCommand, vetSuggestions} from './_vet.mjs';
import {AstryxError} from '../error.mjs';
import {P} from './_tables.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  allowedLine,
  coversTyped,
  escapesMeant,
  readsTyped,
} from './_normal.mjs';
import {familyListMeant} from './_css.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** A copy of the project as the fixture made it, node_modules aside. */
let fixtureCopy = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-entries-asks-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
  fixtureCopy = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-theme-entries-asks-copy-'),
  );
  for (const entry of fs.readdirSync(cwd))
    if (entry !== 'node_modules')
      fs.cpSync(path.join(cwd, entry), path.join(fixtureCopy, entry), {
        recursive: true,
      });
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
  if (fixtureCopy) fs.rmSync(fixtureCopy, {recursive: true, force: true});
});

/**
 * Put the project back as the fixture made it, for a block that makes or
 * changes themes: earlier blocks' themes, app copies and files go.
 */
function resetProject() {
  for (const entry of fs.readdirSync(cwd))
    if (entry !== 'node_modules')
      fs.rmSync(path.join(cwd, entry), {recursive: true, force: true});
  for (const entry of fs.readdirSync(fixtureCopy))
    fs.cpSync(path.join(fixtureCopy, entry), path.join(cwd, entry), {
      recursive: true,
    });
}

// The sixty-fourth pass: the entry normalizer follows through. Quotes only
// delimit (a curly quote inside a quoted CSS string is kept), JSON and paste
// debris is read as the value, a font stack is read as families, flags are
// cleaned like values, a saved dial value is offered cleaned, a theme folder of
// empty folders is empty, and a mistyped theme name keeps the command.
describe('entry normalizer follows through', () => {
  beforeAll(resetProject);

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
      // A second declaration it drops is named apart (`dropped`).
      const {thing: gotThing, value: gotValue} = normalizeEntry(thing, value);
      expect({thing: gotThing, value: gotValue}).toEqual({thing: t, value: v});
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
        {
          thing: '--color-accent',
          value: '\u201C#e11d48\u201D',
          source: 'token',
        },
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

  describe('(1): a saved dial value is offered cleaned', () => {
    // A dial word saved in other letters or with spaces around it is that
    // word (the one case rule), so it is read, not refused.
    it.each([' pill', 'Pill', 'pill ', 'pill\u00A0'])(
      '%j is read as pill',
      async raw => {
        await themeEditSet('b', 'corners', 'pill', {cwd});
        const kept = fs.readFileSync(file(), 'utf8');
        fs.writeFileSync(file(), kept.replace('"pill"', JSON.stringify(raw)));
        try {
          const r = await themeEditShow('b', {cwd});
          expect(r.data.theme).toBe('b');
        } finally {
          fs.writeFileSync(file(), kept);
        }
      },
      240_000,
    );
    it.each(['corners: pill', '\u201Cpill\u201D', '"pill"'])(
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

  describe('(2): a theme folder of empty folders is empty', () => {
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

  describe('(3): a mistyped theme name keeps the command', () => {
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
        expect(names(err)).not.toContainEqual(
          expect.stringMatching(/ show b$/),
        );
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

  describe('a saved font family in French quotes', () => {
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
});

// The fifty-first pass over `astryx experimental theme editor`: one entry
// normalizer reads every setting the same way, typed or saved. Each value type
// is set in each mangled form and must land as the clean value; a saved value
// with invisible spaces is named with the clean one.
describe('entry normalizer saved value', () => {
  beforeAll(resetProject);

  /** @param {() => Promise<unknown>} run */
  async function refusal(run) {
    try {
      await run();
    } catch (error) {
      return /** @type {any} */ (error);
    }
    throw new Error('expected a refusal');
  }

  const file = () => path.join(cwd, 'themes/b/b.settings.json');
  const saved = (/** @type {string} */ thing) =>
    JSON.parse(fs.readFileSync(file(), 'utf8')).settings.find(
      (/** @type {any} */ x) => x.thing === thing && !x.on,
    )?.value;
  const names = (/** @type {any} */ e) =>
    (e.suggestions ?? []).map((/** @type {any} */ x) => x.name);

  const NBSP = '\u00A0';
  const THIN = '\u2009';
  const ZW = '\u200B';

  /** Each value type: thing, a clean value, and how it lands. */
  const TYPES = [
    ['--color-accent', 'rgb(225 29 72)', 'rgb(225 29 72)'],
    ['--font-family-body', 'Open Sans, serif', 'Open Sans, serif'],
    ['--radius-element', '6px', '6px'],
    ['accent', '#e11d48', '#e11d48'],
    ['corners', 'pill', 'pill'],
    ['text-size', '18', '18'],
  ];

  /** Manglings of a (thing, value) into what set receives. */
  const MANGLE = {
    nbsp: (/** @type {string} */ t, /** @type {string} */ v) => [
      t,
      v.replace(/ /g, NBSP),
    ],
    thin: (t, v) => [t, v.replace(/ /g, THIN)],
    zeroWidth: (t, v) => [t, `${v}${ZW}`],
    colonSplit: (t, v) => [`${t}:`, v],
    colonWhole: (t, v) => [`${t}: ${v}`, ''],
    colonTight: (t, v) => [`${t}:${v}`, ''],
    equals: (t, v) => [`${t}=${v}`, ''],
    pastedSemicolon: (t, v) => [`${t}: ${v};`, ''],
    pastedImportant: (t, v) => [`${t}:`, `${v} !important`],
  };

  describe('one entry normalizer: every value type × every mangling', () => {
    for (const [thing, value, want] of TYPES)
      for (const [how, mangle] of Object.entries(MANGLE))
        it(`${thing} ${how}`, async () => {
          const [t, v] = /** @type {(a: string, b: string) => string[]} */ (
            mangle
          )(thing, value);
          await themeEditSet('b', t, v, {cwd});
          expect(saved(thing)).toBe(want);
        }, 240_000);
  });

  describe('thing-name repair', () => {
    it.each([
      ['\u2014color-accent', '--color-accent'],
      ['\u2013color-accent', '--color-accent'],
      ['var(--color-accent)', '--color-accent'],
    ])(
      '%j is %s',
      async (typed, thing) => {
        expect(normalizeEntry(typed, 'red').thing).toBe(thing);
        await themeEditSet('b', typed, '#123456', {cwd});
        expect(saved(thing)).toBe('#123456');
      },
      240_000,
    );

    it('a token without its dashes is offered with them', async () => {
      const err = await refusal(() =>
        themeEditSet('b', 'color-accent', '#e11d48', {cwd}),
      );
      expect(names(err)[0]).toMatch(/ set b --color-accent '#e11d48'$/);
    });

    it('the CLI splits a declaration pasted as one argument, for a dial too', async () => {
      const r = await runCli(
        [
          '--json',
          'experimental',
          'theme',
          'editor',
          'set',
          'b',
          'accent: #2563eb',
        ],
        cwd,
      );
      expect(r.status, r.stdout).toBe(0);
      expect(saved('accent')).toBe('#2563eb');
    }, 240_000);
  });

  describe('suggestions from the setting’s own suggester', () => {
    it.each([
      ['text-size', '14pt', / set b text-size 18\.67$/],
      ['type', 'large', / set b text-size large$/],
      ['type', '18px', / set b text-size 18$/],
    ])('%s %s', async (thing, value, want) => {
      const err = await refusal(() => themeEditSet('b', thing, value, {cwd}));
      expect(names(err).join('\n')).toMatch(new RegExp(want.source, 'm'));
      expect(names(err).join('\n')).not.toMatch(/ corners /);
    });

    it('mode with a word it does not take lists the modes', async () => {
      const err = await refusal(() =>
        themeEditSet('b', 'mode', 'large', {cwd}),
      );
      expect(names(err)).toContainEqual(
        expect.stringMatching(/ set b mode both$/),
      );
    });
  });

  describe('saved values read the same way', () => {
    it.each([
      ['--color-accent', `rgb(225${NBSP}29${NBSP}72)`, 'rgb(225 29 72)'],
      ['--font-family-body', `Open${ZW} Sans`, 'Open Sans'],
    ])(
      '%s with invisible spaces is named, with the clean value',
      async (thing, raw, clean) => {
        await themeEditSet('b', thing, clean, {cwd});
        const kept = fs.readFileSync(file(), 'utf8');
        const data = JSON.parse(kept);
        for (const x of data.settings)
          if (x.thing === thing && !x.on) x.value = raw;
        fs.writeFileSync(file(), JSON.stringify(data));
        try {
          const err = await refusal(() => themeEditShow('b', {cwd}));
          expect(err.message).toContain('no-break, thin or zero-width space');
          expect(names(err)).toContainEqual(
            expect.stringMatching(
              new RegExp(
                ` set b ${thing} '${clean.replace(/[()]/g, '\\$&')}'$`,
              ),
            ),
          );
        } finally {
          fs.writeFileSync(file(), kept);
        }
      },
      240_000,
    );

    it('a saved size token the editor refuses suggests from the value, not 6px', async () => {
      const kept = fs.readFileSync(file(), 'utf8');
      const data = JSON.parse(kept);
      data.settings.push({
        thing: '--text-body-size',
        value: '18',
        source: 'token',
      });
      fs.writeFileSync(file(), JSON.stringify(data));
      try {
        const err = await refusal(() => themeEditShow('b', {cwd}));
        expect(names(err)).toContainEqual(
          expect.stringMatching(/ set b --text-body-size 18px$/),
        );
      } finally {
        fs.writeFileSync(file(), kept);
      }
    }, 240_000);
  });
});

// The fifty-seventh pass: a saved entry written in a form the input cleanup
// repairs (`Corners`, `var(--radius-element)`, `backgroundColor`, an em dash)
// is removed by the undo its refusal suggests, and only that entry: a valid
// neighbor the cleaned name also matches stays.
describe('saved entry written form', () => {
  beforeAll(resetProject);

  const file = () => path.join(cwd, 'themes/b/b.settings.json');

  /** @param {() => Promise<unknown>} run */
  async function refusal(run) {
    try {
      await run();
    } catch (error) {
      return /** @type {any} */ (error);
    }
    throw new Error('expected a refusal');
  }

  /**
   * Run a suggested `undo b <thing> [--flag value]…` through the API.
   * @param {string} line
   */
  function undoFrom(line) {
    const words = [];
    const re = /'((?:[^']|'\\'')*)'|(\S+)/g;
    let m;
    const rest = line.slice(line.indexOf(' undo b ') + ' undo b '.length);
    while ((m = re.exec(rest)))
      words.push(m[1] != null ? m[1].replace(/'\\''/g, "'") : m[2]);
    const [thing, ...flags] = words;
    /** @type {Record<string, string>} */
    const opts = {};
    for (let i = 0; i < flags.length; i += 2)
      opts[flags[i].replace(/^--/, '')] = flags[i + 1];
    return themeEditUndo('b', {cwd, thing, ...opts});
  }

  const CASES = [
    [
      {thing: '--color-accent:', value: '#e11d48', source: 'token'},
      {thing: '--color-accent', value: '#2563eb', source: 'token'},
    ],
    [
      {thing: 'accent:', value: '#e11d48', source: 'dial'},
      {thing: 'accent', value: '#2563eb', source: 'dial'},
    ],
    // [the bad saved entry, a valid neighbor the cleaned name matches]
    [
      {thing: 'Corners', value: 'pill2', source: 'dial'},
      {thing: 'corners', value: 'pill', source: 'dial'},
    ],
    [
      {thing: 'var(--radius-element)', value: '3px', source: 'token'},
      {thing: '--radius-element', value: '6px', source: 'token'},
    ],
    [
      {thing: '\u2014radius-element', value: '3px', source: 'token'},
      {thing: '--radius-element', value: '6px', source: 'token'},
    ],
    [
      {
        thing: 'backgroundColor',
        value: '#fff',
        source: 'property',
        on: 'button',
      },
      {
        thing: 'background-color',
        value: '#000',
        source: 'property',
        on: 'button',
      },
    ],
  ];

  describe('the suggested undo removes the exact saved entry', () => {
    it.each(CASES)(
      '%j',
      async (bad, good) => {
        const kept = fs.readFileSync(file(), 'utf8');
        const data = JSON.parse(kept);
        data.settings.push(good, bad);
        fs.writeFileSync(file(), JSON.stringify(data));
        try {
          const err = await refusal(() => themeEditShow('b', {cwd}));
          const line = (err.suggestions ?? [])
            .map((/** @type {any} */ x) => x.name)
            .find((/** @type {string} */ r) => / undo b /.test(r));
          expect(line, err.message).toBeTruthy();
          await undoFrom(line);
          const after = JSON.parse(fs.readFileSync(file(), 'utf8')).settings;
          // The bad entry is gone; the valid neighbor stays.
          expect(after).not.toContainEqual(bad);
          expect(after).toContainEqual(good);
          // And the theme takes commands again.
          await themeEditShow('b', {cwd});
        } finally {
          fs.writeFileSync(file(), kept);
        }
      },
      240_000,
    );
  });

  describe('a saved value with a thin space', () => {
    it('offers a set line only when set takes the clean value', async () => {
      const kept = fs.readFileSync(file(), 'utf8');
      const data = JSON.parse(kept);
      data.settings.push({
        thing: '--radius-element',
        value: '1\u20092px',
        source: 'token',
      });
      fs.writeFileSync(file(), JSON.stringify(data));
      try {
        const err = await refusal(() => themeEditShow('b', {cwd}));
        for (const r of /** @type {string[]} */ (err.suggestions ?? [])
          .map((/** @type {any} */ x) => x.name)
          .filter(x => / set b /.test(x)))
          expect(r).not.toMatch(/'1 2px'/);
        const undo = err.suggestions
          .map((/** @type {any} */ x) => x.name)
          .find((/** @type {string} */ r) => / undo b /.test(r));
        await undoFrom(undo);
        await themeEditShow('b', {cwd});
      } finally {
        fs.writeFileSync(file(), kept);
      }
    }, 240_000);
  });

  describe('N62: any run of dash-like characters starts a token', () => {
    it.each([
      '\u2014-color-accent',
      '\u2011\u2011color-accent',
      '\u2212color-accent',
      '\uFF0D\uFF0Dcolor-accent',
      '\u2013color-accent',
    ])(
      '%j',
      async typed => {
        expect(normalizeEntry(typed, '#123456').thing).toBe('--color-accent');
        await themeEditSet('b', typed, '#123456', {cwd});
        const saved = JSON.parse(fs.readFileSync(file(), 'utf8')).settings;
        expect(saved).toContainEqual(
          expect.objectContaining({thing: '--color-accent', value: '#123456'}),
        );
      },
      240_000,
    );

    it('plain hyphens are left as typed', () => {
      expect(normalizeEntry('---x', 'a').thing).toBe('---x');
    });
  });

  describe('N59/N63: quotes', () => {
    it.each([
      ['\u201COpen Sans\u201D, serif', '"Open Sans", serif'],
      ['\u2018Inter\u2019', "'Inter'"],
      ['"a\u00A0b" x\u00A0y', '"a\u00A0b" x y'],
    ])('%j reads as %j', (typed, want) => {
      expect(normalValueText(typed)).toBe(want);
    });

    it('a font family in curly quotes is saved with straight ones', async () => {
      await themeEditSet(
        'b',
        '--font-family-body',
        '\u201COpen Sans\u201D, serif',
        {cwd},
      );
      const saved = JSON.parse(fs.readFileSync(file(), 'utf8')).settings.find(
        (/** @type {any} */ x) => x.thing === '--font-family-body',
      );
      expect(saved.value).not.toMatch(/[\u201C\u201D]/);
      expect(saved.value).toContain('Open Sans');
    }, 240_000);
  });
});

// The twenty-sixth pass over `astryx experimental theme editor`: every `set` a
// refusal suggests is checked as `set` checks it, and the suggestions carry
// what was asked (a weight, a size, a number, a dial's own words) instead of a
// fixed example.
describe('refusal suggests checked checks', () => {
  beforeAll(resetProject);

  /** @param {string[]} run */
  const bare = run => run.map(r => r.replace(`${P} `, ''));

  /**
   * Each suggested `set` of a refusal, run: none may be refused.
   * @param {string[]} run
   */
  async function runsAll(run) {
    for (const line of run) {
      const read = readSetLine(line, 'b');
      if (!read) continue;
      await themeEditSet('b', read.thing, read.value, {cwd, ...read.flags});
    }
  }

  describe('suggestions are checked', () => {
    it('reads a printed set line back into its setting', () => {
      expect(splitCommand(`a 'b c' 'it'\\''s' "d e"`)).toEqual([
        'a',
        'b c',
        "it's",
        'd e',
      ]);
      expect(
        readSetLine(`${P} set b font-size 15px --on card --when level:1`, 'b'),
      ).toEqual({
        thing: 'font-size',
        value: '15px',
        flags: {on: 'card', when: 'level:1'},
      });
      // Another command, another theme, a placeholder: not read.
      expect(readSetLine(`${P} how corners`, 'b')).toBeNull();
      expect(readSetLine(`${P} set c corners pill`, 'b')).toBeNull();
      expect(readSetLine(`${P} set b accent <a color>`, 'b')).toBeNull();
    });

    it('drops a suggested set that set would refuse, and keeps the rest', async () => {
      const e = new AstryxError(
        'x',
        [
          {name: `${P} set b corners 1.25`, reason: 'do this instead'},
          {name: `${P} set b corners pill`, reason: 'do this instead'},
          {name: `${P} how corners`, reason: 'do this instead'},
        ],
        'ERR_THEME_BAD_VALUE',
      );
      // The theme as loaded, through a real refusal's path.
      const r = await refusal(() => themeEditSet('b', 'corners', 'x9', {cwd}));
      expect(r.run.join('\n')).not.toMatch(/corners x9/);
      const {context} = await import('./_context.mjs');
      const {loadTheme} = await import('./_settings.mjs');
      const ctx = await context(cwd);
      const out = vetSuggestions(e, ctx, 'b', loadTheme(cwd, 'b', {}));
      // A refused line is followed through its own refusal's repair (a bare
      // number takes its unit), and offered as the line that works.
      expect(bare(out.suggestions.map(s => s.name))).toEqual([
        'set b corners 1.25px',
        'set b corners pill',
        'how corners',
      ]);
    }, 120_000);
  });

  describe('the cases', () => {
    it('N17: a var() fallback inside a color function must be a color', async () => {
      const mix = await refusal(() =>
        themeEditSet(
          'b',
          'background-color',
          'color-mix(in srgb, var(--nope, 12px), red)',
          {cwd, on: 'card'},
        ),
      );
      expect(mix.message).toMatch(/"12px", a var\(\) fallback/);
      await refusal(() =>
        themeEditSet(
          'b',
          'border-color',
          'color-mix(in srgb, red, var(--nope, 1px))',
          {cwd, on: 'card'},
        ),
      );
      // A color fallback, and a channel fallback, are taken.
      await themeEditSet(
        'b',
        'background-color',
        'color-mix(in srgb, var(--nope, blue), red)',
        {cwd, on: 'card'},
      );
      await themeEditSet('b', 'border-color', 'rgb(var(--nope, 0) 0 0)', {
        cwd,
        on: 'card',
      });
    }, 240_000);

    it('N18: an invalid color is never echoed into the token suggestion', async () => {
      for (const v of ['banana', '12px', 'var(--nope, 12px)']) {
        const r = await refusal(() =>
          themeEditSet('b', 'color', v, {cwd, on: 'text'}),
        );
        expect(r.run.join('\n')).not.toContain(v);
        // Nothing readable as a color: no stock color, only how.
        expect(r.run.join('\n')).not.toMatch(/ set b --color-text-primary /);
        await runsAll(r.run);
      }
      const ok = await refusal(() =>
        themeEditSet('b', 'color', 'red', {cwd, on: 'text'}),
      );
      expect(bare(ok.run)[0]).toBe('set b --color-text-primary red --on text');
    }, 240_000);

    it('N19: headings --on heading offers the dial and the asked weight or tracking', async () => {
      const light = await refusal(() =>
        themeEditSet('b', 'headings', 'light', {cwd, on: 'heading'}),
      );
      expect(bare(light.run)).toEqual([
        'set b headings light',
        'set b font-weight 300 --on heading --when level:1',
      ]);
      const tight = await refusal(() =>
        themeEditSet('b', 'headings', 'tight', {cwd, on: 'heading'}),
      );
      expect(bare(tight.run)[1]).toBe(
        'set b letter-spacing -0.02em --on heading --when level:1',
      );
      const odd = await refusal(() =>
        themeEditSet('b', 'headings', 'zzz', {cwd, on: 'heading'}),
      );
      expect(odd.run.join('\n')).not.toMatch(/font-weight 700/);
      await runsAll([...light.run, ...tight.run]);
    }, 240_000);

    it('N20: number tokens carry the number meant', async () => {
      const cases = /** @type {Array<[string, string, string]>} */ ([
        ['--font-weight-bold', '700px', '700'],
        ['--font-weight-bold', '1001', '1000'],
        ['--font-weight-bold', '7OO', '700'],
        ['--text-body-leading', '1,5', '1.5'],
        ['--spacing-4', 'calc(1rem+2px)', "'calc(1rem + 2px)'"],
      ]);
      for (const [token, typed, meant] of cases) {
        const r = await refusal(() => themeEditSet('b', token, typed, {cwd}));
        expect(bare(r.run)[0]).toBe(`set b ${token} ${meant}`);
      }
    }, 240_000);

    it('N21: text-size --on a part carries the asked size', async () => {
      for (const [v, px] of [
        ['large', '15px'],
        ['20', '20px'],
        ['32', '32px'],
      ]) {
        const r = await refusal(() =>
          themeEditSet('b', 'text-size', v, {cwd, on: 'card'}),
        );
        expect(bare(r.run)[0]).toBe(`set b font-size ${px} --on card`);
      }
      const step = await refusal(() =>
        themeEditSet('b', 'text-size', 'more', {cwd, on: 'card'}),
      );
      expect(step.run.join('\n')).not.toMatch(/font-size 13px/);
    }, 240_000);

    it("N22: a word dial given a number suggests that dial's own words", async () => {
      const ratio = await refusal(() =>
        themeEditSet('b', 'type', '1.3', {cwd}),
      );
      expect(bare(ratio.run)[0]).toBe('set b type editorial');
      // A number no table of the dial reads gets how, never a stock word.
      for (const dial of ['type', 'surfaces', 'buttons']) {
        const r = await refusal(() => themeEditSet('b', dial, '16', {cwd}));
        expect(r.run.join('\n')).not.toMatch(/ corners /);
        expect(r.run.join('\n')).not.toMatch(new RegExp(` set b ${dial} `));
      }
      // A size with a unit on buttons is still the corners on the button.
      const px = await refusal(() =>
        themeEditSet('b', 'buttons', '4px', {cwd}),
      );
      expect(bare(px.run)[0]).toBe('set b corners 4px --on button');
    }, 240_000);

    it('how: more washed out colors is less vibrancy', async () => {
      await themeEditNew('w', {cwd});
      await themeEditSet('w', 'accent', '#0d9488', {cwd});
      const top = async (/** @type {string} */ q) =>
        (
          await themeEditHow(q, {cwd, theme: 'w'})
        ).data.results[0].commands[0].replace(/^.* editor /, '');
      expect(await top('more washed out colors')).toBe('set w vibrancy less');
      expect(await top('more muted colors')).toBe('set w vibrancy less');
      expect(await top('more colorful')).toBe('set w vibrancy more');
    }, 240_000);
  });
});

// Two rules every repair follows, over a corpus of pasted shapes: a suggested
// set line carries the value typed (or saved), cleaned, never a stock value the
// input did not hold; and a label the editor does not read as the setting's own
// name is refused with what it means, never dropped.
describe('rules repair follows corpus', () => {
  beforeAll(resetProject);

  /** The gate for a whole typed value with no setting named. @param {string} offered @param {string} typed */
  const offersTyped = (offered, typed) => allowedLine({offered, typed});

  /**
   * Whether the values a refusal offers for one setting carry what was typed.
   * @param {string[]} offered @param {string} typed
   */
  const offersAllTyped = (offered, typed) => {
    const reads = offered.map(o => readsTyped({offered: o, typed}));
    if (reads.includes(false)) return false;
    return reads.every(r => r === true) || coversTyped(reads, typed);
  };

  /**
   * Mappings the editor documents: a word that means another value (night is
   * dark, lighter is light), so the line need not repeat the word typed.
   */
  const MAPPED = [/ --mode (light|dark)$/];

  /** The value a suggested line sets for `thing`, or null. @param {string} line @param {string} thing */
  const valueSet = (line, thing) => {
    const m = new RegExp(
      ` set b (?:'([^']+)'|(\\S+)) (?:'((?:[^']|'\\\\'')*)'|(\\S+))`,
    ).exec(line);
    if (!m) return null;
    const t = (m[1] ?? m[2]).replace(/^-+/, '');
    if (t !== thing.replace(/^-+/, '')) return null;
    return m[3] ?? m[4];
  };

  /** Every pasted shape a repair meets: typed with `set`. */
  const TYPED =
    /** @type {Array<[string, string, Record<string, string>?]>} */ ([
      ['accent', 'dark: #2563eb'],
      ['accent', '\\#e11d48'],
      ['accent', 'notacolor'],
      ['accent', '"#e11d48",'],
      ['accent', 'textSize: 18'],
      ['--color-accent', 'dark=#2563eb'],
      ['--color-accent', '{"dark": "#2563eb"}'],
      ['--color-accent', 'light-dark(red / blue)'],
      ['--color-accent', 'light-dark(#e11d48,)'],
      ['--color-accent', '\\#e11d48'],
      ['--text-supporting-size', 'banana'],
      ['--text-supporting-size', '16 px'],
      ['corners', 'mobile: pill'],
      ['corners', 'banana'],
      ['corners', 'Pill,'],
      ['text-size', 'phone: 14'],
      ['text-size', 'huge'],
      ['text-size', '{"value": 18, "unit": "px"}'],
      ['font', 'Georgia serif'],
      ['font', 'Inter, sans serif'],
      ['font', 'Font: Georgia'],
      ['font', 'https://fonts.example/x.woff2'],
      ['headings', 'lighter'],
      ['headings', 'bold tight'],
      ['headings', 'h1: bold'],
      ['headings', 'nope'],
      ['surfaces', 'dark: raised'],
      ['vibrancy', '0.5'],
    ]);

  describe('a repair carries the value typed, never a stock value', () => {
    it.each(TYPED)('set %s %j', async (thing, value, opts) => {
      /** @type {any} */
      let err = null;
      try {
        await themeEditSet('b', thing, value, {cwd, ...(opts ?? {})});
      } catch (e) {
        err = e;
      }
      // The values offered for the setting, taken together, carry what was
      // typed (one value may carry part when the others carry the rest).
      const values = (err?.suggestions ?? [])
        .filter((/** @type {any} */ s) => !MAPPED.some(re => re.test(s.name)))
        .map((/** @type {any} */ s) => valueSet(s.name, thing))
        .filter((/** @type {any} */ v) => v != null);
      if (values.length)
        expect(offersAllTyped(values, value), `${values} for ${value}`).toBe(
          true,
        );
    });

    it.each([
      ['--color-accent', 'light: red; dark: blue', 'token'],
      ['--color-accent', '{"light":"red","dark":"blue"}', 'token'],
      ['text-size', 'phone: 14', 'dial'],
      ['corners', 'accent: pill', 'dial'],
      ['font', '\\"Inter\\", serif', 'dial'],
      ['accent', 'notacolor', 'dial'],
    ])(
      'a saved %s %j',
      async (thing, value, source) => {
        const slug = `s${Math.abs([...`${thing}${value}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`;
        await themeEditNew(slug, {cwd});
        const file = path.join(cwd, 'themes', slug, `${slug}.settings.json`);
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        j.settings = [{thing, value, source}];
        fs.writeFileSync(file, JSON.stringify(j, null, 2));
        /** @type {any} */
        let err = null;
        try {
          await themeEditShow(slug, {cwd});
        } catch (e) {
          err = e;
        }
        // The set lines for the setting carry the value typed, together (a
        // light and a dark half take a line each, as the gate allows).
        /** @type {string[]} */
        const values = [];
        for (const s of err?.suggestions ?? []) {
          const m = new RegExp(
            ` set ${slug} (?:'([^']+)'|(\\S+)) (?:'((?:[^']|'\\\\'')*)'|(\\S+))`,
          ).exec(s.name);
          if (
            !m ||
            (m[1] ?? m[2]).replace(/^-+/, '') !== thing.replace(/^-+/, '')
          )
            continue;
          values.push(m[3] ?? m[4]);
        }
        if (values.length)
          expect(offersAllTyped(values, value), values.join(' | ')).toBe(true);
      },
      240_000,
    );
  });

  describe('a label is read, or refused with what it means', () => {
    it.each([
      ['accent', 'hover: #16a34a', /is a state/],
      ['corners', 'mobile: pill', /kind of screen/],
      ['corners', 'button: pill', /is a part.*--on button/],
      ['--color-accent', 'dark: #2563eb', /--mode dark/],
      ['surfaces', 'dark: raised', /same in light and dark/],
      ['accent', 'textSize: 18', /labeled text-size/],
      ['accent', '"corners": "pill"', /labeled corners/],
      ['font', 'accent: red', /labeled accent/],
      ['corners', 'gizmo: pill', /not a name the editor reads/],
      ['headings', 'h1: bold', /one heading level/],
    ])('%s %j is refused', async (thing, value, why) => {
      /** @type {any} */
      let err = null;
      try {
        await themeEditSet('b', thing, value, {cwd});
      } catch (e) {
        err = e;
      }
      expect(err?.message, `${thing} ${value}`).toMatch(why);
    });

    it("reads the setting's own label as the value", async () => {
      const r = await themeEditSet('b', 'font', 'fontFamily: Inter, serif', {
        cwd,
      });
      expect(r.data.setting.value).toBe('Inter, serif');
    });
  });

  describe('the stock values a repair never puts in', () => {
    it.each([
      ['#7c3aed', 'notacolor', false],
      ['#1f2937', '{"dark": "#2563eb"}', false],
      ['inter', 'Open\\ Sans', false],
      ['#e11d48', '\\#e11d48', true],
      ['light-dark(red, blue)', 'red / blue', true],
      ['Georgia, serif', 'Georgia serif', true],
    ])('%j for %j: %s', (offered, typed, ok) => {
      expect(offersTyped(offered, typed)).toBe(ok);
    });
  });

  describe('values typed in other notations', () => {
    it.each([
      ['--color-accent', 'LIGHT-DARK(red, blue)', 'light-dark(red, blue)'],
      ['--color-accent', '{"$value": "#e11d48"}', '#e11d48'],
      ['--color-accent', '["#e11d48"]', '#e11d48'],
      ['font', '["Open Sans","serif"]', '"Open Sans", serif'],
      ['text-size', '{"value": 18, "unit": "px"}', '18px'],
      ['accent', '\\#e11d48', '#e11d48'],
      ['content', '"\\u2022"', '"\\2022 "'],
      ['content', '"Step\\t1"', '"Step\\9 1"'],
    ])('%s %j is %j', (thing, value, want) => {
      expect(escapesMeant(thing, value)).toBe(want);
    });

    it('takes a size multiplied by a variable with a number fallback', async () => {
      await themeEditSet(
        'b',
        '--text-supporting-size',
        'calc(0.75rem * var(--x, 1))',
        {cwd},
      );
    });

    it('offers a light-dark() written with another separator, with a comma', async () => {
      let err = /** @type {any} */ (null);
      try {
        await themeEditSet('b', '--color-accent', 'light-dark(red / blue)', {
          cwd,
        });
      } catch (e) {
        err = e;
      }
      expect(err.suggestions[0].name).toMatch(/'light-dark\(red, blue\)'$/);
    });

    it('offers the comma a font list is missing before its generic family', async () => {
      let err = /** @type {any} */ (null);
      try {
        await themeEditSet('b', 'font', 'Georgia serif', {cwd});
      } catch (e) {
        err = e;
      }
      expect(err.suggestions[0].name).toMatch(/font 'Georgia, serif'$/);
    });

    it('names a second pasted declaration it did not set', async () => {
      const r = await themeEditSet('b', 'accent', '#e11d48; corners: pill', {
        cwd,
      });
      expect(r.data.notes.join(' ')).toMatch(
        /corners: pill.*set b corners pill/,
      );
    });
  });
});

// The input reader over more shapes: several parts named in one --on, a flag's
// label after the value or a flag inside it, background layers with one too
// many or an empty one, numbers given as font families, words on part
// properties, and negations. A line offered names what was typed, never a group
// of other parts, a reset or a guessed unit.
describe('input reader shapes several', () => {
  beforeAll(resetProject);

  /** [thing, value, flags, lines that must be offered, a pattern no line matches] */
  const CASES =
    /** @type {Array<[string, string, Record<string, string>, RegExp[], RegExp | null]>} */ ([
      [
        'padding',
        '8px',
        {on: 'button, text-input'},
        [
          / set b padding 8px --on button$/,
          / set b padding 8px --on text-input$/,
        ],
        /--on inputs/,
      ],
      [
        'padding',
        '8px',
        {on: 'button,text-input'},
        [/ --on button$/, / --on text-input$/],
        /--on inputs/,
      ],
      [
        'padding',
        '8px',
        {on: 'button/text-input'},
        [/ --on button$/, / --on text-input$/],
        /--on inputs/,
      ],
      [
        'padding',
        '8px',
        {on: 'button and text-input'},
        [/ --on button$/, / --on text-input$/],
        /--on inputs/,
      ],
      [
        'padding',
        '8px',
        {on: 'button text-input'},
        [/ --on button$/, / --on text-input$/],
        /--on inputs/,
      ],
      [
        'padding',
        '8px',
        {on: 'card, dialog'},
        [/ --on card$/, / --on dialog$/],
        null,
      ],
      // Words that name one part stay that part.
      [
        'padding',
        '8px',
        {on: 'text inputs'},
        [/ set b padding 8px --on text-input$/],
        /--on inputs/,
      ],
      ['padding', '8px', {on: 'dialog header'}, [/ --on dialog-header$/], null],
      // A flag's label after the value.
      [
        'background',
        'red mode: dark',
        {on: 'button'},
        [/ set b background red --on button --mode dark$/],
        /red-mode/,
      ],
      [
        'background',
        'red state: hover',
        {on: 'button'},
        [/ set b background red --on button --state hover$/],
        /red-state/,
      ],
      [
        'background',
        'red variant: primary',
        {on: 'button'},
        [/ set b background red --on button --when variant:primary$/],
        null,
      ],
      [
        'background',
        'red part: card',
        {on: 'button'},
        [/ set b background red --on card$/],
        null,
      ],
      // Layers with one too many or an empty one: the layers typed, never none.
      [
        'background',
        'url(a.png), red, blue',
        {on: 'button'},
        // A layer left out is part of the value: how, never a subset.
        [/ how background$/],
        / background none|url\(a\.png\), red'/,
      ],
      [
        'background',
        'red,,blue',
        {on: 'button'},
        [/ how background$/],
        / background none|background (red|blue) /,
      ],
      // A reset typed with a typo is that reset, corrected.
      // A typo within the one limit: two letters swapped are one edit; a
      // keyword two edits away is no typo of a four-letter word.
      [
        'display',
        'flxe',
        {on: 'card'},
        [/ set b display flex --on card$/],
        / display flow/,
      ],
      // A typo of a keyword that starts with no- or not- is read as a typo;
      // a real negation is still never given the word it negates.
      [
        'cursor',
        'not-alowed',
        {on: 'button'},
        [/ set b cursor not-allowed --on button$/],
        null,
      ],
      [
        'background-repeat',
        'no-repat',
        {on: 'card'},
        [/ set b background-repeat no-repeat --on card$/],
        null,
      ],
      [
        'cursor',
        'not pointer',
        {on: 'button'},
        [/ how cursor$/],
        / cursor (pointer|not-allowed) /,
      ],
      // A short word two edits from a reset is no typo of it.
      [
        'border-style',
        'line',
        {on: 'card'},
        [/ how border-style$/],
        / border-style none/,
      ],
      [
        'display',
        'nnone',
        {on: 'card'},
        [/ set b display none --on card$/],
        null,
      ],
      [
        'box-shadow',
        'nnone',
        {on: 'card'},
        [/ set b box-shadow none --on card$/],
        null,
      ],
      [
        'text-transform',
        'nnone',
        {on: 'button'},
        [/ set b text-transform none --on button$/],
        null,
      ],
      [
        'font-weight',
        'normall',
        {on: 'button'},
        [/ set b font-weight normal --on button$/],
        null,
      ],
      // A bare number on a shorthand where a length is only a position.
      ['background', '0.5', {on: 'card'}, [/ how background$/], /0\.5px/],
      ['background', '2', {on: 'card'}, [/ how background$/], /2px/],
      // A number or size is no font family.
      ['--font-family-body', '700', {}, [/ how --font-family-body$/], /"700"/],
      [
        '--font-family-heading',
        '16px',
        {},
        [/ how --font-family-heading$/],
        /"16px"/,
      ],
      ['font-family', '700', {on: 'card'}, [/ how font-family$/], /"700"/],
      // A negation never gets the word it negates.
      [
        'corners',
        'not round',
        {},
        [/ set b corners square$/],
        / corners round$/,
      ],
      [
        'corners',
        'rounded-none',
        {},
        [/ set b corners square$/],
        / corners round$/,
      ],
      [
        'corners',
        'unrounded',
        {},
        [/ set b corners square$/],
        / corners round$/,
      ],
      ['corners', 'rounded-full', {}, [/ set b corners pill$/], null],
      ['corners', 'rounded-[12px]', {}, [/ set b corners 12px$/], null],
      ['headings', 'not bold', {}, [/ how headings$/], / headings bold$/],
      ['buttons', 'no caps', {}, [/ how buttons$/], / buttons caps$/],
      ['accent', 'not red', {}, [/ how accent$/], / accent red$/],
      ['accent', 'anything but blue', {}, [/ how accent$/], / accent blue$/],
      // A flag typed inside the value is lifted out.
      [
        'accent',
        'red --mode dark',
        {},
        [/ set b --color-accent red --mode dark$/],
        / set b accent red$/,
      ],
      [
        'padding',
        '4px --state hover',
        {on: 'button'},
        [/ set b padding 4px --on button --state hover$/],
        / padding 4px --on button$/,
      ],
      [
        'corners',
        'pill --on button',
        {},
        [/ set b corners pill --on button$/],
        / corners pill$/,
      ],
      // Words with a documented reading on a part property.
      [
        'content',
        'Hi',
        {on: 'badge'},
        [/ set b content '"Hi"' --on badge$/],
        / content normal/,
      ],
      [
        'font-weight',
        'heavy',
        {on: 'button'},
        [/ set b font-weight 800 --on button$/],
        / font-weight normal/,
      ],
      [
        'text-transform',
        'caps',
        {on: 'button'},
        [/ set b text-transform uppercase --on button$/],
        / text-transform none/,
      ],
      [
        'border-radius',
        'round',
        {on: 'card'},
        [/ set b border-radius 9999px --on card$/],
        null,
      ],
      [
        'opacity',
        'half',
        {on: 'card'},
        [/ set b opacity 0\.5 --on card$/],
        null,
      ],
    ]);

  /** Words on part properties: a line never sets the property's reset. */
  const RESETS = / (0|0px|none|1|auto|normal|initial|unset)( --|$)/;
  const WORDS = [
    'large',
    'bigger',
    'sm',
    'soft',
    'wide',
    'half',
    'round',
    '2 spacing units',
    '2 steps',
  ];
  const PROPS = [
    'padding',
    'margin',
    'gap',
    'border-radius',
    'box-shadow',
    'letter-spacing',
    'opacity',
    'border-width',
    'line-height',
  ];
  const CORPUS = PROPS.flatMap(p =>
    WORDS.map(w => /** @type {[string, string]} */ ([p, w])),
  );

  describe('repairs offer only what was typed', () => {
    it.each(CASES)(
      '%s %s %j offers what was typed',
      async (thing, value, flags, lines, never) => {
        const r = await refusal(() =>
          themeEditSet('b', thing, value, {cwd, ...flags}),
        );
        for (const line of lines)
          expect(
            r.run.some(x => line.test(x)),
            `${line}\n${r.run.join('\n')}`,
          ).toBe(true);
        if (never) for (const x of r.run) expect(x).not.toMatch(never);
      },
      120_000,
    );

    it.each(CORPUS)(
      '%s %s offers no reset it was not given',
      async (prop, word) => {
        /** @type {any} */
        let r;
        try {
          await themeEditSet('b', prop, word, {cwd, on: 'card'});
          return;
        } catch (e) {
          r = e;
        }
        for (const x of (r.suggestions ?? []).map(
          (/** @type {any} */ y) => y.name,
        ))
          if (x.includes(` set b ${prop} `)) expect(x).not.toMatch(RESETS);
      },
      120_000,
    );

    it('an undo naming several parts offers one undo per part', async () => {
      await themeEditSet('b', 'padding', '8px', {cwd, on: 'button'});
      const r = await refusal(() =>
        themeEditUndo('b', {cwd, thing: 'padding', on: 'button, text-input'}),
      );
      expect(r.message).not.toMatch(/the part is inputs/);
      expect(r.run.some(x => / undo b padding --on button$/.test(x))).toBe(
        true,
      );
    }, 120_000);
  });
});

// The input reader over more pasted shapes: labels on part properties and type
// tokens, objects in loose forms, saved pairs and vibrancy, whole quoted font
// stacks, density and dial words, calc() units per operation, a mode word on a
// color dial, escapes, font labels, family separators, size tokens and short
// hex colors. A line offered carries the value typed or a documented reading of
// it, never a stock value.
describe('input reader pasted shapes', () => {
  beforeAll(resetProject);

  /**
   * Refused inputs and what the lines offered must (and must not) hold.
   * [thing, value, flags, first line matches, no line matches]
   */
  const REFUSED =
    /** @type {Array<[string, string, Record<string, any>, RegExp | null, RegExp | null]>} */ ([
      // A state, mode, part or own label on a part property.
      [
        'padding',
        'hover: 4px',
        {on: 'button'},
        / set b padding 4px --on button --state hover$/,
        / set b padding 4px --on button$/,
      ],
      [
        'background-color',
        'hover: red',
        {on: 'button'},
        / set b background-color red --on button --state hover$/,
        null,
      ],
      [
        'background-color',
        'dark: red',
        {on: 'button'},
        / set b background-color red --on button --mode dark$/,
        null,
      ],
      [
        'border-radius',
        'card: 4px',
        {on: 'button'},
        / set b border-radius 4px --on card$/,
        / --on button$/,
      ],
      [
        'color',
        'accent: red',
        {on: 'button'},
        / set b accent red/,
        / set b color red/,
      ],
      // A mode label on a type token.
      [
        '--font-weight-bold',
        'dark: 700',
        {},
        / set b --font-weight-bold 700$/,
        null,
      ],
      [
        '--font-family-body',
        'dark: Georgia',
        {},
        / set b --font-family-body Georgia$/,
        null,
      ],
      // Objects in loose forms.
      [
        "{'accent'",
        "'#e11d48','corners':'pill'}",
        {},
        / set b accent '#e11d48'$/,
        /7c3aed/,
      ],
      [
        '"accent"',
        '"#e11d48", "corners": "pill"',
        {},
        / set b accent '#e11d48'$/,
        /7c3aed/,
      ],
      // Density and dial words: the direction typed, or how.
      ['density', 'roomy', {}, / set b spacing roomy$/, /compact/],
      ['density', 'airy', {}, / set b spacing roomy$/, /compact/],
      ['corners', 'banana', {}, / how corners$/, /corners medium/],
      ['spacing', 'qqqq', {}, / how spacing$/, /spacing roomy/],
      // A calc() whose units do not combine.
      [
        '--radius-element',
        'calc(var(--a, 8) + 2px * var(--b, 1))',
        {},
        null,
        null,
      ],
      ['--radius-element', 'calc(0.5rem * var(--r, 1px))', {}, null, null],
      [
        '--radius-element',
        'calc(var(--a, 1px) * var(--b, 1px))',
        {},
        null,
        null,
      ],
      ['--radius-element', 'calc(8 + 2px)', {}, null, null],
      // A night or day mode on a color dial keeps the one mode.
      [
        'accent',
        'red',
        {mode: 'night'},
        / set b --color-accent red --mode dark$/,
        / set b accent red$/,
      ],
      [
        'accent',
        'red',
        {mode: 'day'},
        / set b --color-accent red --mode light$/,
        / set b accent red$/,
      ],
      // Another setting's label on the font: that setting, never a font.
      ['font', 'accent: red', {}, / set b accent red$/, / set b font red/],
      ['font', 'corners: pill', {}, / set b corners pill$/, / set b font pill/],
      // A size token with nothing readable: how, never its default.
      ['--radius-element', 'banana', {}, / how /, /8px/],
      ['--spacing-4', 'banana', {}, / how /, /1rem/],
      ['--radius-element', 'accent: red', {}, / set b accent red$/, /8px/],
      ['--color-accent', 'text-size: 18', {}, / set b text-size 18$/, null],
      // A whole stack in one pair of quotes, families split by other marks or
      // a comma missing: the list meant.
      [
        '--font-family-body',
        '"Inter, serif"',
        {},
        / set b --font-family-body 'Inter, serif'$/,
        /sans-serif/,
      ],
      [
        '--font-family-body',
        "'Inter, serif'",
        {},
        / set b --font-family-body 'Inter, serif'$/,
        /sans-serif/,
      ],
      [
        '--font-family-body',
        '「Inter, serif」',
        {},
        / set b --font-family-body 'Inter, serif'$/,
        /sans-serif/,
      ],
      ['font', '"Georgia, serif"', {}, / set b font 'Georgia, serif'$/, null],
      [
        'font',
        'Inter, Georgia serif',
        {},
        / set b font 'Inter, Georgia, serif'$/,
        null,
      ],
      [
        'font',
        'Inter, sans-serif monospace',
        {},
        / set b font 'Inter, sans-serif, monospace'$/,
        null,
      ],
      [
        'font',
        'Inter | sans-serif',
        {},
        / set b font 'Inter, sans-serif'$/,
        null,
      ],
      [
        'font',
        'Inter;sans-serif',
        {},
        / set b font 'Inter, sans-serif'$/,
        / font inter$/,
      ],
      ['font', 'georgia serif', {}, / set b font 'georgia, serif'$/, null],
      // A flag's own name as the label: what that flag does, never a part.
      ['accent', 'state: hover', {}, /how 'hover accent'/, null],
      ['corners', 'part: card', {}, /how 'card corners'/, null],
      ['accent', 'variant: primary', {}, /how 'primary accent'/, null],
      ['corners', 'mode: dark', {}, / set b mode dark-only$/, null],
      // A two-word color name, or a hex written as in code.
      // navy is one word of two: no part of a value is offered alone.
      ['accent', 'navy blue', {}, / how accent$/, / accent (navy|blue)$/],
      ['accent', '0xe11d48', {}, / set b accent '#e11d48'$/, null],
      // A hex color one digit short: never a digit made up.
      ['accent', '#e11d4', {}, null, /#e11d44/],
      ['accent', '#abcd1', {}, null, /#abcd11/],
    ]);

  /** Accepted inputs and what is saved. [thing, value, flags, saved] */
  const ACCEPTED =
    /** @type {Array<[string, string, Record<string, any>, RegExp]>} */ ([
      ['background-color', 'background-color: red', {on: 'button'}, /^red$/],
      ['font', 'font: Inter, serif', {}, /^Inter, serif$/],
      ['font', 'Font: Georgia', {}, /georgia/i],
      ['--font-family-body', 'fontFamily: Inter, serif', {}, /^Inter, serif$/],
      ['font', '"Inter\\u0020Tight"', {}, /Inter Tight/],
      ['content', '"\\x2022"', {on: 'badge'}, /\\2022/],
      [
        '--radius-element',
        'calc(var(--a, 8px) + 2px * var(--b, 1))',
        {},
        /calc/,
      ],
      ['accent', '{"color":"#e11d48"}', {}, /^#e11d48$/],
    ]);

  describe('input reader pasted shapes', () => {
    it.each(REFUSED)(
      'refuses %s %s %j with a line that carries it',
      async (thing, value, flags, first, never) => {
        const r = await refusal(() =>
          themeEditSet('b', thing, value, {cwd, ...flags}),
        );
        if (first)
          expect(
            r.run.some(l => first.test(l)),
            r.run.join('\n'),
          ).toBe(true);
        if (never) for (const line of r.run) expect(line).not.toMatch(never);
      },
      120_000,
    );

    it.each(ACCEPTED)(
      'accepts %s %s %j as the value meant',
      async (thing, value, flags, saved) => {
        const done = await themeEditSet('b', thing, value, {cwd, ...flags});
        expect(
          String(/** @type {any} */ (done.data).setting?.value ?? ''),
        ).toMatch(saved);
      },
      120_000,
    );

    it('a saved light and dark pair or a vibrancy with no color offers only lines that work', async () => {
      await themeEditNew('sv', {cwd});
      const file = path.join(cwd, 'themes/sv/sv.settings.json');
      const write = (/** @type {any} */ entry) => {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        j.settings = [entry];
        fs.writeFileSync(file, JSON.stringify(j, null, 2));
        fs.rmSync(path.join(cwd, 'themes/sv/sv.history.json'), {force: true});
      };
      write({thing: '--color-accent', value: 'red / blue', source: 'token'});
      const pair = await refusal(() => themeEditShow('sv', {cwd}));
      expect(pair.run.join('\n')).not.toMatch(/#1f2937/);
      expect(pair.run.join('\n')).toMatch(/light-dark\(red, blue\)/);
      write({thing: 'vibrancy', value: '0.5', source: 'dial'});
      const vib = await refusal(() => themeEditShow('sv', {cwd}));
      expect(vib.run.join('\n')).not.toMatch(/ set sv vibrancy/);
      expect(vib.run[0]).toMatch(/ undo sv vibrancy$/);
    }, 240_000);
    it("a value pasted with a token's label is read as a label, not an option", async () => {
      const ran = await runCli(
        [
          '--json',
          'experimental',
          'theme',
          'editor',
          'set',
          'b',
          'accent',
          '--color-accent: #e11d48',
        ],
        {cwd},
      );
      expect(ran.stdout + ran.stderr).not.toMatch(/unknown option/);
      expect(ran.stdout).toMatch(/set b --color-accent '#e11d48'/);
    }, 120_000);
  });
});

// The twentieth pass over `astryx experimental theme editor`: a bare number on
// a length gets px, a part named by its class or component, what a look dial
// writes read from the build, unknown states, and a sheet that matches the
// build after an undo.
describe('bare number length px', () => {
  beforeAll(resetProject);

  describe('bare number length px', () => {
    it('1: a bare number on a length suggests px, keeping every flag', async () => {
      const r = await refusal(() =>
        themeEditSet('b', 'padding', '4 8', {
          cwd,
          on: 'button',
          state: 'hover',
        }),
      );
      expect(r.run[0]).toMatch(/ padding '4px 8px' --on button --state hover$/);
    });

    it('2: a part named by its class or component names the part', async () => {
      for (const on of ['.astryx-card', 'astryx-card', '<Card>', 'Card']) {
        const r = await refusal(() =>
          themeEditSet('b', 'background', 'red', {cwd, on}),
        );
        expect(r.run[0], on).toMatch(/ background red --on card$/);
      }
    });

    it('3/4: a look dial under an exact property says so, and its undo names the dial', async () => {
      await themeEditSet('b', 'text-transform', 'none', {cwd, on: 'button'});
      const set = await themeEditSet('b', 'buttons', 'caps', {cwd});
      expect(set.data.notes.join(' ')).toMatch(
        /text-transform = none on button is an exact property and wins over buttons/,
      );
      const undo = await themeEditUndo('b', {
        cwd,
        thing: 'text-transform',
        on: 'button',
      });
      expect(/** @type {any} */ (undo.data).now).toMatch(/buttons = caps/);
    }, 240_000);

    it('5: an unknown state maps to the one meant, else names the part', async () => {
      const pressed = await refusal(() =>
        themeEditSet('b', 'background', 'red', {
          cwd,
          on: 'button',
          // (A button's pressed is its aria-pressed state now; "down" is
          // still another word for active.)
          state: 'down',
        }),
      );
      expect(pressed.run[0]).toMatch(/--state active$/);
      const open = await refusal(() =>
        themeEditSet('b', 'background', 'red', {
          cwd,
          on: 'card',
          state: 'open',
        }),
      );
      expect(open.run[0]).toMatch(/ how card$/);
    });

    it('after a change and its undo the sheet carries no banner', async () => {
      await themeEditNew('s', {cwd});
      await themeEditShow('s', {cwd});
      const sheet = path.join(cwd, 'themes/s/sheet.html');
      await themeEditSet('s', 'info', '#0000ff', {cwd});
      expect(fs.readFileSync(sheet, 'utf8')).toMatch(/older than the theme/);
      const r = await themeEditUndo('s', {cwd});
      expect(/** @type {any} */ (r.data).sheetStale).toBeUndefined();
      expect(fs.readFileSync(sheet, 'utf8')).not.toMatch(
        /older than the theme/,
      );
    }, 240_000);
  });
});

// The forty-third pass over `astryx experimental theme editor`: a font list
// missing a comma is offered with the comma put back (never as one escaped
// family), and a font pasted with its property name is the family list it
// names.
describe('font list missing comma', () => {
  beforeAll(resetProject);

  /** @param {() => Promise<unknown>} run */
  async function refusal(run) {
    try {
      await run();
    } catch (error) {
      return /** @type {any} */ (error);
    }
    throw new Error('expected a refusal');
  }

  const css = () => fs.readFileSync(path.join(cwd, 'themes/b/b.css'), 'utf8');

  describe('N43: a font list missing a comma', () => {
    it.each([
      ['"Open Sans" serif', '"Open Sans", serif'],
      ["'Georgia' serif", '"Georgia", serif'],
      ['"A" "B"', '"A", "B"'],
      ['Georgia "Times"', 'Georgia, "Times"'],
    ])('%s reads as %s', (typed, want) => {
      expect(familyListMeant(typed)).toBe(want);
    });

    it('is offered with the comma, never one escaped family, and that line works', async () => {
      const err = await refusal(() =>
        themeEditSet('b', '--font-family-body', '"Open Sans" serif', {cwd}),
      );
      const names = err.suggestions.map((/** @type {any} */ x) => x.name);
      expect(names.join('\n')).not.toContain('\\"');
      const line = names.find((/** @type {string} */ n) =>
        n.includes('--font-family-body'),
      );
      expect(line).toContain('"Open Sans", serif');
      await themeEditSet('b', '--font-family-body', '"Open Sans", serif', {
        cwd,
      });
      expect(css()).toMatch(/--font-family-body: "Open Sans", serif;/);
    }, 240_000);
  });

  describe('N44: a font pasted with its property name', () => {
    it('the dial reads font-family: Georgia, serif; as Georgia, serif', async () => {
      await themeEditSet('b', 'font', 'font-family: Georgia, serif;', {cwd});
      expect(css()).not.toContain('font-family: Georgia"');
      // The heading follows the dial (the body has an exact token above).
      expect(css()).toMatch(/--font-family-heading: Georgia, serif;/);
    }, 240_000);

    it('an exact font token reads it the same way', async () => {
      await themeEditSet(
        'b',
        '--font-family-heading',
        'font-family: "Georgia", serif;',
        {cwd},
      );
      expect(css()).toMatch(/--font-family-heading: "?Georgia"?, serif;/);
      expect(css()).not.toMatch(/"font-family:/);
    }, 240_000);
  });

  describe('a font shorthand pasted', () => {
    it('font: bold 16px Inter reads as its family', async () => {
      await themeEditSet('b', 'font', 'font: bold 16px Inter', {cwd});
      // Body and heading carry exact tokens from above: the dial's own setting.
      const saved = JSON.parse(
        fs.readFileSync(path.join(cwd, 'themes/b/b.settings.json'), 'utf8'),
      ).settings.find((/** @type {any} */ x) => x.thing === 'font' && !x.on);
      expect(String(saved.value).toLowerCase()).toBe('inter');
      expect(css()).not.toMatch(/"font: bold/);
    }, 240_000);
  });

  describe('a var with a fallback', () => {
    it('is accepted, with a note when the name is near a token', async () => {
      const r = /** @type {any} */ (
        await themeEditSet('b', '--spacing-4', 'var(--spacing-xl, 2rem)', {cwd})
      );
      expect(JSON.stringify(r.data ?? r)).not.toContain('would read nothing');
      expect(css()).toMatch(/--spacing-4: var\(--spacing-xl, 2rem\)/);
    }, 240_000);
  });
});

// The forty-sixth pass over `astryx experimental theme editor`: a font file or
// link is never a family, a value pasted with its property name is offered as
// the value given, a size suggestion is the token's own, and a token typed with
// a colon is offered without it.
describe('font file link family', () => {
  beforeAll(resetProject);

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

  describe('N48: a font file or link', () => {
    it.each([
      ['font', './fonts/My.woff2'],
      ['font', 'Inter.woff2'],
      ['font', 'https://fonts.googleapis.com/css2?family=Inter'],
      ['--font-family-body', './fonts/My.woff2'],
      ['--font-family-body', 'url(./My.woff2)'],
    ])('%s %s is refused, never quoted as a name', async (thing, value) => {
      const err = await refusal(() => themeEditSet('b', thing, value, {cwd}));
      expect(err.code).toBe('ERR_THEME_BAD_VALUE');
      expect(err.message).toContain('not a font family name');
      expect(err.message).toContain('@font-face');
      expect(names(err).join('\n')).not.toContain('woff2');
    });
  });

  describe('N45: a value pasted with its property name', () => {
    it.each([
      ['--font-weight-bold', 'font-weight: 700', '700'],
      ['--text-body-size', 'font-size: 18px', '18px'],
    ])('%s %j is offered as %s', async (thing, value, want) => {
      const err = await refusal(() => themeEditSet('b', thing, value, {cwd}));
      expect(names(err)[0]).toMatch(
        new RegExp(` set b ${thing} '?${want.replace(/[()#]/g, '\\$&')}'?$`),
      );
    });
  });

  describe('N45: the accent dial', () => {
    it('a color pasted with its property name is the color (one path for every dial)', async () => {
      await themeEditSet('b', 'accent', 'color: #e11d48;', {cwd});
    }, 240_000);

    it.each([
      ['var(--brand, #e11d48)', '#e11d48'],
      ['light-dark(#e11d48, #fb7185)', '#e11d48'],
    ])('%j is offered as %s', async (value, want) => {
      const err = await refusal(() =>
        themeEditSet('b', 'accent', value, {cwd}),
      );
      expect(names(err)[0]).toMatch(new RegExp(` set b accent '?${want}'?$`));
    });
  });

  describe('N46: a size suggestion', () => {
    it('is the text size token’s own, never 6px', async () => {
      const err = await refusal(() =>
        themeEditSet('b', '--text-body-size', 'big', {cwd}),
      );
      expect(names(err)[0]).not.toMatch(/ 6px$/);
    });
  });

  describe('N47: a token typed with its colon', () => {
    it('is that token (read before any check)', async () => {
      await themeEditSet('b', '--color-accent:', '#e11d48', {cwd});
    }, 240_000);
  });

  describe('a font property pasted with no value', () => {
    it('is refused, and no suggestion names a family with a colon', async () => {
      const err = await refusal(() =>
        themeEditSet('b', 'font', 'font-family: ;', {cwd}),
      );
      expect(err.code).toBe('ERR_MISSING_ARGUMENT');
      expect(names(err).join('\n')).not.toMatch(/font-family:/);
      const colon = await refusal(() =>
        themeEditSet('b', 'font', 'font-family:', {cwd}),
      );
      expect(names(colon).join('\n')).not.toMatch(/font 'font-family:'/);
      const named = await refusal(() =>
        themeEditSet('b', 'font', 'Brand: Sans', {cwd}),
      );
      // A word before a colon is read as a label the editor does not read
      // for font: refused, with the value alone offered.
      expect(named.message).toMatch(
        /holds a colon|not a name the editor reads/,
      );
      expect(names(named).join('\n')).not.toMatch(/font 'Brand: Sans'/);
    });
  });
});
