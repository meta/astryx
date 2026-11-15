// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A pseudo-class after an element-backed pseudo-element builds; only
 * :hover and :active in capitals are named; a property that builds
 * dash-first without a vendor prefix is refused (warned in the build); a
 * value Core writes as it is but no browser reads (an object, a pair with a
 * missing half, a token that reads itself or a var() no token sets) is
 * warned at its line; a value from the theme a file extends is not blamed on
 * that file, and a family names it once; Core's own private copies in a
 * spread token map are no write; blame follows an array element, a template,
 * a choice, a global call and a dynamic import.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {partKeyProblem} from '../theme/build/style-keys.mjs';
import {derivedPrivateCopies} from '../../foundation/config/theme-private-vars.mjs';
import {defineTheme} from '@astryxdesign/core/theme';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;
const T = 240_000;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt199-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

// The real program, in process: no Node start per command.
/** @param {string[]} args */
const json = async args => {
  const r = await runCli(['--json', ...args], {cwd});
  return {status: r.status, env: JSON.parse(r.stdout)};
};
/** @param {string} file @param {string[]} [more] */
const compile = (file, more = []) =>
  json(['experimental', 'theme', 'compile', file, ...more]);
/** @param {string} rel @param {string} text */
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(cwd, rel)), {recursive: true});
  fs.writeFileSync(path.join(cwd, rel), text);
};
/** A plain theme whose defineTheme input holds `fields` on line 4. @param {string} fields */
const plain = fields =>
  write(
    'plain/p.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';\nexport const pTheme = defineTheme({\n  name: 'p',\n  ${fields},\n});\n`,
  );
/** An editor theme's own source, its fields on line 7. @param {string} slug @param {string} fields @param {string} [imports] */
const own = (slug, fields, imports = '') =>
  write(
    `themes/${slug}/${slug}.theme.ts`,
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\n${imports}\nexport const ${slug}Theme = defineTheme({\n  extends: ${slug}Settings,\n  name: '${slug}',\n  ${fields},\n});\n`,
  );
/** @param {string} slug */
const compileOwn = slug => compile(`themes/${slug}/${slug}.theme.ts`);

describe('pseudo keys and property names', () => {
  it('passes what the browser keeps, and names what it drops', () => {
    for (const key of [
      '::file-selector-button:hover',
      '::details-content:hover',
      '::selection:window-inactive',
      '::scroll-marker:target-current',
      '::BEFORE',
      ':FOCUS',
      ':Focus-Visible',
    ])
      expect(partKeyProblem(key, {}, 'style'), key).toBeNull();
    expect(partKeyProblem(':HOVER', {}, 'style')).toContain("write ':hover'");
    expect(partKeyProblem(':Active', {}, 'style')).toContain("write ':active'");
    expect(partKeyProblem('::before:hover', {}, 'style')).toContain(
      'which takes no pseudo-class after it',
    );
    expect(partKeyProblem('::selection:hover', {}, 'style')).toContain(
      'which takes only :window-inactive after it',
    );
    for (const [key, why] of [
      ['Color', 'such as color'],
      ['BACKGROUND', 'such as background'],
      ['-webkit-', 'a property no browser reads'],
      ['-Webkit-Transform', 'a property no browser reads'],
    ])
      expect(partKeyProblem(key, 'red', 'style'), key).toContain(why);
    for (const key of ['WebkitTransform', '-webkit-transform', 'MozAppearance'])
      expect(partKeyProblem(key, 'none', 'style'), key).toBeNull();
  });

  it(
    'refuses a capitalized property in the editor and warns it in theme build',
    async () => {
      await themeEditNew('k15', {cwd});
      const fields = "components: {button: {base: {Color: 'red'}}}";
      plain(fields);
      const p = await json(['theme', 'build', 'plain/p.ts']);
      expect(p.status).toBe(0);
      expect(JSON.stringify(p.env.data.warnings)).toContain(
        'components.button.base.Color (line 4): Color builds -color',
      );
      own('k15', fields);
      const e = await compileOwn('k15');
      expect(e.status).toBe(1);
      expect(e.env.error).toContain('Color builds -color');
      own(
        'k15',
        "components: {button: {base: {'::file-selector-button:hover': {color: 'red'}, ':FOCUS': {color: 'blue'}}}}",
      );
      expect((await compileOwn('k15')).status).toBe(0);
    },
    T,
  );
});

