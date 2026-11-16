// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The own-token check judges every block a theme gives: localTokens
 * read by a var(), adaptation rules, a part's properties as text and their
 * names, typography weights that need a scale and scale fields of the
 * wrong type, and a theme the export extends.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt124-', FIXTURE_PACKAGES);
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
  fs.writeFileSync(
    ts,
    src.replace(`name: '${slug}',`, `name: '${slug}',\n${lines}`),
  );
};

/** @param {string} slug */
const compile = slug =>
  runCli(
    ['experimental', 'theme', 'compile', `themes/${slug}/${slug}.theme.ts`],
    {cwd},
  );

/** @param {string} slug @param {RegExp} what */
const refused = async (slug, what) => {
  const c = await compile(slug);
  expect(c.status, `compile ${slug}`).toBe(1);
  expect(c.stdout + c.stderr, `compile ${slug}`).toMatch(what);
  expect(c.stdout + c.stderr).not.toMatch(/ERR_UNKNOWN|TypeError/);
  const s = await refusal(() => themeEditShow(slug, {cwd}));
  expect(s.message, `show ${slug}`).toMatch(what);
  return s;
};

/** @param {string} slug */
const accepted = async slug => {
  expect((await compile(slug)).status, `compile ${slug}`).toBe(0);
  await themeEditShow(slug, {cwd});
};

describe('every block the theme gives is judged', () => {
  it('reads a localTokens entry in a var()', async () => {
    await withOwn(
      'lt',
      "  localTokens: {'--brand': '#0a7d55'},\n  tokens: {'--color-accent': 'var(--brand)'},",
    );
    await accepted('lt');
  }, 240_000);

  it('judges the tokens and parts of an adaptation rule, named as the file writes it', async () => {
    await withOwn(
      'ar',
      "  adaptations: {rules: [{when: {pointer: 'coarse'}, value: {tokens: {'--color-accent': 'notacolor'}, components: {card: {base: {padding: 4}}}}}]} as any,",
    );
    const s = await refused(
      'ar',
      /adaptations\.rules\[0\]\.value\.tokens --color-accent: "notacolor" \(line \d+\)/,
    );
    expect(s.message).toMatch(
      /adaptations\.rules\[0\]\.value\.components\.card\.base padding/,
    );
  }, 240_000);

  it("judges a part's property text as set does, and names a misspelled property", async () => {
    await withOwn(
      'pt',
      "  components: {button: {base: {backgroundColor: 'notacolor', borderRadius: '12'}}},",
    );
    const s = await refused(
      'pt',
      /background-color: "notacolor" \(line \d+\): background-color takes a color/,
    );
    expect(s.message).toMatch(
      /border-radius: "12" .*takes a value its CSS grammar takes/,
    );
    await withOwn(
      'pm',
      "  components: {button: {base: {backgroundColour: '#ff0000'}}} as any,",
    );
    await refused(
      'pm',
      /backgroundColour is not a CSS property.*did you mean backgroundColor\?/,
    );
  }, 240_000);

  it('refuses a color property reading a token of another kind, in set and in the file', async () => {
    await themeEditNew('ck', {cwd});
    for (const [prop, ref] of [
      ['background-color', 'var(--radius-element)'],
      ['color', 'var(--font-family-body)'],
    ]) {
      const r = await refusal(() =>
        themeEditSet('ck', prop, ref, {cwd, on: 'card'}),
      );
      expect(r.message, prop).toMatch(
        new RegExp(
          `${prop} takes a color; --[a-z-]+ is a (size|font), so the browser would drop it`,
        ),
      );
    }
    await withOwn(
      'cf',
      "  components: {card: {base: {backgroundColor: 'var(--radius-element)'}}},",
    );
    await refused(
      'cf',
      /background-color takes a color; --radius-element is a size/,
    );
  }, 240_000);

  it('names a weight that needs a scale, and a weight field by its own name', async () => {
    await withOwn(
      'ws',
      "  typography: {body: {family: 'Inter', weight: '450'}},",
    );
    await refused(
      'ws',
      /typography\.body\.weight: "450" .*only from a type scale/,
    );
    await withOwn(
      'wn',
      "  typography: {scale: {base: 16, ratio: 1.2}, body: {family: 'Inter', weight: 'zzz'}},",
    );
    await refused(
      'wn',
      /typography\.body\.weight \(builds --text-body-weight\)/,
    );
  }, 240_000);

  it('names scale fields of the wrong type as they are written', async () => {
    await withOwn(
      'sy',
      "  typography: {scale: {base: Symbol('s') as any, ratio: 1.2}},",
    );
    await refused('sy', /Symbol\(s\)/);
    await withOwn('nn', '  typography: {scale: {base: 16, ratio: NaN}},');
    await refused('nn', /ratio .*; NaN makes/);
    await withOwn(
      'bt',
      '  typography: {scale: {base: true as any, ratio: 1.25}},',
    );
    await refused('bt', /typography\.scale\.base .*; true builds/);
  }, 240_000);

  it('judges a theme the export extends that the source defines', async () => {
    await themeEditNew('ch', {cwd});
    const ts = path.join(cwd, 'themes/ch/ch.theme.ts');
    const src = fs.readFileSync(ts, 'utf8');
    const own = src.replace(
      /export const chTheme = defineTheme\(\{\n\s*extends: chSettings,/,
      "const mid = defineTheme({extends: chSettings, name: 'mid', tokens: {'--color-accent': 'nope'}});\nexport const chTheme = defineTheme({\n  extends: mid,",
    );
    expect(own).not.toBe(src);
    fs.writeFileSync(ts, own);
    await refused(
      'ch',
      /theme 'mid' tokens --color-accent: "nope" \(line \d+\)/,
    );
  }, 240_000);
});
