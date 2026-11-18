// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A page-wide font setting that the theme's own source covers says
 * so: a `typography` family or a `--font-family-*` token in the theme file
 * wins over the setting, and set names the roles that keep the file's
 * family, the line that gives it, and how to change it, in text and JSON.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-own-family-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * A new theme whose own source gives these lines after its name.
 * @param {string} slug
 * @param {string} lines
 */
const withOwn = async (slug, lines) => {
  await themeEditNew(slug, {cwd, like: 'neutral'});
  const ts = path.join(cwd, 'themes', slug, `${slug}.theme.ts`);
  const src = fs.readFileSync(ts, 'utf8');
  const own = src.replace(`name: '${slug}',`, `name: '${slug}',\n${lines}`);
  expect(own).not.toBe(src);
  fs.writeFileSync(ts, own);
};

/** @param {string} slug */
const familyLine = slug =>
  fs
    .readFileSync(path.join(cwd, 'themes', slug, `${slug}.theme.ts`), 'utf8')
    .split('\n')
    .findIndex(l => l.includes('family:')) + 1;

describe('a font setting the theme file covers', () => {
  it('names the roles that keep the file family, in JSON and in text', async () => {
    await withOwn('ob', "  typography: {body: {family: 'Georgia'}},");
    const r = await themeEditSet('ob', 'font', 'Lato', {cwd});
    const note = (r.data.notes ?? []).find(n => /does not show/.test(n));
    expect(note).toBeDefined();
    expect(note).toMatch(/^font = lato \(whole theme\) does not show: /i);
    expect(note).toMatch(/body text and headings keep Georgia/);
    expect(note).toContain(
      `themes/ob/ob.theme.ts sets typography.body.family (line ${familyLine('ob')})`,
    );
    expect(note).toMatch(/change the family in themes\/ob\/ob\.theme\.ts/);
    expect(fs.readFileSync(path.join(cwd, 'themes/ob/ob.css'), 'utf8')).toMatch(
      /--font-family-body:\s*Georgia/,
    );

    const text = await runCli(
      ['experimental', 'theme', 'editor', 'set', 'ob', 'font', 'Lato'],
      {cwd},
    );
    expect(text.stdout).toContain(
      'does not show: body text and headings keep Georgia',
    );
  }, 240_000);

  it('names only the role the file covers when the setting shows elsewhere', async () => {
    await withOwn('oh', "  typography: {heading: {family: 'Georgia'}},");
    const r = await themeEditSet('oh', 'font', 'Lato', {cwd});
    const note = (r.data.notes ?? []).find(n => /does not show/.test(n));
    expect(note).toMatch(/does not show in headings: headings keep Georgia/);
  }, 240_000);

  it('says nothing when the file gives no family', async () => {
    await withOwn('on', '  typography: {scale: {base: 16, ratio: 1.2}},');
    const r = await themeEditSet('on', 'font', 'Lato', {cwd});
    expect((r.data.notes ?? []).some(n => /does not show/.test(n))).toBe(false);
  }, 240_000);
});
