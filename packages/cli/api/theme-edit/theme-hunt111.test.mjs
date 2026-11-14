// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The own-token check judges every value the theme's own source
 * gives defineTheme(), as the module evaluates: null and booleans, a value
 * under a computed key the build would drop, a typography weight given as
 * a number, and the tokens a part's blocks and onDark set.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt111-', FIXTURE_PACKAGES);
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
const refusedEverywhere = async (slug, what) => {
  const c = await compile(slug);
  expect(c.status, `compile ${slug}`).toBe(1);
  expect(c.stdout + c.stderr, `compile ${slug}`).toMatch(what);
  const css = path.join(cwd, 'themes', slug, `${slug}.css`);
  const before = fs.readFileSync(css, 'utf8');
  const s = await refusal(() => themeEditSet(slug, 'spacing', 'roomy', {cwd}));
  expect(s.message, `set ${slug}`).toMatch(what);
  expect(fs.readFileSync(css, 'utf8'), `set ${slug} writes nothing`).toBe(
    before,
  );
};

describe('the own-token check judges every value the source gives', () => {
  it('refuses null and a boolean as no text', async () => {
    await withOwn('nu', "  tokens: {'--radius-element': null as any},");
    await refusedEverywhere(
      'nu',
      /--radius-element the value null, which is not text/,
    );
    await withOwn('bo', "  tokens: {'--radius-element': true as any},");
    await refusedEverywhere(
      'bo',
      /--radius-element the value true, which is not text/,
    );
  }, 240_000);

  it('judges a value under a computed key before the build drops it', async () => {
    await withOwn('ck', "  tokens: {[`--radius-${'element'}`]: '4px}'},");
    await refusedEverywhere(
      'ck',
      /--radius-element: "4px\}".*cannot be a CSS value/,
    );
  }, 240_000);

  it('names a typography weight given as a number', async () => {
    await withOwn(
      'tw',
      '  typography: {scale: {base: 16, ratio: 1.2}, heading: {weight: 700}},',
    );
    const c = await compile('tw');
    expect(c.status).toBe(1);
    expect(c.stdout + c.stderr).toMatch(
      /typography\.heading\.weight \(line \d+\): a typography weight is a CSS value in quotes.*write '700'/,
    );
  }, 240_000);

  it('judges the tokens a part and onDark set', async () => {
    await withOwn(
      'pn',
      "  components: {button: {base: {'--radius-element': null}}} as any,",
    );
    await refusedEverywhere(
      'pn',
      /components\.button\.base --radius-element \(line \d+\): .*value null, which is not text/,
    );
    await withOwn(
      'pr',
      "  components: {button: {base: {'--radius-element': 'red'}}} as any,",
    );
    await refusedEverywhere(
      'pr',
      /components\.button\.base --radius-element: "red" \(line \d+\): --radius-element is a size/,
    );
    await withOwn(
      'od',
      "  onDark: {tokens: {'--color-accent': 'banana'}} as any,",
    );
    await refusedEverywhere(
      'od',
      /onDark\.tokens --color-accent: "banana" \(line \d+\): --color-accent is a color/,
    );
  }, 240_000);
});
