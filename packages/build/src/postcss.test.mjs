// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file postcss.test.mjs
 * @input The documented `postcss(rootDir)` config and its PostCSS plugin, run
 *   from an app directory that carries its own root `babel.config.js`
 * @output Proves the plugin compiles Astryx library source without the app's
 *   Babel config, while the app's own files still get it
 * @position Regression test for @astryxdesign/build's PostCSS plugin
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {postcss} = require('./config.js');

const LIBRARY_FILE = 'node_modules/@astryxdesign/core/src/Box/Box.tsx';
const PRODUCT_FILE = 'src/page.tsx';

let appDir;

/**
 * An app laid out like the documented Next.js setup: a root Babel config (here
 * one that records every file it is applied to), StyleX's Babel plugin
 * installed, one Astryx library module and one app module.
 */
beforeAll(() => {
  appDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-postcss-')),
  );
  const files = {
    'babel.config.js': [
      'module.exports = {',
      '  plugins: [',
      '    () => ({',
      '      visitor: {',
      '        Program(_, state) {',
      '          globalThis.appBabelConfigFiles.push(state.filename);',
      '        },',
      '      },',
      '    }),',
      '  ],',
      '};',
      '',
    ].join('\n'),
    // An installed Astryx package has a manifest; the plugin scans what each
    // one publishes, so without it the module would count as app code.
    'node_modules/@astryxdesign/core/package.json': JSON.stringify({
      name: '@astryxdesign/core',
    }),
    [LIBRARY_FILE]: [
      "import * as stylex from '@stylexjs/stylex';",
      "export const styles = stylex.create({box: {color: 'red'}});",
      '',
    ].join('\n'),
    [PRODUCT_FILE]: [
      "import * as stylex from '@stylexjs/stylex';",
      "export const styles = stylex.create({page: {color: 'blue'}});",
      '',
    ].join('\n'),
  };
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(appDir, file)), {recursive: true});
    fs.writeFileSync(path.join(appDir, file), contents);
  }
  // The documented config names `@stylexjs/babel-plugin`, which Babel resolves
  // from the app, so install it there the way an app's devDependency would be.
  const stylexPluginDir = path.dirname(
    require.resolve('@stylexjs/babel-plugin/package.json'),
  );
  const installed = path.join(appDir, 'node_modules/@stylexjs/babel-plugin');
  fs.mkdirSync(path.dirname(installed), {recursive: true});
  fs.symlinkSync(fs.realpathSync(stylexPluginDir), installed, 'junction');
});

afterAll(() => {
  fs.rmSync(appDir, {recursive: true, force: true});
});

/**
 * Run the documented config's StyleX plugin over the app the way `next build`
 * does: from the app directory, on a stylesheet holding `@stylex;`. Returns the
 * CSS that replaces the at-rule.
 */
async function compileApp() {
  const config = postcss(appDir);
  const options = config.plugins[require.resolve('./index.js')];
  const [compile] = require('./index.js')(options).plugins;
  let css = null;
  const atRule = {
    name: 'stylex',
    params: '',
    replaceWith: replacement => {
      css = replacement;
    },
  };
  const root = {walkAtRules: visit => visit(atRule)};
  const result = {
    opts: {from: path.join(appDir, 'src/globals.css')},
    messages: [],
  };
  const cwd = process.cwd();
  process.chdir(appDir);
  try {
    await compile(root, result);
  } finally {
    process.chdir(cwd);
  }
  return css;
}

describe('the PostCSS plugin and the app Babel config', () => {
  it("compiles Astryx source without the app's Babel config", async () => {
    globalThis.appBabelConfigFiles = [];
    try {
      const css = await compileApp();

      expect(globalThis.appBabelConfigFiles).not.toContain(
        path.join(appDir, LIBRARY_FILE),
      );
      // The app's own files still get the app's config.
      expect(globalThis.appBabelConfigFiles).toContain(
        path.join(appDir, PRODUCT_FILE),
      );
      expect(css).toMatch(/@layer astryx-base \{[^]*color:\s*red/);
      expect(css).toMatch(/@layer product \{[^]*color:\s*blue/);
    } finally {
      delete globalThis.appBabelConfigFiles;
    }
  });
});