describe('values the build writes as they are but no browser reads', () => {
  it(
    'are warned at their line by theme build, which writes what it wrote before',
    async () => {
      for (const [fields, why, written] of [
        [
          "tokens: {'--color-accent': ['#f00', undefined]} as any",
          '--color-accent gives no dark half',
          'light-dark(#f00, undefined)',
        ],
        [
          "tokens: {'--color-accent': {light: '#f00', dark: '#0f0'}} as any",
          '--color-accent holds an object',
          '[object Object]',
        ],
        [
          "tokens: {'--color-accent': true} as any",
          '--color-accent holds true',
          '--color-accent: true',
        ],
        [
          "components: {button: {base: {color: ['#f00', '#0f0']}}} as any",
          'color holds an array',
          'color: ["#f00","#0f0"]',
        ],
        [
          "tokens: {'--color-accent': 'var(--color-accent)'}",
          '--color-accent reads var(--color-accent), itself',
          '--color-accent: var(--color-accent)',
        ],
        [
          "tokens: {'--color-accent': 'var(--color-nope)'}",
          'which no token sets',
          '--color-accent: var(--color-nope)',
        ],
        [
          "tokens: {'--spacing-4': NaN} as any",
          '--spacing-4 holds NaN',
          '--spacing-4: NaN',
        ],
      ]) {
        plain(fields);
        fs.rmSync(path.join(cwd, 'plain/p.css'), {force: true});
        const p = await json(['theme', 'build', 'plain/p.ts']);
        expect(p.status, fields).toBe(0);
        expect(JSON.stringify(p.env.data.warnings), fields).toContain(
          '(line 4): ',
        );
        expect(JSON.stringify(p.env.data.warnings), fields).toContain(
          JSON.stringify(why).slice(1, -1),
        );
        expect(
          fs.readFileSync(path.join(cwd, 'plain/p.css'), 'utf8'),
          fields,
        ).toContain(written);
      }
      plain(
        "tokens: {'--color-accent': 'var(--color-text-primary)', '--x': 'var(--zzz, red)'}",
      );
      expect(
        JSON.stringify(
          (await json(['theme', 'build', 'plain/p.ts'])).env.data.warnings,
        ),
      ).toBe('[]');
    },
    T,
  );
});

describe('a value the theme it extends gives', () => {
  it(
    'is not given a line of the file that extends it, and a family names it once',
    async () => {
      write(
        'fam/ocean.ts',
        "import {defineTheme} from '@astryxdesign/core/theme';\nexport const ocean = defineTheme({name: 'ocean', tokens: {'--color-accent': null} as any});\n",
      );
      write(
        'fam/ocean-calm.ts',
        "import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean';\nexport default defineTheme({extends: ocean, name: 'ocean-calm'});\n",
      );
      const single = await json(['theme', 'build', 'fam/ocean-calm.ts']);
      expect(single.status).toBe(0);
      expect(JSON.stringify(single.env.data.warnings)).toContain(
        'tokens.--color-accent (in fam/ocean.ts, line 2, the theme it extends)',
      );
      const family = await json([
        'theme',
        'build',
        '--family',
        'fam/ocean.ts',
        'fam/ocean-calm.ts',
        '--family-key',
        'ocean-family',
      ]);
      expect(family.status).toBe(0);
      const nulls = family.env.data.warnings.filter((/** @type {string} */ w) =>
        w.includes('--color-accent holds null'),
      );
      expect(nulls).toEqual([
        expect.stringContaining('fam/ocean.ts: tokens.--color-accent (line 2)'),
      ]);
    },
    T,
  );
});

describe("Core's own private copies in a spread token map", () => {
  it('are no write of the author, and another private one names the spread', async () => {
    const spread = defineTheme({
      name: 'base',
      tokens: {'--duration-fast': '90ms'},
    }).tokens;
    const copies = derivedPrivateCopies(spread, defineTheme);
    expect([...copies]).toEqual(['--_astryx-pre-tempo-duration-fast']);
    const {validatePrivateVars} =
      await import('../../foundation/config/theme-private-vars.mjs');
    expect(
      validatePrivateVars(
        {name: 'p', tokens: {...spread, '--color-accent': 'red'}},
        {defineTheme},
      ),
    ).toEqual([]);
    expect(
      validatePrivateVars(
        {name: 'p', tokens: {...spread, '--_astryx-motion-tempo': '1'}},
        {defineTheme},
      ),
    ).toEqual([
      expect.stringContaining(
        'the map is spread from one, so spread only the tokens you change, or extend that theme with extends',
      ),
    ]);
    expect(
      validatePrivateVars({name: 'p', tokens: {'--_x': '1'}}, {defineTheme}),
    ).toEqual([expect.stringContaining('sets private var "--_x"')]);
  });
});

describe('values read from another file through an element, a template, a choice or a call', () => {
  it(
    'blame the file and line that hold the value',
    async () => {
      await themeEditNew('k3', {cwd});
      for (const [shared, imports, fields] of [
        [
          "export const cs = ['#fff', 'nope'];\n",
          "import {cs} from './shared';",
          "tokens: {'--color-accent': cs[1]}",
        ],
        [
          "export const c = 'nope';\n",
          "import {c} from './shared';",
          "tokens: {'--color-accent': `${c}`}",
        ],
        [
          "export const c = 'nope';\n",
          "import * as B from './shared';",
          "tokens: {'--color-accent': B.c ? B.c : '#fff'}",
        ],
        [
          "export const c = 'nope';\n",
          "import * as B from './shared';",
          "tokens: {'--color-accent': String(B.c)}",
        ],
        [
          "export const toks = {'--color-accent': 'nope'};\n",
          "const {toks} = await import('./shared');",
          'tokens: toks',
        ],
      ]) {
        write('themes/k3/shared.ts', shared);
        own('k3', fields, imports);
        const r = await compileOwn('k3');
        expect(r.status, fields).toBe(1);
        expect(r.env.error, fields).toContain(
          '(in themes/k3/shared.ts, line 1)',
        );
      }
    },
    T,
  );
});
