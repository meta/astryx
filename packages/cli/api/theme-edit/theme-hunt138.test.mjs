// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The own-value check names what a theme's own source misspells or
 * misplaces, each with its line: a field defineTheme (or onDark) does not
 * take, a tokens key one typo from a design token, a pseudo-class or a part
 * variable no browser or part reads, typography fields and heading levels
 * Core does not read, an unknown component, a part's family list, a var()
 * of the wrong kind inside a token's function, a theme the export extends
 * from another file, and a path Core itself refuses.
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
  cwd = makeLinkedFixture('astryx-theme-hunt138-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * A new theme whose own source gives these lines after its name.
 * @param {string} slug @param {string} lines @param {string} [before] code before the export
 */
const withOwn = async (slug, lines, before = '') => {
  await themeEditNew(slug, {cwd});
  const ts = path.join(cwd, 'themes', slug, `${slug}.theme.ts`);
  const src = fs.readFileSync(ts, 'utf8');
  fs.writeFileSync(
    ts,
    src
      .replace(`name: '${slug}',`, `name: '${slug}',\n${lines}`)
      .replace(/^(export )/m, `${before}$1`),
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
  const c = await compile(slug);
  expect(c.status, `compile ${slug}: ${c.stdout}${c.stderr}`).toBe(0);
  await themeEditShow(slug, {cwd});
};

describe('a field the block does not take', () => {
  it('names a misspelled defineTheme or onDark field with its line and the field meant', async () => {
    await withOwn('fa', "  component: {button: {base: {color: 'red'}}},");
    await refused(
      'fa',
      /component \(line \d+\): component is no field defineTheme takes, so the build reads nothing from it; did you mean components\?/,
    );
    await withOwn('fb', "  onDark: {tokenz: {'--color-accent': '#ff0000'}},");
    await refused(
      'fb',
      /onDark tokenz \(line \d+\): tokenz is no field onDark takes.*did you mean tokens\?/,
    );
    await withOwn('fc', "  onDark: {tokens: {'--color-accent': '#ff0000'}},");
    await accepted('fc');
  }, 240_000);
});

describe('a tokens key one typo from a design token', () => {
  it('is refused with the token meant, pointing own properties to localTokens', async () => {
    await withOwn('ta', "  tokens: {'--color-acent': '#ff0000'},");
    await refused(
      'ta',
      /--color-acent.*is not a design token.*did you mean --color-accent\? A custom property of the theme's own goes in localTokens/,
    );
    await withOwn('tb', "  localTokens: {'--brand-accent': '#ff0000'},");
    await accepted('tb');
  }, 240_000);
});

describe("a part's keys", () => {
  it('names a misspelled pseudo-class and takes one a browser knows', async () => {
    await withOwn(
      'pa',
      "  components: {button: {base: {':hovr': {backgroundColor: 'red'}}}},",
    );
    await refused(
      'pa',
      /components\.button\.base :hovr \(line \d+\): :hovr is no pseudo-class a browser knows.*did you mean :hover\?/,
    );
    await withOwn(
      'pb',
      "  components: {button: {base: {':checked': {backgroundColor: 'red'}, ':focus-visible': {color: 'red'}}}},",
    );
    await accepted('pb');
    // Pseudo-classes browsers ship that are new to the selectors list, and
    // a name near no known one, are the author's own call.
    await withOwn(
      'pc',
      "  components: {button: {base: {':active-view-transition': {color: 'red'}, ':target-current': {color: 'blue'}, ':zzqq-state': {color: 'green'}}}},",
    );
    await accepted('pc');
  }, 240_000);

  it("names a variable the part does not read, and judges one it reads by its default's kind", async () => {
    await withOwn(
      'va',
      "  components: {button: {base: {'--button-focus-ofset': '4px'}}},",
    );
    await refused(
      'va',
      /--button-focus-ofset is no variable button reads.*did you mean --button-focus-offset\?/,
    );
    await withOwn(
      'vb',
      "  components: {button: {base: {'--button-focus-offset': 'red'}}},",
    );
    await refused(
      'vb',
      /--button-focus-offset defaults to var\(--focus-outline-offset\), so it takes what --focus-outline-offset takes/,
    );
    await withOwn(
      'vc',
      "  components: {button: {base: {'--button-focus-offset': '3px'}}},",
    );
    await accepted('vc');
    // A part-prefixed helper the same block reads is the theme's own, even
    // one a typo from a variable the part reads.
    await withOwn(
      'vd',
      "  components: {button: {base: {'--button-brand-gap': '6px', gap: 'var(--button-brand-gap)', '--button-focus-ofset': '2px', outlineOffset: 'var(--button-focus-ofset)'}}},",
    );
    await accepted('vd');
  }, 240_000);

  it("reads a part's font-family as set reads it", async () => {
    await withOwn(
      'ff',
      "  components: {button: {base: {fontFamily: 'Lora sans-serif'}}},",
    );
    await refused(
      'ff',
      /components\.button\.base font-family: "Lora sans-serif" \(line \d+\): .*names a family that exists nowhere: a comma goes before the generic family sans-serif/,
    );
    await withOwn(
      'fg',
      "  components: {button: {base: {fontFamily: 'Lora, serif'}}},",
    );
    await accepted('fg');
    // The families a `font` shorthand names last are read the same way.
    await withOwn(
      'fh',
      "  components: {button: {base: {font: '600 16px/1.4 Lora sans-serif'}}},",
    );
    await refused(
      'fh',
      /components\.button\.base font: "600 16px\/1\.4 Lora sans-serif" \(line \d+\): font names the families "Lora sans-serif" last, read as font-family: .*a comma goes before the generic family sans-serif/,
    );
    await withOwn(
      'fi',
      '  components: {button: {base: {font: \'600 16px Lora, "serif"\'}}},',
    );
    await refused(
      'fi',
      /font names the families "Lora, "serif"" last.*quotes a generic family/,
    );
    await withOwn(
      'fj',
      "  components: {button: {base: {font: '600 16px/1.4 Lora, serif'}}},",
    );
    await accepted('fj');
  }, 240_000);

  it("reads a var() of the theme's own property as the text it holds", async () => {
    await withOwn(
      'lk',
      "  localTokens: {'--brand-x': '12px'},\n  components: {card: {base: {backgroundColor: 'var(--brand-x)'}}},",
    );
    await refused(
      'lk',
      /background-color does not take "12px", which --brand-x holds/,
    );
    await withOwn(
      'll',
      "  localTokens: {'--brand-x': '#0a7'},\n  components: {card: {base: {backgroundColor: 'var(--brand-x)'}}},",
    );
    await accepted('ll');
  }, 240_000);
});

describe('the components map', () => {
  it('names an unknown component, a part named by its class, and a style key that holds no block', async () => {
    await withOwn('ca', "  components: {cardd: {base: {color: 'red'}}},");
    await refused(
      'ca',
      /components cardd \(line \d+\): cardd is no component Core themes.*did you mean card\?/,
    );
    await withOwn(
      'cb',
      "  components: {'.astryx-card': {base: {color: 'red'}}},",
    );
    await refused(
      'cb',
      /\.astryx-card is no component Core themes.*the components map names a part by its key: card/,
    );
    await withOwn('cc', "  components: {card: {color: 'red'}},");
    await refused(
      'cc',
      /components\.card color \(line \d+\): card's entries are style keys .* write it inside a style key, such as base: \{color: "red"\}/,
    );
  }, 240_000);
});

describe('typography', () => {
  it('names a field, a role and a heading level Core does not read, and a scale with no ratio', async () => {
    await withOwn('ya', "  typography: {body: {famly: 'Lora'}},");
    await refused(
      'ya',
      /typography\.body\.famly \(line \d+\): famly is no field typography\.body takes \(family, fallbacks, weight, weights\).*did you mean family\?/,
    );
    await withOwn(
      'yb',
      "  typography: {scale: {base: 16, ratio: 1.2}, heading: {weights: {7: 'bold'}}},",
    );
    await refused(
      'yb',
      /typography\.heading\.weights\.7 \(line \d+\): 7 is no heading level: Core reads weights for levels 1, 2, 3, 4, 5, 6/,
    );
    await withOwn('yc', '  typography: {scale: {base: 16, ratoi: 1.25}},');
    const s = await refused(
      'yc',
      /ratoi is no field typography\.scale takes \(base, ratio\).*did you mean ratio\?/,
    );
    expect(s.message).not.toMatch(/NaN/);
    await withOwn('yd', '  typography: {scale: {base: 16}},');
    await refused(
      'yd',
      /the type scale is given no ratio.*add the step between sizes/,
    );
  }, 240_000);

  it('names the fallbacks when they are what a family token refuses', async () => {
    await withOwn(
      'ye',
      "  typography: {body: {family: 'Lora', fallbacks: 'Georgia serif'}},",
    );
    await refused(
      'ye',
      /typography\.body\.fallbacks \(builds --font-family-body\)/,
    );
  }, 240_000);
});

describe("a var() inside a token's function", () => {
  it('is judged by the kind of the place it sits in, in the source and in set', async () => {
    await withOwn(
      'ka',
      "  tokens: {'--color-accent': 'color-mix(in srgb, var(--radius-element) 50%, red)'},",
    );
    await refused(
      'ka',
      /--radius-element sits where a color goes, and --radius-element is a size/,
    );
    await withOwn('kb', '');
    const s = await refusal(() =>
      themeEditSet('kb', '--spacing-4', 'calc(var(--color-accent) * 2)', {
        cwd,
      }),
    );
    expect(s.message).toMatch(
      /--color-accent sits where a size goes, and --color-accent is a color/,
    );
    // A size in a shadow's last length is its spread: a shadow the browser
    // takes.
    await withOwn(
      'kc',
      "  tokens: {'--shadow-low': '0 1px 2px var(--spacing-4)'},",
    );
    await accepted('kc');
  }, 240_000);
});

describe('where a value is', () => {
  it('names the file and line of a theme the export extends from another file', async () => {
    await themeEditNew('ma', {cwd});
    const dir = path.join(cwd, 'themes', 'ma');
    fs.writeFileSync(
      path.join(dir, 'mid.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {maSettings} from './ma.settings';\nexport const mid = defineTheme({extends: maSettings, name: 'mid', tokens: {'--color-accent': 'nope'}});\n",
    );
    const ts = path.join(dir, 'ma.theme.ts');
    fs.writeFileSync(
      ts,
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {mid} from './mid';\nexport const maTheme = defineTheme({extends: mid, name: 'ma'});\n",
    );
    const s = await refused(
      'ma',
      /theme 'mid' tokens --color-accent: "nope" \(in themes\/ma\/mid\.ts, line 3\)/,
    );
    expect(s.message).toMatch(/Change it in themes\/ma\/mid\.ts/);
  }, 240_000);

  it("names the line of a path Core refuses, and gives no import hint for Core's own refusal", async () => {
    await withOwn(
      'cv',
      "  adaptations: {rules: [{when: {pointr: 'coarse'}, value: {tokens: {'--spacing-4': '1rem'}}}]},",
    );
    await refused(
      'cv',
      /adaptations\.rules\[0\]\.when\.pointr \(line \d+\): Core refuses the theme: adaptations\.rules\[0\]\.when\.pointr is not supported/,
    );
    await withOwn('cw', "  localTokens: {brand: 'red'} as any,");
    const c = await compile('cw');
    expect(c.status).toBe(1);
    // Core names the local token: the refusal names it at its line.
    expect(c.stdout + c.stderr).toMatch(
      /localTokens\.brand \(line \d+\): Core refuses the theme: .*must be a valid CSS custom-property name/,
    );
    expect(c.stdout + c.stderr).not.toMatch(
      /imports in the theme file are resolvable/,
    );
  }, 240_000);
});
