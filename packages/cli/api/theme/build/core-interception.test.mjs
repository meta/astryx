// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file core-interception.test.mjs
 * @input interceptCore with a stand-in theme namespace and a root loader; jiti
 *   evaluating modules through the interception's virtual modules
 * @output The root namespace is read once, only when a theme module requires
 *   the root, with its own exports and `defineTheme` wrapped. A Core with no
 *   root entry gives the theme namespace. `patchCommonJs` skips a Core entry
 *   that is absent or fails to load, and the entries of an unreadable package
 *   config. It wraps the root whatever request loads its file. A theme that
 *   imports only the theme subpath never loads the root through jiti.
 * @position Unit test of packages/cli/api/theme/build/core-interception.mjs
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {createJiti} from 'jiti';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {interceptCore} from './core-interception.mjs';

const themeNamespace = () => ({
  defineTheme: input => ({...input, defined: true}),
  themeOnly: 'theme',
});
const rootNamespace = () => ({
  defineTheme: input => ({...input, defined: true}),
  Button: 'root-only',
});

let dir;
afterEach(() => {
  if (dir) fs.rmSync(dir, {recursive: true, force: true});
  dir = undefined;
});

describe('interceptCore', () => {
  it('reads the root only when it is asked for, once', () => {
    const loadRoot = vi.fn(rootNamespace);
    const {modules, observed} = interceptCore(themeNamespace(), loadRoot);
    expect(modules['@astryxdesign/core/theme'].themeOnly).toBe('theme');
    expect('@astryxdesign/core' in modules).toBe(true);
    expect(loadRoot).not.toHaveBeenCalled();

    const root = modules['@astryxdesign/core'];
    expect(root.Button).toBe('root-only');
    expect(observed(root.defineTheme({name: 'ocean'}))).toBe(true);
    expect(modules['@astryxdesign/core']).toBe(root);
    expect(loadRoot).toHaveBeenCalledTimes(1);
  });

  it('gives the theme namespace for the root of a Core with no root entry', () => {
    const {modules} = interceptCore(themeNamespace(), null);
    expect(modules['@astryxdesign/core'].themeOnly).toBe('theme');
  });

  it('still takes a root namespace itself', () => {
    const {modules} = interceptCore(themeNamespace(), rootNamespace());
    expect(modules['@astryxdesign/core'].Button).toBe('root-only');
  });

  it('loads the root through jiti only for a module that requires it', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-intercept-'));
    fs.writeFileSync(
      path.join(dir, 'theme-only.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nexport default defineTheme({name: 'ocean'});\n",
    );
    fs.writeFileSync(
      path.join(dir, 'root.ts'),
      "import {Button, defineTheme} from '@astryxdesign/core';\nexport default defineTheme({name: String(Button)});\n",
    );
    const loadRoot = vi.fn(rootNamespace);
    const {modules} = interceptCore(themeNamespace(), loadRoot);
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      virtualModules: modules,
    });

    const themeOnly = await jiti.import(path.join(dir, 'theme-only.ts'), {
      default: true,
    });
    expect(themeOnly).toMatchObject({name: 'ocean', defined: true});
    expect(loadRoot).not.toHaveBeenCalled();

    const root = await jiti.import(path.join(dir, 'root.ts'), {default: true});
    expect(root).toMatchObject({name: 'root-only', defined: true});
    expect(loadRoot).toHaveBeenCalledTimes(1);
  });
});

/**
 * A project whose installed Core holds `files` (path to content), and a theme
 * file beside it.
 * @param {Record<string, string>} files
 */
function project(files) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-core-entries-'));
  const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(core, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
  }
  const theme = path.join(dir, 'theme.ts');
  fs.writeFileSync(theme, 'export {};\n');
  return {core, theme};
}

const CORE_PACKAGE = JSON.stringify({
  name: '@astryxdesign/core',
  exports: {'.': './index.cjs', './theme': './theme.cjs'},
});

describe("Core's entries", () => {
  it('patchCommonJs reads an entry that is not there as absent', () => {
    const {theme} = project({
      'package.json': JSON.stringify({
        name: '@astryxdesign/core',
        exports: {'./theme': './theme.cjs'},
      }),
    });
    const patch = interceptCore(themeNamespace(), null).patchCommonJs(theme);
    expect(patch.covered).toBe(true);
    patch.undo();
  });

  it('patchCommonJs skips a theme entry that fails to load, and still wraps the root when the load requires it', () => {
    const {theme} = project({
      'package.json': CORE_PACKAGE,
      'theme.cjs': "throw new Error('the theme entry failed to load');",
      'index.cjs':
        'module.exports = {defineTheme: input => ({...input, defined: true})};',
    });
    const interception = interceptCore(themeNamespace(), null);
    const patch = interception.patchCommonJs(theme);
    try {
      // A `.cjs` dependency beside the theme requires the root during the load.
      const root = createRequire(theme)('@astryxdesign/core');
      expect(interception.observed(root.defineTheme({name: 'reef'}))).toBe(
        true,
      );
      expect(patch.covered).toBe(true);
    } finally {
      patch.undo();
    }
  });

  it('patchCommonJs wraps the root whatever request loads its file', () => {
    // A vendored Core linked into node_modules: a `.cjs` dependency can reach
    // the root's file by a path that never names the package.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-core-linked-'));
    const vendored = path.join(dir, 'vendor', 'core');
    fs.mkdirSync(vendored, {recursive: true});
    fs.writeFileSync(path.join(vendored, 'package.json'), CORE_PACKAGE);
    fs.writeFileSync(path.join(vendored, 'theme.cjs'), 'module.exports = {};');
    fs.writeFileSync(
      path.join(vendored, 'index.cjs'),
      'module.exports = {defineTheme: input => ({...input, defined: true})};',
    );
    const scope = path.join(dir, 'node_modules', '@astryxdesign');
    fs.mkdirSync(scope, {recursive: true});
    fs.symlinkSync(vendored, path.join(scope, 'core'), 'dir');
    const theme = path.join(dir, 'theme.ts');
    fs.writeFileSync(theme, 'export {};\n');
    const interception = interceptCore(themeNamespace(), null);
    const patch = interception.patchCommonJs(theme);
    try {
      const root = createRequire(theme)('./vendor/core/index.cjs');
      expect(interception.observed(root.defineTheme({name: 'reef'}))).toBe(
        true,
      );
      expect(patch.covered).toBe(true);
    } finally {
      patch.undo();
    }
  });

  it('patchCommonJs wraps a root whose body requires other files before it defines defineTheme', () => {
    const {theme} = project({
      'package.json': CORE_PACKAGE,
      'theme.cjs': 'module.exports = {};',
      'util.cjs': 'module.exports = {name: input => input.name};',
      'index.cjs':
        "const util = require('./util.cjs');\nexports.defineTheme = input => ({...input, defined: util.name(input)});\n",
    });
    const interception = interceptCore(themeNamespace(), null);
    const patch = interception.patchCommonJs(theme);
    try {
      const root = createRequire(theme)('@astryxdesign/core');
      expect(interception.observed(root.defineTheme({name: 'reef'}))).toBe(
        true,
      );
      expect(patch.covered).toBe(true);
    } finally {
      patch.undo();
    }
  });

  it('patchCommonJs skips the entries of a package config it cannot read', () => {
    const {theme} = project({
      'package.json': '{"name": "@astryxdesign/core", "exports": ',
      'theme.cjs': 'module.exports = {};',
    });
    const patch = interceptCore(themeNamespace(), null).patchCommonJs(theme);
    expect(patch.covered).toBe(true);
    patch.undo();
  });
});
