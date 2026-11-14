// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The own-token check judges what the build writes: typography and
 * pair halves given by an import or an expression, the value a later key
 * keeps, a scale base with a unit, a family in quotes, fallbacks, a pair
 * from an imported file, and the file and line that hold a refused value.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** Why the real neutral theme could not be built here, or ''. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt101-', FIXTURE_PACKAGES);
  // The phone note needs a base whose rule for phones sets the type again,
  // as the real neutral theme does.
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * A new theme whose own source gives these lines after its name, with
 * `head` lines above it and files beside it.
 * @param {string} slug
 * @param {string} lines
 * @param {{head?: string, files?: Record<string, string>, like?: string}} [more]
 */
const withOwn = async (slug, lines, {head = '', files = {}, like} = {}) => {
  await themeEditNew(slug, {cwd, ...(like ? {like} : {})});
  const dir = path.join(cwd, 'themes', slug);
  for (const [name, text] of Object.entries(files))
    fs.writeFileSync(path.join(dir, name), text);
  const ts = path.join(dir, `${slug}.theme.ts`);
  const src = fs.readFileSync(ts, 'utf8');
  const own = `${head}${src.replace(`name: '${slug}',`, `name: '${slug}',\n${lines}`)}`;
  expect(own).not.toBe(src);
  fs.writeFileSync(ts, own);
};

/** @param {string} slug */
const compile = slug =>
  runCli(
    ['experimental', 'theme', 'compile', `themes/${slug}/${slug}.theme.ts`],
    {cwd},
  );

/** @param {string} slug @param {RegExp} what */
const refused = async (slug, what) => {
  const s = await refusal(() => themeEditShow(slug, {cwd}));
  expect(s.message, `show ${slug}`).toMatch(what);
  const c = await compile(slug);
  expect(c.status, `compile ${slug}`).toBe(1);
  return s;
};

/** @param {string} slug */
const accepted = async slug => {
  const r = await themeEditShow(slug, {cwd});
  expect((await compile(slug)).status, `compile ${slug}`).toBe(0);
  return r;
};

describe('the own-token check judges what the build writes', () => {
  it('takes typography given by an import, and names a scale with no base', async () => {
    await withOwn(
      'ti',
      '  typography: {body: {family: brandFont}, scale: {base, ratio}},',
      {
        head: "import {brandFont, base, ratio} from './brand';\n",
        files: {
          'brand.ts':
            "export const brandFont = 'Inter';\nexport const base = 16;\nexport const ratio = 1.25;\n",
        },
      },
    );
    await accepted('ti');
    await withOwn('tn', '  typography: {scale: {ratio: 1.25}},');
    await refused('tn', /given no base/);
  }, 240_000);

  it('evaluates a pair half written as an expression', async () => {
    await withOwn(
      'ph',
      "  tokens: {'--color-background-body': ['#ffffff', dark.toUpperCase()]},",
      {head: "const dark = '#111111';\n"},
    );
    await accepted('ph');
    await withOwn(
      'pb',
      "  tokens: {'--color-background-body': ['#ffffff', bad.toUpperCase()]},",
      {head: "const bad = 'banana';\n"},
    );
    await refused('pb', /--color-background-body/);
  }, 240_000);

  it('judges only the value a later key keeps', async () => {
    await withOwn('ov', "  tokens: {...defaults, '--radius-page': '4px'},", {
      head: "const defaults = {'--radius-page': 'banana'};\n",
    });
    await accepted('ov');
  }, 240_000);

  it('refuses a scale base with a unit, naming the number it means', async () => {
    await withOwn('bp', "  typography: {scale: {base: '16px', ratio: 1.2}},");
    await refused('bp', /base: 16\b/);
    await withOwn('br', "  typography: {scale: {base: '1rem', ratio: 1.2}},");
    await refused('br', /base: 16\b/);
    await withOwn('bn', "  typography: {scale: {base: '16', ratio: 1.2}},");
    await accepted('bn');
  }, 240_000);

  it('refuses a family in quotes or holding a semicolon, and checks fallbacks', async () => {
    await withOwn('fq', `  typography: {heading: {family: '"Roboto Slab"'}},`);
    await refused('fq', /without them: family: 'Roboto Slab'/);
    await withOwn('fs', "  typography: {body: {family: 'Mono;Thing'}},");
    await refused('fs', /holds a ; \{ \} < or >/);
    await withOwn(
      'fb',
      "  typography: {body: {family: 'Georgia', fallbacks: '12px'}},",
    );
    await refused('fb', /typography\.body \(builds --font-family-body\)/);
  }, 240_000);

  it('refuses a three-value pair from an imported file, naming that file and line', async () => {
    await withOwn('i3', '  tokens: {...mine},', {
      head: "import {mine} from './mine';\n",
      files: {
        'mine.ts':
          "export const mine = {\n  '--color-background-body': ['#ffffff', '#000000', '#ff0000'],\n};\n",
      },
    });
    const s = await refused('i3', /this holds 3/);
    expect(s.message).toContain('(in themes/i3/mine.ts, line 2)');
    expect(s.message).toContain('Change it in themes/i3/mine.ts');
    expect(s.run[0]).toMatch(/sed -n 2p themes\/i3\/mine\.ts/);
  }, 240_000);

  it('names an imported JSON file that holds a refused value', async () => {
    await withOwn('ij', '  tokens: tok,', {
      head: "import tok from './tok.json';\n",
      files: {'tok.json': '{\n  "--radius-page": "banana"\n}\n'},
    });
    const s = await refused('ij', /--radius-page: "banana"/);
    expect(s.message).toContain('(in themes/ij/tok.json, line 2)');
  }, 240_000);

  it('gives the phone note for a family the tokens map sets, and none for one the typography sets', async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      return ctx.skip();
    }
    // The base's rule for phones sets the type again, so a family the
    // tokens map sets is lost there: the note shows the case is reproduced.
    await withOwn('pt', "  tokens: {'--font-family-body': 'Georgia, serif'},", {
      like: 'neutral',
    });
    const t = await accepted('pt');
    expect(t.data.notes.join('\n')).toMatch(/on phones.*--font-family-body/);
    // That rule keeps the theme's typography: no note.
    await withOwn(
      'pn',
      "  typography: {body: {family: 'Georgia', fallbacks: 'serif'}},",
      {like: 'neutral'},
    );
    const r = await accepted('pn');
    expect(r.data.notes.join('\n')).not.toMatch(/on phones/);
  }, 300_000);
});
