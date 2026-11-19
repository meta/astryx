// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tokens of the theme's own that read each other are refused by the
 * editor; theme build reads var() in any letter case and follows a loop
 * through Core's own token definitions; a null token's warning says what a
 * property reading it does; a misspelled pseudo-class is warned by theme
 * build; a surface token is judged against what that surface sets.
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
  cwd = makeLinkedFixture(
    'astryx-theme-tokens-refused-build-var-',
    FIXTURE_PACKAGES,
  );
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

describe("tokens of the theme's own that read each other", () => {
  it(
    'are refused by the editor, as one that reads itself is',
    async () => {
      await themeEditNew('k31', {cwd});
      own(
        'k31',
        "tokens: {'--a1': 'var(--a2)', '--a2': 'var(--a1)', '--color-accent': 'var(--a1)'}",
      );
      const r = compileOwn('k31');
      expect(r.status).toBe(1);
      expect(r.env.error).toContain(
        '--a1 reads var(--a2), which reads var(--a1)',
      );
    },
    T,
  );
});

describe('theme build reads every var()', () => {
  it(
    'in any letter case, and through the token definitions Core sets on the root',
    () => {
      for (const [fields, why] of [
        [
          "tokens: {'--color-accent': 'VAR(--color-accent)'}",
          '--color-accent reads var(--color-accent), itself',
        ],
        [
          "tokens: {'--a1': 'Var(--a2)', '--a2': 'var(--a1)'}",
          'they read each other',
        ],
        ["tokens: {'--color-accent': 'VAR(--nope)'}", 'which no token sets'],
        [
          "components: {button: {base: {'--x': 'VAR(--x)', color: 'var(--x)'}}}",
          '--x reads var(--x), itself',
        ],
        [
          "tokens: {'--font-size-2xl': 'var(--text-heading-1-size)'}",
          '--font-size-2xl reads var(--text-heading-1-size), which reads var(--font-size-2xl)',
        ],
        [
          "tokens: {'--font-size-base': 'calc(var(--text-body-size) * 1.1)'}",
          'which reads var(--font-size-base)',
        ],
      ]) {
        plain(fields);
        const p = json(['theme', 'build', 'plain/p.ts']);
        expect(p.status, fields).toBe(0);
        expect(JSON.stringify(p.env.data.warnings), fields).toContain(why);
      }
      plain("tokens: {'--text-heading-1-size': 'var(--font-size-3xl)'}");
      expect(
        JSON.stringify(
          json(['theme', 'build', 'plain/p.ts']).env.data.warnings,
        ),
      ).toBe('[]');
    },
    T,
  );
});

describe('a null token', () => {
  it(
    'is warned with what a property reading it does',
    () => {
      plain("tokens: {'--color-text-primary': null} as any");
      const p = json(['theme', 'build', 'plain/p.ts']);
      expect(p.status).toBe(0);
      const warnings = JSON.stringify(p.env.data.warnings);
      expect(warnings).toContain('act as if they were not set');
      expect(warnings).not.toContain('a color reading it is transparent');
    },
    T,
  );
});

describe('a misspelled pseudo-class', () => {
  it(
    'is warned by theme build with the one it is near',
    () => {
      expect(partKeyProblem(':hovr', {}, 'style')).toContain(
        'did you mean :hover?',
      );
      expect(partKeyProblem(':HOVR', {}, 'style')).toContain(
        'did you mean :hover?',
      );
      expect(partKeyProblem(':focus-visble', {}, 'style')).toContain(
        'did you mean :focus-visible?',
      );
      expect(partKeyProblem(':dissabled', {}, 'style')).toContain(
        'did you mean :disabled?',
      );
      for (const key of [
        ':hover',
        ':focus-visible',
        ':nth-child(2n)',
        ':-moz-focusring',
      ])
        expect(partKeyProblem(key, {}, 'style'), key).toBeNull();
      plain("components: {button: {base: {':hovr': {color: 'red'}}}}");
      const p = json(['theme', 'build', 'plain/p.ts']);
      expect(p.status).toBe(0);
      expect(JSON.stringify(p.env.data.warnings)).toContain(
        'components.button.base.:hovr (line 4): ',
      );
    },
    T,
  );
});

describe('a surface token', () => {
  it(
    'is judged against what that surface sets, never the page',
    async () => {
      await themeEditNew('k11', {cwd});
      own(
        'k11',
        "tokens: {'--color-text-primary': 'var(--color-accent)'}, onDark: {tokens: {'--color-accent': 'var(--color-text-primary)'}}",
      );
      expect(compileOwn('k11').status).toBe(0);
      own(
        'k11',
        "onDark: {tokens: {'--color-accent': 'var(--color-text-primary)', '--color-text-primary': 'var(--color-accent)'}}",
      );
      expect(compileOwn('k11').status).toBe(1);
    },
    T,
  );
});
