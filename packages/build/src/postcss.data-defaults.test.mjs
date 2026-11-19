// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file postcss.data-defaults.test.mjs
 * @input The documented `postcss(rootDir, overrides)` config, run in
 *   development and production modes over an app that has the real Core
 *   package installed and never imports `dataVars`
 * @output Proves the PostCSS source build declares Core's canonical 56
 *   data-token defaults, names and values from the canonical source, once, on
 *   `:root` inside `@layer astryx-base`
 * @position Regression test for spec:AST-066 FR3 in @astryxdesign/build
 *
 * The PostCSS helper compiles every module each installed Astryx package
 * publishes, so Core's `theme/dataTokens.stylex.ts` is always among them and
 * its variable group is always emitted. Raw `var(--color-data-*)` CSS in a
 * PostCSS source build relies on this.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {parseDataTokenDefaults} from '../../../scripts/generate-data-tokens.mjs';

const require = createRequire(import.meta.url);
const {postcss} = require('./config.js');

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const CORE_PACKAGE = path.join(REPO_ROOT, 'packages/core');

/** The canonical names and values, read from Core's StyleX source. */
const CANONICAL = new Map(
  parseDataTokenDefaults(
    fs.readFileSync(
      path.join(CORE_PACKAGE, 'src/theme/dataTokens.stylex.ts'),
      'utf8',
    ),
  ),
);

const appDirs = [];
/** @type {Record<'development' | 'production', string>} */
const output = {development: '', production: ''};

/**
 * Run the documented config over a fresh app. Each mode gets its own app
 * folder: the plugin caches compiled files by path, so a shared folder would
 * reuse the first mode's rules.
 * @param {boolean} dev
 */
async function compile(dev) {
  const appDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-postcss-data-')),
  );
  appDirs.push(appDir);
  fs.mkdirSync(path.join(appDir, 'node_modules/@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    CORE_PACKAGE,
    path.join(appDir, 'node_modules/@astryxdesign/core'),
    'dir',
  );
  fs.mkdirSync(path.join(appDir, 'src'));
  fs.writeFileSync(
    path.join(appDir, 'src/page.tsx'),
    [
      "import * as stylex from '@stylexjs/stylex';",
      "export const styles = stylex.create({page: {color: 'red'}});",
      '',
    ].join('\n'),
  );

  const config = postcss(appDir, {dev});
  const [pluginPath, options] = Object.entries(config.plugins)[0];
  const plugin = require(pluginPath)(options);
  let css = '';
  const atRule = {
    name: 'stylex',
    params: '',
    replaceWith(next) {
      css = next;
    },
  };
  const root = {walkAtRules: visit => visit(atRule)};
  for (const run of plugin.plugins) {
    await run(root, {
      opts: {from: path.join(appDir, 'src/app.css')},
      messages: [],
    });
  }
  return css;
}

beforeAll(async () => {
  output.development = await compile(true);
  output.production = await compile(false);
}, 180_000);

afterAll(() => {
  for (const dir of appDirs) fs.rmSync(dir, {recursive: true, force: true});
});

/** The slice of a stylesheet inside a given top-level layer block. */
function layerBlock(css, name) {
  const start = css.indexOf(`@layer ${name} {`);
  expect(start, `@layer ${name} is not in the output`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`@layer ${name} is unterminated`);
}

/** Every rule whose declarations include a data-token default. */
function dataRules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*--color-data-[^{}]*)\}/g)].map(
    ([, selector, body]) => ({
      selectors: selector
        .trim()
        .split(',')
        .map(part => part.trim()),
      declarations: body
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
          const colon = part.indexOf(':');
          return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
        }),
    }),
  );
}

describe('the PostCSS source build, without a dataVars import', () => {
  it('reads 56 canonical tokens from Core source', () => {
    expect(CANONICAL.size).toBe(56);
  });

  for (const mode of /** @type {const} */ (['development', 'production'])) {
    describe(`in ${mode} mode`, () => {
      it('declares the canonical names and values once, in one group', () => {
        const rules = dataRules(output[mode]);
        expect(rules).toHaveLength(1);
        const [{declarations}] = rules;
        expect(declarations).toHaveLength(56);
        expect(new Map(declarations)).toEqual(CANONICAL);
      });

      it('declares the group on :root', () => {
        const [{selectors}] = dataRules(output[mode]);
        expect(selectors).toContain(':root');
      });

      it('places the group in the library layer, not the product layer', () => {
        const css = output[mode];
        expect(dataRules(layerBlock(css, 'astryx-base'))).toHaveLength(1);
        expect(dataRules(layerBlock(css, 'product'))).toHaveLength(0);
      });
    });
  }
});
