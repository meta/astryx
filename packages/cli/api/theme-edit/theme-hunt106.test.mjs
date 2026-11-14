// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One built-value check for a theme's own token values, run before
 * every build (set, undo, show) and by compile: a pair on a token that is
 * not a color however it is given, typography weights, a private variable
 * and a key that is no token, each named in the file and line that hold
 * it; undo names the file that sets a token itself.
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
  cwd = makeLinkedFixture('astryx-theme-hunt106-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * A new theme whose own source gives these lines after its name, with
 * `head` lines above it and files beside it.
 * @param {string} slug
 * @param {string} lines
 * @param {{head?: string, files?: Record<string, string>}} [more]
 */
const withOwn = async (slug, lines, {head = '', files = {}} = {}) => {
  await themeEditNew(slug, {cwd});
  const dir = path.join(cwd, 'themes', slug);
  for (const [name, text] of Object.entries(files))
    fs.writeFileSync(path.join(dir, name), text);
  const ts = path.join(dir, `${slug}.theme.ts`);
  const src = fs.readFileSync(ts, 'utf8');
  fs.writeFileSync(
    ts,
    `${head}${src.replace(`name: '${slug}',`, `name: '${slug}',\n${lines}`)}`,
  );
};

/** @param {string} slug */
const compile = slug =>
  runCli(
    ['experimental', 'theme', 'compile', `themes/${slug}/${slug}.theme.ts`],
    {cwd},
  );

/** @param {string} slug @param {string} name */
const read = (slug, name) =>
  fs.readFileSync(path.join(cwd, 'themes', slug, name), 'utf8');

describe('one built-value check for own token values', () => {
  it('refuses a pair on a size from an imported file in set, naming that file, and writes nothing', async () => {
    await withOwn('ip', '  tokens: mine,', {
      head: "import {mine} from './mine';\n",
      files: {
        'mine.ts':
          "export const mine = {'--radius-element': ['4px', '8px']};\n",
      },
    });
    const c = await compile('ip');
    expect(c.status).toBe(1);
    const before = read('ip', 'ip.settings.json');
    const r = await refusal(() => themeEditSet('ip', 'corners', 'pill', {cwd}));
    expect(r.message).toMatch(
      /--radius-element: "light-dark\(4px, 8px\)" \(in themes\/ip\/mine\.ts, line 1\): themes\/ip\/mine\.ts gives --radius-element a \[light, dark\] pair, but only colors differ by mode/,
    );
    expect(r.run[0]).toMatch(/sed -n 1p themes\/ip\/mine\.ts/);
    expect(read('ip', 'ip.settings.json')).toBe(before);
    expect(read('ip', 'ip.css')).not.toMatch(/--radius-element:\s*light-dark/);
  }, 240_000);

  it('refuses a pair on a size given through a const', async () => {
    await withOwn('cp', "  tokens: {'--radius-element': p},", {
      head: "const p = ['4px', '8px'] as const;\n",
    });
    const r = await refusal(() => themeEditSet('cp', 'corners', 'pill', {cwd}));
    expect(r.message).toMatch(/--radius-element.*only colors differ by mode/);
  }, 240_000);

  it('judges a typography weight as the token it builds', async () => {
    await withOwn(
      'tw',
      "  typography: {scale: {base: 16, ratio: 1.2}, heading: {weight: 'heavyx'}},",
    );
    const r = await refusal(() => themeEditShow('tw', {cwd}));
    expect(r.message).toMatch(
      /typography\.heading\.weight \(builds --text-heading-1-weight\): "heavyx"/,
    );
    expect((await compile('tw')).status).toBe(1);
  }, 240_000);

  it('names a private variable and a key that is no token, with the line', async () => {
    await withOwn('pv', "  tokens: {'--_mine': '1px'},");
    const p = await refusal(() =>
      themeEditSet('pv', 'spacing', 'roomy', {cwd}),
    );
    expect(p.message).toMatch(
      /--_mine \(line \d+\): --_mine is a private variable/,
    );
    expect(p.run[0]).toMatch(/sed -n \d+p themes\/pv\/pv\.theme\.ts/);
    await withOwn('nk', "  tokens: {color: 'red'} as any,");
    const k = await refusal(() => themeEditShow('nk', {cwd}));
    expect(k.message).toMatch(/color \(line \d+\): color is no token/);
    expect((await compile('nk')).status).toBe(1);
  }, 240_000);

  it('says which file sets a token undo cannot remove', async () => {
    await withOwn('un', "  tokens: {'--radius-element': '3px'},");
    await themeEditShow('un', {cwd});
    const r = await refusal(() =>
      themeEditUndo('un', {cwd, thing: '--radius-element'}),
    );
    expect(r.message).toMatch(
      /The settings do not set --radius-element: themes\/un\/un\.theme\.ts sets it itself \(line \d+\)/,
    );
    expect(r.run[0]).toMatch(/sed -n \d+p themes\/un\/un\.theme\.ts/);
  }, 240_000);
});
