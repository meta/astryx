// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The seventy-second pass: the preview follows through. Remove given a
 * file, a picture run stopped part way, the `see` line with several themes,
 * a preview moved where Next does not serve it, preview.html as a folder, a
 * picture of yours in the way, a run from a subfolder, a route changed by
 * hand, the show help on pictures, and a dial value labeled with another
 * setting.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditPreviewAdd,
  themeEditPreviewList,
  themeEditPreviewRemove,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {
  cleanDialValue,
  colorPair,
  normalValueText,
  normalizeEntry,
  withoutDebris,
} from './_normal.mjs';
import {doc as showDoc} from '../../clients/cli/commands/experimental-theme-editor-show.doc.mjs';

/** The paths the picture stand-in was asked to write. */
const shotPaths = /** @type {string[]} */ ([]);

vi.mock('./_preview.mjs', async importOriginal => {
  const original = /** @type {any} */ (await importOriginal());
  const stubbed = (
    await import('../../test-utils/theme-render-stub.mjs')
  ).stubRenders(original);
  return {
    ...stubbed,
    /** A picture stand-in: a tiny PNG at the path asked for. */
    async screenshot(
      /** @type {any} */ project,
      /** @type {string} */ html,
      /** @type {string} */ png,
    ) {
      shotPaths.push(png);
      fs.writeFileSync(
        png,
        Buffer.from(
          '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
            '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
          'hex',
        ),
      );
      return {ok: true, file: path.relative(project.cwd, png)};
    },
  };
});

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt72-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  fs.writeFileSync(
    path.join(cwd, 'src/app/layout.tsx'),
    "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
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

describe('with several editor themes, the see line names the theme', () => {
  it('suggests preview add --theme <t>', async () => {
    await themeEditNew('u', {cwd, like: 'neutral'});
    const r = await themeEditSet('u', 'corners', 'pill', {cwd});
    expect(r.data.see).toMatch(/preview add --theme u puts the preview/);
  }, 240_000);
});

describe('preview remove given a file', () => {
  it('names the preview folder the file is in', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 't'});
    const err = await refusal(() =>
      themeEditPreviewRemove(undefined, {
        cwd,
        path: 'src/app/theme-preview/page.tsx',
      }),
    );
    expect(err.code).toBe('ERR_INVALID_ARGUMENT');
    expect(names(err)[0]).toMatch(/remove --path src\/app\/theme-preview$/);
  }, 240_000);

  it('any other file is refused, never ERR_UNKNOWN', async () => {
    const err = await refusal(() =>
      themeEditPreviewRemove(undefined, {cwd, path: 'src/app/layout.tsx'}),
    );
    expect(err.code).toBe('ERR_INVALID_ARGUMENT');
  });
});

describe('a route changed by hand', () => {
  it('previewStale and see say why and what to do', async () => {
    const page = path.join(cwd, 'src/app/theme-preview/page.tsx');
    const kept = fs.readFileSync(page, 'utf8');
    fs.writeFileSync(page, `${kept}\n// mine\n`);
    try {
      const r = await themeEditSet('t', 'mode', 'dark-only', {cwd});
      const stale = /** @type {string[]} */ (r.data.previewStale ?? []);
      expect(stale.join(' ')).toMatch(/changed by hand/);
      expect(stale.join(' ')).toMatch(
        /move it out of src\/app\/theme-preview\//,
      );
      expect(r.data.see).toMatch(/was changed by hand, so it does not follow/);
      // The look that changes nothing in the app still leads.
      expect(r.data.see).toMatch(/^look without changing your app/);
    } finally {
      fs.writeFileSync(page, kept);
      await themeEditSet('t', 'mode', 'both', {cwd});
    }
  }, 240_000);
});

describe('a preview moved where Next does not serve it', () => {
  it('see and list hand out no URL', async () => {
    const from = path.join(cwd, 'src/app/theme-preview');
    const to = path.join(cwd, 'src/app/_private/tp');
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.renameSync(from, to);
    try {
      const r = await themeEditSet('t', 'corners', 'round', {cwd});
      expect(r.data.see).toMatch(/does not serve/);
      expect(r.data.see).not.toMatch(/\/_private\/tp\?page=/);
      const list = await themeEditPreviewList({cwd});
      expect(JSON.stringify(list)).not.toMatch(/\/_private\/tp\?page=/);
    } finally {
      fs.renameSync(to, from);
    }
  }, 240_000);
});

