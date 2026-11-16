// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A surface token that loops through the tokens Core sets on that
 * surface is refused by the editor and warned once by theme build; theme
 * build warns a field defineTheme() does not take; and it warns, never
 * fails on, a BigInt, a function or a Date, naming what it writes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-k41-values-', FIXTURE_PACKAGES);
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

describe("a surface token that loops through Core's own surface tokens", () => {
  it(
    'is refused by the editor and warned once, at its line, by theme build',
    async () => {
      await themeEditNew('k3', {cwd});
      const fields =
        "onDark: {tokens: {'--color-on-dark': 'var(--color-text-primary)'}}";
      own('k3', fields);
      const e = compileOwn('k3');
      expect(e.status).toBe(1);
      expect(e.env.error).toContain(
        '--color-on-dark would read itself through --color-text-primary',
      );
      plain(fields);
      const p = json(['theme', 'build', 'plain/p.ts']);
      expect(p.status).toBe(0);
      const warnings = p.env.data.warnings;
      expect(warnings).toEqual([
        expect.stringMatching(/^onDark\.tokens\.--color-on-dark \(line 4\): /),
      ]);
      expect(JSON.stringify(warnings)).not.toContain('the theme it extends');
    },
    T,
  );
});

describe('a field defineTheme() does not take', () => {
  it(
    'is warned by theme build at its line, with the field it is near',
    () => {
      for (const [fields, why] of [
        [
          "component: {button: {base: {color: 'red'}}}",
          'component (line 4): component is no field defineTheme takes, so the build reads nothing from it; did you mean components?',
        ],
        ["tokenz: {'--color-accent': '#ff0000'}", 'did you mean tokens?'],
        ["Tokens: {'--color-accent': '#ff0000'}", 'did you mean tokens?'],
        [
          "ondark: {tokens: {'--color-accent': '#ff0000'}}",
          'did you mean onDark?',
        ],
        [
          "onDark: {localTokens: {'--brand': '#ff0000'}}",
          'onDark.localTokens (line 4): localTokens is no field onDark takes',
        ],
        [
          "typography: {fontFamly: {body: 'Lato'}}",
          'typography.fontFamly (line 4): fontFamly is no field typography takes',
        ],
        [
          "typography: {body: {fontFamily: 'Lato, sans-serif'}}",
          'typography.body.fontFamily (line 4): fontFamily is no field typography.body takes',
        ],
      ]) {
        plain(fields);
        const p = json(['theme', 'build', 'plain/p.ts']);
        expect(p.status, fields).toBe(0);
        expect(JSON.stringify(p.env.data.warnings), fields).toContain(why);
      }
      plain(
        "components: {button: {base: {color: 'red'}}}, onDark: {tokens: {'--color-accent': '#fff'}}, typography: {body: {family: 'Lato', fallbacks: 'sans-serif'}}",
      );
      expect(json(['theme', 'build', 'plain/p.ts']).env.data.warnings).toEqual(
        [],
      );
    },
    T,
  );
});

describe('a BigInt, a function or a Date', () => {
  it(
    'is warned by theme build with what it writes, and the build ends',
    () => {
      for (const [fields, why, css] of [
        [
          "tokens: {'--radius-element': 10n as any}",
          '--radius-element holds 10n, a BigInt, which the build writes as 10',
          '--radius-element: 10',
        ],
        [
          'components: {button: {base: {padding: 10n as any}}}',
          'padding holds 10n, a BigInt, which the build writes as 10',
          'padding: 10',
        ],
        [
          "tokens: {'--radius-element': (() => '4px') as any}",
          '--radius-element holds a function, which the build writes as its source text',
          '--radius-element: () =>',
        ],
        [
          "tokens: {'--radius-element': new Date(0) as any}",
          `--radius-element holds an object, which the build writes as ${String(new Date(0))}`,
          '--radius-element: ',
        ],
      ]) {
        plain(fields);
        const p = json(['theme', 'build', 'plain/p.ts']);
        expect(p.status, fields).toBe(0);
        const warnings = JSON.stringify(p.env.data.warnings);
        expect(warnings, fields).toContain(why);
        expect(warnings, fields).not.toContain('[object Object]');
        expect(
          fs.readFileSync(path.join(cwd, 'plain/p.css'), 'utf8'),
          fields,
        ).toContain(css);
      }
    },
    T,
  );
});
