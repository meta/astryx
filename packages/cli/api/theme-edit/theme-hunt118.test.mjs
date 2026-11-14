// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The own-token check judges every token the source gives, a design
 * token or the theme's own, and a part's CSS properties: a BigInt or a
 * symbol is named as it is, undefined is not set, null or a number with no
 * unit is no text, and a var() reads the custom properties the theme sets.
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
  cwd = makeLinkedFixture('astryx-theme-hunt118-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * A new theme whose own source gives these lines after its name.
 * @param {string} slug @param {string} lines @param {string} [head]
 */
const withOwn = async (slug, lines, head = '') => {
  await themeEditNew(slug, {cwd});
  const ts = path.join(cwd, 'themes', slug, `${slug}.theme.ts`);
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

/** @param {string} slug @param {RegExp} what */
const refused = async (slug, what) => {
  const c = await compile(slug);
  expect(c.status, `compile ${slug}`).toBe(1);
  expect(c.stdout + c.stderr, `compile ${slug}`).toMatch(what);
  expect(c.stdout + c.stderr).not.toMatch(/ERR_UNKNOWN|TypeError/);
  const s = await refusal(() => themeEditShow(slug, {cwd}));
  expect(s.message, `show ${slug}`).toMatch(what);
};

/** @param {string} slug */
const accepted = async slug => {
  expect((await compile(slug)).status, `compile ${slug}`).toBe(0);
  await themeEditShow(slug, {cwd});
};

describe('every token and part property the source gives is judged', () => {
  it('names a BigInt and a symbol as they are', async () => {
    await withOwn('bi', "  tokens: {'--radius-element': 3n as any},");
    await refused('bi', /--radius-element the value 3n, which is not text/);
    await withOwn('sy', "  tokens: {'--radius-element': Symbol('x') as any},");
    await refused(
      'sy',
      /--radius-element the value Symbol\(x\), which is not text/,
    );
  }, 240_000);

  it('takes an undefined page token as not set, and names one a part rule would write', async () => {
    await withOwn(
      'un',
      "  tokens: {'--radius-element': narrow ? '2px' : undefined, '--spacing-1': '5px'},",
      'const narrow = false;\n',
    );
    await accepted('un');
    // In a part's rule the build writes the text `undefined`.
    await withOwn(
      'us',
      "  components: {button: {base: {'--radius-element': undefined}}} as any,",
    );
    await refused(
      'us',
      /components\.button\.base --radius-element \(line \d+\): .*writes as the text undefined/,
    );
  }, 240_000);

  it("refuses a theme's own token or a part property that is no text", async () => {
    await withOwn(
      'ct',
      "  tokens: {'--my-brand': null as any, '--my-size': 4 as any},",
    );
    await refused('ct', /--my-brand the value null, which is not text/);
    await withOwn(
      'pp',
      '  components: {button: {base: {borderRadius: null, padding: 4}}} as any,',
    );
    await refused(
      'pp',
      /components\.button\.base border-radius \(line \d+\): .*value null, which is not text/,
    );
    await refused(
      'pp',
      /components\.button\.base padding \(line \d+\): .*the number 4/,
    );
    await withOwn(
      'op',
      '  components: {button: {base: {opacity: 0.5}}} as any,',
    );
    await accepted('op');
  }, 240_000);

  it("reads the theme's own custom properties in a var()", async () => {
    await withOwn(
      'ov',
      "  tokens: {'--brand': '#0a7d55', '--color-accent': 'var(--brand)'},",
    );
    await accepted('ov');
  }, 240_000);
});
