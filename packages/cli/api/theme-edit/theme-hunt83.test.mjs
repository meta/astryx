// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A token value a theme's own source gives is checked entry by entry
 * as written: a number, a font family, each half of a [light, dark] pair,
 * a computed key; show and compile give one refusal, naming the line that
 * sets the token.
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

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt83-', FIXTURE_PACKAGES);
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

/** @param {string} slug */
const css = slug =>
  fs.existsSync(path.join(cwd, 'themes', slug, `${slug}.css`))
    ? fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
    : '';

describe('own-source token values', () => {
  it('refuses a number in compile and show with one message', async () => {
    await withOwn('num', "  tokens: {'--radius-page': 12},");
    const c = await compile('num');
    expect(c.status).toBe(1);
    expect(c.stdout + c.stderr).toMatch(/--radius-page.*which is not text/);
    const s = await refusal(() => themeEditShow('num', {cwd}));
    expect(s.message).toMatch(/--radius-page.*which is not text/);
    expect(css('num')).not.toMatch(/--radius-page:\s*12;/);
  }, 240_000);

  it('checks a font family token, and takes a family list as Core quotes it', async () => {
    await withOwn('ff', "  tokens: {'--font-family-body': '12px'},");
    const c = await compile('ff');
    expect(c.status).toBe(1);
    expect(c.stdout + c.stderr).toContain('--font-family-body');
    await withOwn(
      'ffok',
      `  tokens: {'--font-family-body': '"Georgia, serif"', '--font-family-heading': '"Open Sans", sans-serif'},`,
    );
    await themeEditShow('ffok', {cwd});
    expect((await compile('ffok')).status).toBe(0);
  }, 240_000);

  it('checks each half of a [light, dark] pair', async () => {
    await withOwn('pr', "  tokens: {'--color-accent': ['banana', 'red']},");
    const s = await refusal(() => themeEditShow('pr', {cwd}));
    expect(s.message).toMatch(/--color-accent: "banana".*its light half/);
    const c = await compile('pr');
    expect(c.status).toBe(1);
    expect(css('pr')).not.toContain('banana');
    await withOwn(
      'prok',
      "  tokens: {'--color-accent': ['#e11d48', '#fb7185']},",
    );
    await themeEditShow('prok', {cwd});
  }, 240_000);

  it('reads a computed key that is text, and names one it cannot read as not checked', async () => {
    await withOwn('ck', "  tokens: {['--radius-page']: 'banana'},");
    const s = await refusal(() => themeEditShow('ck', {cwd}));
    expect(s.message).toMatch(/--radius-page: "banana"/);
    await withOwn('cu', "  tokens: {[String('--radius-page')]: 'banana'},");
    const u = await refusal(() => themeEditShow('cu', {cwd}));
    expect(u.message).toMatch(/is computed.*has not checked its value/);
  }, 240_000);

  it('names the line that sets the token, not a comment that mentions it', async () => {
    const lines = await withOwn(
      'ln',
      "  // was --radius-page: 8px before the redesign\n  tokens: {'--radius-page': 'banana'},",
    );
    const at =
      lines.findIndex(l => l.includes("'--radius-page': 'banana'")) + 1;
    const s = await refusal(() => themeEditShow('ln', {cwd}));
    expect(s.message).toContain(`(line ${at})`);
    expect(s.run[0]).toMatch(new RegExp(`sed -n ${at}p `));
  }, 240_000);
});
