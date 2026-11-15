// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Part keys the browser drops or Core misreads (a vendor property
 * without its dash, a pseudo name in capitals, something after a
 * pseudo-element, an escaped pseudo name, `--`, an empty key, a block where
 * none nests) are refused by the editor and warned by the build, a family
 * build too, with the member's file; an own custom property that passes on a
 * var() reading nothing is refused; blame follows an imported function's
 * argument, an optional chain and a member inside the imported file; NaN and
 * Infinity get no example; a Promise default export is named as one.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {partKeyProblem} from '../theme/build/style-keys.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

// The assertions are about builds, files and messages, not rendered pages:
// a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;
const T = 240_000;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt186-', FIXTURE_PACKAGES);
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

describe('part keys the browser drops or Core misreads', () => {
  it('names each, and passes the forms that work', () => {
    for (const [key, value, kind, why] of [
      ['msOverflowStyle', 'none', 'style', "so write '-ms-overflow-style'"],
      ['webkit-transform', 'none', 'style', "so write '-webkit-transform'"],
      [':HOVER', {}, 'style', "write ':hover'"],
      ['::before:hover', {}, 'style', "write ':hover::before'"],
      ['::before::after', {}, 'style', 'holds two pseudo-elements'],
      [':hover\\,', {}, 'style', 'a pseudo name "hover," it does not know'],
      ['--', 'red', 'style', '-- is no custom property name'],
      ['', {}, 'style', 'an empty key holds a block'],
      ['', 'red', 'style', 'an empty key holds a value'],
      ['[data-x', {}, 'style', '[data-x holds a block'],
      [':focus', {}, 'pseudo', 'a pseudo key holds properties only'],
      ['@dark', {}, 'mode', '@dark holds a block'],
    ])
      expect(
        partKeyProblem(String(key), value, /** @type {any} */ (kind)),
        String(key),
      ).toContain(why);
    for (const [key, value, kind] of [
      ['-ms-overflow-style', 'none', 'style'],
      ['MsOverflowStyle', 'none', 'style'],
      ['opacity', '1', 'style'],
      [':hover::before', {}, 'style'],
      ['::part(label):hover', {}, 'style'],
      ['::-webkit-scrollbar-thumb:hover', {}, 'style'],
      ['@dark', {}, 'style'],
      [':hover', {}, 'mode'],
      ['--my-value', 'red', 'pseudo'],
    ])
      expect(
        partKeyProblem(String(key), value, /** @type {any} */ (kind)),
        String(key),
      ).toBeNull();
  });

  it(
    'are refused by the editor and warned by theme build, which writes what it wrote before',
    async () => {
      await themeEditNew('k1', {cwd});
      for (const [fields, key, written] of [
        [
          "components: {button: {base: {msOverflowStyle: 'none'}}}",
          'msOverflowStyle',
          'ms-overflow-style: none;',
        ],
        [
          "components: {button: {base: {':HOVER': {color: 'red'}}}}",
          ':HOVER',
          '.astryx-button:HOVER {',
        ],
        [
          "components: {button: {base: {'::before:hover': {color: 'red'}}}}",
          '::before:hover',
          '.astryx-button::before:hover {',
        ],
        ["components: {button: {base: {'--': 'red'}}}", '--', '--: red;'],
        [
          "components: {button: {base: {'[data-x': {color: 'red'}}}}",
          '[data-x',
          '',
        ],
      ]) {
        plain(fields);
        fs.rmSync(path.join(cwd, 'plain/p.css'), {force: true});
        const p = await json(['theme', 'build', 'plain/p.ts']);
        expect(p.status, key).toBe(0);
        expect(JSON.stringify(p.env.data.warnings), key).toContain(
          JSON.stringify(`components.button.base.${key} (line 4): `).slice(
            1,
            -1,
          ),
        );
        if (written)
          expect(
            fs.readFileSync(path.join(cwd, 'plain/p.css'), 'utf8'),
            key,
          ).toContain(written);
        own('k1', fields);
        const e = await compileOwn('k1');
        expect(e.status, key).toBe(1);
        expect(e.env.error, key).toContain('(line 7): ');
      }
      own('k1', "components: {button: {base: {'': {color: 'red'}}}}");
      expect((await compileOwn('k1')).env.error).toContain(
        'an empty key holds a block',
      );
      own(
        'k1',
        "components: {button: {base: {'-ms-overflow-style': 'none', ':hover::before': {color: 'red'}}}}",
      );
      expect((await compileOwn('k1')).status).toBe(0);
    },
    T,
  );
});