describe('preview.html is a folder', () => {
  it('says it could not be written, never that it could not be rendered', async () => {
    const f = path.join(cwd, 'themes/t/preview.html');
    fs.rmSync(f, {force: true});
    fs.mkdirSync(f);
    try {
      const r = await themeEditSet('t', 'corners', 'small', {cwd});
      expect(r.data.see).toMatch(/could not be written/);
      expect(r.data.see).toMatch(/a folder/);
      expect(r.data.see).not.toMatch(/could not be rendered/);
    } finally {
      fs.rmSync(f, {recursive: true, force: true});
    }
  }, 240_000);
});

describe('pictures', () => {
  it('a picture of yours in the way: see says what blocks --png', async () => {
    const own = path.join(cwd, 'themes/t/preview.png');
    fs.writeFileSync(own, 'mine');
    try {
      const r = await themeEditSet('t', 'corners', 'medium', {cwd, png: true});
      expect(r.data.pictureProblem).toMatch(/preview\.png/);
      expect(r.data.see).toMatch(/--png took no pictures/);
      expect(r.data.see).not.toMatch(/run it with --png/);
    } finally {
      fs.rmSync(own, {force: true});
    }
  }, 240_000);

  it('takes each picture under a part name and moves it into place; a part left before is cleared', async () => {
    const left = path.join(cwd, 'themes/t/.preview.part-99999.png');
    fs.writeFileSync(left, 'stopped');
    shotPaths.length = 0;
    const r = await themeEditSet('t', 'corners', 'large', {cwd, png: true});
    expect(shotPaths.length).toBeGreaterThan(0);
    for (const p of shotPaths)
      expect(path.basename(p)).toMatch(/\.part-\d+\.png$/);
    expect(fs.existsSync(left)).toBe(false);
    expect(
      fs
        .readdirSync(path.join(cwd, 'themes/t'))
        .filter(n => n.includes('.part-')),
    ).toEqual([]);
    expect(r.data.pictures.length).toBeGreaterThan(0);
    // The next run takes pictures again: nothing it left reads as yours.
    const again = await themeEditSet('t', 'corners', 'pill', {cwd, png: true});
    expect(again.data.pictureProblem ?? '').not.toMatch(/did not write/);
    expect(again.data.pictures.length).toBeGreaterThan(0);
  }, 240_000);
});

describe('run from a subfolder', () => {
  it('see names files by paths that work from there', async () => {
    const r = await themeEditSet('t', 'corners', 'round', {
      cwd: path.join(cwd, 'src'),
    });
    expect(r.data.see).toContain(path.join(cwd, 'themes/t/preview.html'));
    expect(r.data.see).not.toMatch(/(^|\s)themes\/t\/preview\.html/);
  }, 240_000);
});

describe('the show help on pictures', () => {
  it('says show may bring the app copy up to date after a hand edit', () => {
    const png = showDoc.options.find(
      (/** @type {any} */ o) => o.flag === '--png',
    );
    expect(png.description).toMatch(
      /changes nothing in the app, except that show first brings the app copy/,
    );
  });
});

describe('a dial value labeled with another setting', () => {
  it.each([
    ['accent', 'neutral: #64748b', 'neutral'],
    ['accent', '--color-accent: #64748b', '--color-accent'],
  ])('%s %j is refused, offering %s', async (thing, value, other) => {
    const err = await refusal(() => themeEditSet('t', thing, value, {cwd}));
    expect(err.code).toBe('ERR_THEME_BAD_VALUE');
    expect(names(err)[0]).toMatch(new RegExp(` set t ${other} '#64748b'$`));
  });

  it('a label naming this dial or a CSS property is still read', async () => {
    await themeEditSet('t', 'accent', 'accent: #2563eb', {cwd});
    await themeEditSet('t', 'accent', 'color: #e11d48', {cwd});
  }, 240_000);
});

