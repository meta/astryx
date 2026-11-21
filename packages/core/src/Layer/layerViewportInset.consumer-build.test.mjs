// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerViewportInset.consumer-build.test.mjs
 * @input Uses Babel, the StyleX compiler, Core's build config, and the
 *   published `./Layer/layerViewportInset.stylex` entry as Core builds it
 * @output Shows that a StyleX build outside Core that reads the built layer
 *   viewport inset references CSS variables Core's stylesheet does not
 *   define, while the gap stands
 * @position Regression test for the published layer viewport inset entry
 *   (spec:AST-059 FR1, FR7)
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const CORE_ROOT = path.resolve(SRC, '..');

/** Core's sources whose compiled CSS defines what the entry may reference. */
const CORE_SOURCES = [
  'Layer/layerViewportInset.stylex.ts',
  'theme/tokens.stylex.ts',
];

/** @type {string} */
let app;

async function compileCore(relative) {
  const filename = path.join(SRC, relative);
  return transformAsync(await fs.readFile(filename, 'utf8'), {
    babelrc: false,
    configFile: path.join(CORE_ROOT, 'babel.config.json'),
    filename,
  });
}

beforeAll(async () => {
  // An app with Core installed as it is published: the entry is the built
  // file at the path the package's exports name.
  app = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'astryx-inset-consumer-')),
  );
  const core = path.join(app, 'node_modules/@astryxdesign/core');
  await fs.mkdir(path.join(core, 'dist/Layer'), {recursive: true});
  await fs.writeFile(
    path.join(core, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core'}),
  );
  const built = await compileCore('Layer/layerViewportInset.stylex.ts');
  await fs.writeFile(
    path.join(core, 'dist/Layer/layerViewportInset.stylex.js'),
    built?.code ?? '',
  );
  await fs.writeFile(
    path.join(app, 'package.json'),
    JSON.stringify({name: 'inset-consumer-app'}),
  );
}, 60_000);

afterAll(async () => {
  if (app) await fs.rm(app, {recursive: true, force: true});
});

/** The CSS an app's own StyleX build emits for `source`. */
async function compileApp(source) {
  const filename = path.join(app, 'src/Sheet.js');
  await fs.mkdir(path.dirname(filename), {recursive: true});
  await fs.writeFile(filename, source);
  const result = await transformAsync(source, {
    babelrc: false,
    configFile: false,
    filename,
    plugins: [
      [
        stylexBabelPlugin,
        {
          dev: false,
          runtimeInjection: false,
          unstable_moduleResolution: {type: 'commonJS', rootDir: app},
          // The published entry resolves through node_modules.
          aliases: {
            '@astryxdesign/core/Layer/layerViewportInset.stylex': [
              path.join(
                app,
                'node_modules/@astryxdesign/core/dist/Layer/layerViewportInset.stylex.js',
              ),
            ],
          },
        },
      ],
    ],
  });
  return stylexBabelPlugin.processStylexRules(
    result?.metadata?.stylex ?? [],
    false,
  );
}

/** Every custom property Core's compiled stylesheet defines. */
async function coreDefinitions() {
  const rules = [];
  for (const relative of CORE_SOURCES) {
    rules.push(...((await compileCore(relative))?.metadata?.stylex ?? []));
  }
  const css = stylexBabelPlugin.processStylexRules(rules, false);
  return new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
}

describe('the published layer viewport inset in an app StyleX build (spec:AST-059 FR7)', () => {
  // The INV11 gap in architecture:layer-runtime. When the gap closes this
  // test fails: then it asserts that no reference is undefined.
  it('references the three constants it reads as variables Core leaves undefined', async () => {
    const css = await compileApp(`
      import * as stylex from '@stylexjs/stylex';
      import {layerViewportInset} from '@astryxdesign/core/Layer/layerViewportInset.stylex';
      export const styles = stylex.create({
        sheet: {
          maxBlockSize: layerViewportInset.maxBlockSize,
          maxInlineSize: layerViewportInset.maxInlineSize,
          marginBlockStart: layerViewportInset.gutterBlockStart,
        },
      });
    `);
    const defined = await coreDefinitions();
    // A variable with no fallback that nothing defines makes the whole
    // declaration invalid, so the app's sheet loses its cap.
    const undefinedReferences = [...css.matchAll(/var\((--[\w-]+)\)/g)]
      .map(match => match[1])
      .filter(name => !defined.has(name));
    expect(undefinedReferences).toHaveLength(3);
  });
});
