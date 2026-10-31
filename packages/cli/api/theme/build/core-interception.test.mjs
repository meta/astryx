// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file core-interception.test.mjs
 * @input interceptCore with a stand-in theme namespace and a root loader; jiti
 *   evaluating modules through the interception's virtual modules
 * @output The root namespace is read only when a theme module requires the
 *   root, once, with its own exports and `defineTheme` wrapped; a Core with
 *   no root entry gives the theme namespace, and a root entry that fails to
 *   load throws its own error; `patchCommonJs` reads only an absent Core
 *   entry as absent and throws any other error; jiti reads a virtual
 *   module only when a module requires it, so a theme that imports only the
 *   theme subpath never loads the root
 * @position Unit test of packages/cli/api/theme/build/core-interception.mjs
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createJiti} from 'jiti';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {interceptCore, lazyCoreRoot} from './core-interception.mjs';

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
  it('loads a root entry once, the first time it is asked for', () => {
    const {core} = project({
      'package.json': CORE_PACKAGE,
      'index.cjs': "module.exports = {Button: 'root-only'};",
    });
    const loadRoot = lazyCoreRoot(path.join(core, 'index.cjs'));
    expect(loadRoot().Button).toBe('root-only');
    expect(loadRoot()).toBe(loadRoot());
  });

  it("throws a root entry's own error when it fails to load, rather than read it as no root", () => {
    const {core} = project({
      'package.json': CORE_PACKAGE,
      'index.cjs': "throw new Error('the root entry failed to load');",
    });
    expect(lazyCoreRoot(path.join(core, 'index.cjs'))).toThrow(
      /the root entry failed to load/,
    );
  });

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

  it("patchCommonJs throws a theme entry's own error when it fails to load, rather than leave it unwrapped", () => {
    const {theme} = project({
      'package.json': CORE_PACKAGE,
      'theme.cjs': "throw new Error('the theme entry failed to load');",
    });
    expect(() =>
      interceptCore(themeNamespace(), null).patchCommonJs(theme),
    ).toThrow(/the theme entry failed to load/);
  });

  it('patchCommonJs throws on a package config it cannot read, rather than read its entries as absent', () => {
    const {theme} = project({
      'package.json': '{"name": "@astryxdesign/core", "exports": ',
      'theme.cjs': 'module.exports = {};',
    });
    expect(() =>
      interceptCore(themeNamespace(), null).patchCommonJs(theme),
    ).toThrow(/package/i);
  });
});
