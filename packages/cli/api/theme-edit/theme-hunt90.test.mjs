// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One check for a theme's own token values, run by show, set, undo
 * and compile: pairs of exactly two values, values from an imported
 * module or an expression (as a build evaluates them), a second tokens
 * key, and the typography fields.
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
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt90-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * A new theme whose own source gives these lines after its name.
 * @param {string} slug @param {string} lines
 */
const withOwn = async (slug, lines) => {
  await themeEditNew(slug, {cwd});
  const ts = path.join(cwd, 'themes', slug, `${slug}.theme.ts`);
  const src = fs.readFileSync(ts, 'utf8');
  const own = src.replace(`name: '${slug}',`, `name: '${slug}',\n${lines}`);
  expect(own).not.toBe(src);
  fs.writeFileSync(ts, own);
  return own.split('\n');
};

/** @param {string} slug */
const compile = slug =>
  runCli(
    ['experimental', 'theme', 'compile', `themes/${slug}/${slug}.theme.ts`],
    {cwd},
  );

/** @param {string} slug @param {RegExp} what */
const refusedEverywhere = async (slug, what) => {
  const s = await refusal(() => themeEditShow(slug, {cwd}));
  expect(s.message, `show ${slug}`).toMatch(what);
  const c = await compile(slug);
  expect(c.status, `compile ${slug}`).toBe(1);
  expect(c.stdout + c.stderr, `compile ${slug}`).toMatch(what);
};

describe('one check for own token values', () => {
  it('refuses a pair that is not exactly two values in quotes', async () => {
    await withOwn('p1', "  tokens: {'--color-accent': ['red']},");
    await refusedEverywhere(
      'p1',
      /exactly two values in quotes, and this holds 1/,
    );
    await withOwn('p0', "  tokens: {'--color-accent': []},");
    await refusedEverywhere('p0', /this holds 0/);
    await withOwn(
      'p3',
      "  tokens: {'--color-accent': ['red', 'blue', 'green']},",
    );
    await refusedEverywhere('p3', /this holds 3.*drop the rest/);
  }, 240_000);

  it('checks values from an imported module as a build evaluates them', async () => {
    await themeEditNew('im', {cwd});
    fs.writeFileSync(
      path.join(cwd, 'themes/im/extra.ts'),
      "export const extra = {'--radius-page': 'banana', '--font-family-body': '12px'};\n",
    );
    const ts = path.join(cwd, 'themes/im/im.theme.ts');
    fs.writeFileSync(
      ts,
      `import {extra} from './extra';\n${fs
        .readFileSync(ts, 'utf8')
        .replace("name: 'im',", "name: 'im',\n  tokens: extra,")}`,
    );
    await refusedEverywhere('im', /--radius-page: "banana"/);
    const s = await refusal(() => themeEditShow('im', {cwd}));
    expect(s.message).toContain('--font-family-body');
  }, 240_000);

  it('checks an expression as a build evaluates it, naming its line', async () => {
    const lines = await withOwn(
      'ex',
      "  tokens: {'--radius-page': 'ban' + 'ana'},",
    );
    const at = lines.findIndex(l => l.includes("'ban' + 'ana'")) + 1;
    await refusedEverywhere('ex', /--radius-page: "banana"/);
    const s = await refusal(() => themeEditShow('ex', {cwd}));
    expect(s.message).toContain(`(line ${at})`);
    await withOwn('tp', "  tokens: {'--radius-page': `${'ban'}ana`},");
    await refusedEverywhere('tp', /--radius-page: "banana"/);
  }, 240_000);

  it('refuses a second tokens key, naming both lines', async () => {
    const lines = await withOwn(
      'dk',
      "  tokens: {'--radius-page': '8px'},\n  tokens: {'--radius-page': '12px'},",
    );
    const first = lines.findIndex(l => l.includes("'8px'")) + 1;
    await refusedEverywhere(
      'dk',
      new RegExp(`tokens twice \\(lines ${first} and ${first + 1}\\)`),
    );
  }, 240_000);

  it('undo runs the same check and writes nothing', async () => {
    await themeEditNew('ud', {cwd});
    await themeEditSet('ud', 'corners', 'pill', {cwd});
    const ts = path.join(cwd, 'themes/ud/ud.theme.ts');
    fs.writeFileSync(
      ts,
      fs
        .readFileSync(ts, 'utf8')
        .replace(
          "name: 'ud',",
          "name: 'ud',\n  tokens: {'--radius-page': 'banana'},",
        ),
    );
    const css = path.join(cwd, 'themes/ud/ud.css');
    const before = fs.readFileSync(css, 'utf8');
    const r = await refusal(() => themeEditUndo('ud', {cwd}));
    expect(r.message).toMatch(/--radius-page: "banana"/);
    expect(fs.readFileSync(css, 'utf8')).toBe(before);
  }, 240_000);

  it('refuses a family list in one pair of quotes in the file as set does', async () => {
    await withOwn(
      'fq',
      `  tokens: {'--font-family-body': '"Georgia, serif"'},`,
    );
    await refusedEverywhere('fq', /quotes go around one family name/);
    await themeEditNew('fs', {cwd});
    const s = await refusal(() =>
      themeEditSet('fs', '--font-family-body', '"Georgia, serif"', {cwd}),
    );
    expect(s.message).toMatch(/quotes go around one family name/);
  }, 240_000);

  it('checks the typography fields', async () => {
    await withOwn('ty1', "  typography: {body: {family: '12px'}},");
    await refusedEverywhere('ty1', /typography\.body\.family/);
    await withOwn('ty2', '  typography: {scale: {base: 14, ratio: 0}},');
    await refusedEverywhere('ty2', /typography\.scale\.ratio/);
    await withOwn('ty3', '  typography: {scale: {base: -14, ratio: 1.2}},');
    await refusedEverywhere('ty3', /typography\.scale\.base/);
    await withOwn('ty4', "  typography: {body: {family: 'Georgia, serif'}},");
    await refusedEverywhere('ty4', /one family name.*fallbacks/);
    await withOwn(
      'tyok',
      "  typography: {body: {family: 'Georgia', fallbacks: 'serif'}, scale: {base: 16, ratio: 1.25}},",
    );
    await themeEditShow('tyok', {cwd});
    expect((await compile('tyok')).status).toBe(0);
  }, 240_000);
});