describe('a family build with a member key the browser drops', () => {
  it(
    'builds, and warns the key with the member file, never a failed rule split',
    async () => {
      write(
        'fam/ocean.ts',
        "import {defineTheme} from '@astryxdesign/core/theme';\nexport const ocean = defineTheme({name: 'ocean', tokens: {'--color-accent': '#0066cc'}});\n",
      );
      for (const key of [':nth-child(2n', '::before"', ':hover/*']) {
        write(
          'fam/ocean-calm.ts',
          `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean';\nexport default defineTheme({extends: ocean, name: 'ocean-calm',\n  components: {button: {base: {${JSON.stringify(key)}: {color: 'red'}}}}});\n`,
        );
        const r = await json([
          'theme',
          'build',
          '--family',
          'fam/ocean.ts',
          'fam/ocean-calm.ts',
          '--family-key',
          'ocean-family',
        ]);
        expect(r.status, key).toBe(0);
        expect(JSON.stringify(r.env.data.warnings), key).toContain(
          JSON.stringify(
            `fam/ocean-calm.ts: components.button.base.${key} (line 4): `,
          ).slice(1, -1),
        );
        expect(fs.existsSync(path.join(cwd, 'fam/ocean-family.css')), key).toBe(
          true,
        );
        fs.rmSync(path.join(cwd, 'fam/ocean-family.css'), {force: true});
      }
    },
    T,
  );
});

describe('an own custom property that passes on a var() reading nothing', () => {
  it(
    'is refused at the property, on a part and in localTokens',
    async () => {
      await themeEditNew('k4', {cwd});
      for (const [fields, name] of [
        [
          "components: {card: {base: {'--x': 'var(--zzz)', padding: 'var(--x)'}}}",
          '--x',
        ],
        [
          "localTokens: {'--brand': 'var(--zzz)'}, components: {card: {base: {padding: 'var(--brand)'}}}",
          '--brand',
        ],
        ["localTokens: {'--brand': 'var(--button-focus-offset)'}", '--brand'],
      ]) {
        own('k4', fields);
        const r = await compileOwn('k4');
        expect(r.status, fields).toBe(1);
        expect(r.env.error, fields).toContain(
          `${name} passes its value on to what reads it: `,
        );
      }
      for (const fields of [
        "components: {card: {base: {'--x': 'var(--zzz, 4px)', padding: 'var(--x)'}}}",
        "components: {button: {base: {'--x': 'var(--button-focus-offset)', outlineOffset: 'var(--x)'}}}",
        "localTokens: {'--brand': 'var(--color-accent)'}",
      ]) {
        own('k4', fields);
        expect((await compileOwn('k4')).status, fields).toBe(0);
      }
    },
    T,
  );
});

describe('values read from another file through a call, an optional chain or a member there', () => {
  it(
    'blames the file and line that hold the value',
    async () => {
      await themeEditNew('k5', {cwd});
      for (const [shared, imports, fields, where] of [
        [
          "export const make = (c: string) => ({'--color-accent': c});\n",
          "import {make} from './shared';",
          "tokens: make('nope')",
          '(line 7)',
        ],
        [
          "export const all = {toks: {'--color-accent': 'nope'}};\n",
          "import {all} from './shared';",
          'tokens: all?.toks',
          '(in themes/k5/shared.ts, line 1)',
        ],
        [
          "const base = {toks: {'--color-accent': 'nope'}};\nexport const toks = base.toks;\n",
          "import {toks} from './shared';",
          'tokens: toks',
          '(in themes/k5/shared.ts, line 1)',
        ],
      ]) {
        write('themes/k5/shared.ts', shared);
        own('k5', fields, imports);
        const r = await compileOwn('k5');
        expect(r.status, fields).toBe(1);
        expect(r.env.error, fields).toContain(where);
        if (where === '(line 7)')
          expect(r.env.error, fields).toContain(
            'Change it in themes/k5/k5.theme.ts',
          );
      }
    },
    T,
  );
});

describe('a number no CSS value holds', () => {
  it(
    'gets no example made from it',
    async () => {
      await themeEditNew('k12', {cwd});
      for (const fields of [
        "tokens: {'--radius-element': NaN}",
        "tokens: {'--radius-element': 8 / 0}",
        'components: {card: {base: {padding: NaN}}}',
      ]) {
        own('k12', fields);
        const r = await compileOwn('k12');
        expect(r.status, fields).toBe(1);
        expect(r.env.error, fields).not.toMatch(/NaNpx|Infinitypx/);
      }
    },
    T,
  );
});

describe('a default export that is a Promise of a theme', () => {
  it(
    'is named as a Promise, never as a theme without a name',
    async () => {
      write(
        'p/b.ts',
        "import {defineTheme} from '@astryxdesign/core/theme';\nexport default Promise.resolve(defineTheme({name: 'b'}));\n",
      );
      const r = await json(['theme', 'build', 'p/b.ts']);
      expect(r.status).toBe(1);
      expect(r.env.error).toContain('The default export is a Promise');
      expect(r.env.error).not.toContain('must have a name');
    },
    T,
  );
});
