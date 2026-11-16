// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part's variants written as other styling libraries write them
 * (`variants: {variant: {secondary: {…}}}`): theme build warns once, at
 * the line, with the style keys that write them, and writes what it wrote
 * before; the editor refuses them with the same words.
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
  cwd = makeLinkedFixture('astryx-theme-variant-maps-', FIXTURE_PACKAGES);
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

describe('variants written as a map of values to blocks', () => {
  it(
    'get one warning, at the line, naming the style keys that write them',
    () => {
      plain(
        "components: {button: {variants: {variant: {secondary: {borderColor: 'red'}, ghost: {color: 'blue'}}}}}",
      );
      const p = json(['theme', 'build', 'plain/p.ts']);
      expect(p.status).toBe(0);
      const warnings = p.env.data.warnings;
      expect(warnings).toEqual([
        "components.button.variants.variant (line 4): variant holds a block for each value, as other styling libraries write variants, and the build writes it as a declaration the browser drops: write each value as a style key of the part, such as 'variant:secondary': {…}, 'variant:ghost': {…} (join keys with + for several props at once)",
      ]);
      const css = fs.readFileSync(path.join(cwd, 'plain/p.css'), 'utf8');
      expect(css).not.toContain('border-color: red');
    },
    T,
  );

  it(
    'are refused by the editor with the same words, naming the style keys',
    async () => {
      await themeEditNew('vm', {cwd});
      own(
        'vm',
        "components: {button: {variants: {variant: {secondary: {borderColor: 'red'}}}}}",
      );
      const r = compileOwn('vm');
      expect(r.status).toBe(1);
      expect(r.env.error).toContain(
        'variant holds a block for each value, as other styling libraries write variants',
      );
      expect(r.env.error).toContain("'variant:secondary': {…}");
      expect(r.env.error).not.toContain('only a pseudo key');
    },
    T,
  );

  it(
    'leave a style key with its own properties, and the documented form, as before',
    () => {
      plain(
        "components: {button: {'variant:secondary': {borderColor: 'red', ':hover': {color: 'blue'}, '@dark': {':focus': {color: 'green'}}}}}",
      );
      const p = json(['theme', 'build', 'plain/p.ts']);
      expect(p.env.data.warnings).toEqual([]);
      expect(fs.readFileSync(path.join(cwd, 'plain/p.css'), 'utf8')).toContain(
        'border-color: red',
      );
    },
    T,
  );
});