describe('the normaliser', () => {
  it.each([
    ['\u201DInter\u201C', '"Inter"'],
    ['\u201EInter\u201C', '"Inter"'],
    ['\u300CInter\u300D', '"Inter"'],
    ['\u300EInter\u300F', '"Inter"'],
    ['url("a.png?x=1;y:2")', 'url("a.png?x=1;y:2")'],
    ['"Foo; Bar: X", serif', '"Foo; Bar: X", serif'],
  ])('%j reads as %j', (typed, want) => {
    expect(normalValueText(typed)).toBe(want);
  });

  it.each([
    ['content', 'url("a.png?x=1;y:2")'],
    ['--font-family-body', '"Foo; Bar: X", serif'],
    ['content', '"5\\" screen"'],
    ['content', "'it\\'s'"],
    ['content', '"\\""'],
    ['content', '"a (b"'],
  ])('%s %j is kept whole', (thing, value) => {
    expect(normalizeEntry(thing, value).value).toBe(value);
    expect(withoutDebris(value)).toBe(value);
  });

  it.each([
    ['text-size', '18,', '18'],
    ['text-size', '"18"', '18'],
    ['corners', 'pill,', 'pill'],
    ['corners', '\u201Cpill\u201D', 'pill'],
    ['buttons', 'soft,', 'soft'],
    ['accent', '"#e11d48",', '#e11d48'],
    ['accent', '#e11d48 !important', '#e11d48'],
  ])('saved %s %j is cleaned to %j', (dial, raw, want) => {
    expect(cleanDialValue(dial, raw)).toBe(want);
  });

  it.each([
    ['light: red; dark: blue', {light: 'red', dark: 'blue'}],
    ['dark: blue; light: red', {light: 'red', dark: 'blue'}],
    ['{"light":"red","dark":"blue"}', {light: 'red', dark: 'blue'}],
    ['red / blue', {light: 'red', dark: 'blue'}],
    ['red, blue', {light: 'red', dark: 'blue'}],
  ])('%j is a pair', (typed, want) => {
    expect(colorPair(typed)).toEqual(want);
    expect(normalizeEntry('--color-accent', typed).value).toBe(typed);
  });

  it('rgb() with a slash is no pair', () => {
    expect(colorPair('rgb(1 2 3 / 50%)')).toBeNull();
  });

  it('a font stack as a JSON string is the stack', () => {
    expect(
      normalizeEntry('--font-family-body', '"\\"Open Sans\\", serif"').value,
    ).toBe('"Open Sans", serif');
  });
});

describe('set end to end', () => {
  it('a token offers light-dark() and the two --mode lines', async () => {
    const err = await refusal(() =>
      themeEditSet('t', '--color-accent', 'light: red; dark: blue', {cwd}),
    );
    expect(names(err)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/--color-accent 'light-dark\(red, blue\)'$/),
        expect.stringMatching(/--color-accent red --mode light$/),
        expect.stringMatching(/--color-accent blue --mode dark$/),
      ]),
    );
  });

  it('the accent dial takes one color, and the token takes the pair', async () => {
    const err = await refusal(() =>
      themeEditSet('t', 'accent', 'red / blue', {cwd}),
    );
    expect(err.message).toMatch(/takes one color/);
    expect(names(err)[0]).toMatch(/ set t accent red$/);
  });

  it('a JSON object of two settings gives one line each', async () => {
    const err = await refusal(() =>
      themeEditSet('t', '{"accent":"#e11d48","corners":"pill"}', '', {cwd}),
    );
    expect(names(err)).toEqual([
      expect.stringMatching(/ set t accent '#e11d48'$/),
      expect.stringMatching(/ set t corners pill$/),
    ]);
  });

  it.each([
    ['night', 'dark'],
    ['day', 'light'],
  ])('--mode %s is %s', async (mode, want) => {
    const err = await refusal(() =>
      themeEditSet('t', '--color-accent', 'red', {cwd, mode}),
    );
    expect(names(err)[0]).toMatch(new RegExp(`--mode ${want}$`));
  });

  it.each([
    ['0.5', / set t vibrancy 50$/],
    ['"50"', / set t vibrancy 50$/],
  ])(
    'vibrancy %j',
    async (value, want) => {
      await themeEditSet('t', 'accent', '#e11d48', {cwd});
      const err = await refusal(() =>
        themeEditSet('t', 'vibrancy', value, {cwd}),
      );
      expect(names(err)[0]).toMatch(want);
    },
    240_000,
  );
});
