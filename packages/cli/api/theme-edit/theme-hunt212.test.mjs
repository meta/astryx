// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A child theme's own build names the file and line of a value the
 * theme it extends writes; custom properties that read each other (a token
 * with a fallback, two tokens, a pair half, tokens and local tokens, a
 * part's own) are warned by theme build and refused by the editor; the
 * pseudo-element table takes ::search-text and ::scroll-marker-group, and a
 * pseudo-element in a selector list, an unknown one or a pseudo-class after
 * ::highlight() is named; a misspelled vendor property is refused; blame
 * follows array and nested destructuring; dash-first and three-dash token
 * names and an empty token are warned.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
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

/** @type {string} */
let cwd;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);
const T = 240_000;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt212-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string[]} args */
const json = args => {
  const r = spawnSync(process.execPath, [BIN, '--json', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
  });
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

describe('a value the theme a child extends writes', () => {
  it(
    "is named at that theme's file and line in the child's own build",
    () => {
      write(
        'fam/ocean.ts',
        "import {defineTheme} from '@astryxdesign/core/theme';\nexport const ocean = defineTheme({name: 'ocean', tokens: {'--color-accent': null} as any, components: {card: {base: {':HOVER': {color: 'red'}}}}});\n",
      );
      write(
        'fam/ocean-calm.ts',
        "import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean';\nexport default defineTheme({extends: ocean, name: 'ocean-calm'});\n",
      );
      const r = json(['theme', 'build', 'fam/ocean-calm.ts']);
      expect(r.status).toBe(0);
      const warnings = JSON.stringify(r.env.data.warnings);
      expect(warnings).toContain(
        'tokens.--color-accent (in fam/ocean.ts, line 2, the theme it extends)',
      );
      expect(warnings).toContain(
        'components.card.base.:HOVER (in fam/ocean.ts, line 2, the theme it extends)',
      );
    },
    T,
  );
});

describe('custom properties that read each other', () => {
  it(
    'are warned at their line by theme build and refused by the editor',
    async () => {
      await themeEditNew('k3', {cwd});
      for (const [fields, why, editor] of [
        [
          "tokens: {'--color-accent': 'var(--color-accent, red)'}",
          '--color-accent reads var(--color-accent), itself',
          true,
        ],
        [
          "tokens: {'--color-accent': 'var(--color-text-primary)', '--color-text-primary': 'var(--color-accent)'}",
          'they read each other',
          true,
        ],
        [
          "tokens: {'--color-accent': ['var(--color-accent)', '#000']}",
          '--color-accent reads var(--color-accent), itself',
          true,
        ],
        [
          "tokens: {'--color-accent': 'var(--brand)'}, localTokens: {'--brand': 'var(--color-accent)'}",
          'they read each other',
          true,
        ],
        [
          "components: {button: {base: {'--x': 'var(--x)', color: 'var(--x)'}}}",
          '--x reads var(--x), itself',
          true,
        ],
      ]) {
        plain(String(fields));
        const p = json(['theme', 'build', 'plain/p.ts']);
        expect(p.status, String(fields)).toBe(0);
        expect(JSON.stringify(p.env.data.warnings), String(fields)).toContain(
          JSON.stringify(why).slice(1, -1),
        );
        if (editor) {
          own('k3', String(fields));
          expect(compileOwn('k3').status, String(fields)).toBe(1);
        }
      }
      plain(
        "tokens: {'--color-accent': 'var(--brand, red)'}, localTokens: {'--brand': 'var(--color-text-primary)'}",
      );
      expect(
        JSON.stringify(
          json(['theme', 'build', 'plain/p.ts']).env.data.warnings,
        ),
      ).toBe('[]');
    },
    T,
  );
});

describe('pseudo-elements', () => {
  it('passes the ones browsers keep, and names the ones they drop', () => {
    for (const key of [
      '::search-text:current',
      '::scroll-marker-group:hover',
      '::scroll-marker-group:focus-within',
      '::part(label):hover',
    ])
      expect(partKeyProblem(key, {}, 'style'), key).toBeNull();
    for (const [key, why] of [
      [':is(::before)', 'puts ::before inside :is()'],
      [':where(::after)', 'puts ::after inside :where()'],
      [':not(::before)', '(the browser drops it)'],
      [':has(::before)', '(the browser drops it)'],
      ['::highlight(x):hover', 'which takes only :window-inactive after it'],
      ['::nopey', 'names ::nopey, a pseudo-element no browser knows'],
      ['::befor', 'did you mean ::before?'],
    ])
      expect(partKeyProblem(key, {}, 'style'), key).toContain(why);
  });

  it(
    'that no browser knows are warned by theme build and refused by the editor',
    async () => {
      await themeEditNew('k37', {cwd});
      const fields =
        "components: {button: {base: {'::nopey': {color: 'red'}}}}";
      plain(fields);
      const p = json(['theme', 'build', 'plain/p.ts']);
      expect(p.status).toBe(0);
      expect(JSON.stringify(p.env.data.warnings)).toContain(
        'a pseudo-element no browser knows',
      );
      own('k37', fields);
      expect(compileOwn('k37').status).toBe(1);
    },
    T,
  );
});

describe('a misspelled vendor property', () => {
  it(
    'is refused with the vendor property it is near, and a known one builds',
    async () => {
      await themeEditNew('k8', {cwd});
      for (const [key, near] of [
        ["'-webkit-line-clmap': '2'", "did you mean '-webkit-line-clamp'?"],
        ["WebkitApperance: 'none'", "did you mean '-webkit-appearance'?"],
        ["'-webkit-nope': 'x'", 'is no vendor property a browser knows'],
      ]) {
        own('k8', `components: {button: {base: {${key}}}}`);
        const r = compileOwn('k8');
        expect(r.status, key).toBe(1);
        expect(r.env.error, key).toContain(near);
      }
      own(
        'k8',
        "components: {button: {base: {'-webkit-line-clamp': '2', WebkitAppearance: 'none'}}}",
      );
      expect(compileOwn('k8').status).toBe(0);
    },
    T,
  );
});

describe('values read from another file through array and nested destructuring', () => {
  it(
    'blame the file and line that hold the value',
    async () => {
      await themeEditNew('k9', {cwd});
      for (const [shared, imports, fields] of [
        [
          "export const arr = [['#fff', 'nope']];\n",
          "import {arr} from './shared';\nconst [first] = arr;",
          "tokens: {'--color-accent': first[1]}",
        ],
        [
          "export const arr = [['#fff', 'nope']];\n",
          "import {arr} from './shared';\nconst [[, x]] = arr;",
          "tokens: {'--color-accent': x}",
        ],
        [
          "export const cs = {a: {b: 'nope'}};\n",
          "import {cs} from './shared';\nconst {a: {b}} = cs;",
          "tokens: {'--color-accent': b}",
        ],
      ]) {
        write('themes/k9/shared.ts', shared);
        own('k9', fields, imports);
        const r = compileOwn('k9');
        expect(r.status, fields).toBe(1);
        expect(r.env.error, fields).toContain(
          '(in themes/k9/shared.ts, line 1)',
        );
      }
    },
    T,
  );
});

describe('token names and values that set no token', () => {
  it(
    'are warned at their line by theme build, which writes what it wrote before',
    () => {
      for (const [fields, why] of [
        ["tokens: {'-color-accent': 'red'}", '-color-accent is no token name'],
        [
          "tokens: {'---color-border': 'red'}",
          '---color-border starts with three dashes',
        ],
        [
          "tokens: {'--color-text-accent': ''}",
          '--color-text-accent holds an empty value',
        ],
      ]) {
        plain(fields);
        const p = json(['theme', 'build', 'plain/p.ts']);
        expect(p.status, fields).toBe(0);
        expect(JSON.stringify(p.env.data.warnings), fields).toContain(why);
      }
    },
    T,
  );
});
