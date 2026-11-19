// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {resolveThemeImports} from './theme-imports.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

/** @type {string[]} */
const dirs = [];

function project() {
  const dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-theme-imports-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}\n');
  return dir;
}

function packageTheme(dir, exportsMap) {
  const packageDir = path.join(dir, 'node_modules', '@acme', 'themes');
  fs.mkdirSync(path.join(packageDir, 'dist'), {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({name: '@acme/themes', exports: exportsMap}),
  );
  return packageDir;
}

function discovered(fields = {}) {
  return {
    slug: 'ocean',
    displayName: 'Ocean',
    description: 'Ocean theme.',
    maintained: true,
    entry: 'oceanTheme.ts',
    exportName: 'oceanTheme',
    files: ['oceanTheme.ts'],
    package: '@acme/themes',
    sourceDir: '/source/ocean',
    bundled: false,
    docPath: '/source/ocean/oceanTheme.doc.mjs',
    source: /** @type {const} */ ('package'),
    ...fields,
  };
}

afterEach(() => {
  while (dirs.length > 0) {
    fs.rmSync(dirs.pop(), {recursive: true, force: true});
  }
});

describe('resolveThemeImports', () => {
  it("names the install of a theme package Astryx releases with Core at the project's Core release", () => {
    const dir = project();
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        dependencies: {'@astryxdesign/core': '0.7.16'},
      }),
    );
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}\n');
    const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(
      path.join(core, 'package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: '0.7.16'}),
    );

    // Its exact Core peer refuses any other release, so a plain install of
    // the newest one would fail.
    expect(() =>
      resolveThemeImports(
        discovered({slug: 'stone', package: '@astryxdesign/theme-stone'}),
        {cwd: dir},
      ),
    ).toThrow(
      /install it, then add the theme: `npm install -E @astryxdesign\/theme-stone@0\.7\.16`, then `.* theme add stone`\.$/u,
    );
  });

  it("in a fresh clone that lists the theme package, says to install the project's dependencies, but not from a folder with its own package.json", () => {
    const dir = project();
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        dependencies: {'@astryxdesign/core': '0.7.16', '@acme/themes': '1.0.0'},
      }),
    );
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}\n');

    expect(() => resolveThemeImports(discovered(), {cwd: dir})).toThrow(
      'Theme package "@acme/themes" is not installed, though this project lists it: install the project\'s dependencies with `npm install`.',
    );
    // A tool folder inside the project has a package.json of its own, so an
    // install there would install the tool's packages, not the project's.
    const tool = path.join(dir, 'tools', 'gen');
    fs.mkdirSync(tool, {recursive: true});
    fs.writeFileSync(path.join(tool, 'package.json'), '{"name":"gen"}\n');
    expect(() => resolveThemeImports(discovered(), {cwd: tool})).toThrow(
      /^Theme package "@acme\/themes" is not installed\. The app imports ocean from it/u,
    );
  });

  it('resolves the per-theme built module, CSS, and optional font CSS', () => {
    const dir = project();
    const packageDir = packageTheme(dir, {
      './themes/ocean': './dist/ocean.js',
      './themes/ocean.css': './dist/ocean.css',
      './themes/ocean.fonts.css': './dist/ocean.fonts.css',
    });
    fs.writeFileSync(
      path.join(packageDir, 'dist/ocean.js'),
      'export const oceanTheme = {};\n',
    );
    fs.writeFileSync(path.join(packageDir, 'dist/ocean.css'), '.ocean {}\n');
    fs.writeFileSync(
      path.join(packageDir, 'dist/ocean.fonts.css'),
      '@font-face {}\n',
    );

    expect(resolveThemeImports(discovered(), {cwd: dir})).toMatchObject({
      owner: '@acme/themes',
      module: '@acme/themes/themes/ocean',
      stylesheet: '@acme/themes/themes/ocean.css',
      fontStylesheet: '@acme/themes/themes/ocean.fonts.css',
      source: 'package',
    });
  });

  it('uses the single-theme shorthand only when the owner has one theme', () => {
    const dir = project();
    const packageDir = packageTheme(dir, {
      './built': {import: './dist/built.mjs'},
      './theme.css': {default: './dist/theme.css'},
    });
    fs.writeFileSync(
      path.join(packageDir, 'dist/built.mjs'),
      'export const oceanTheme = {};\n',
    );
    fs.writeFileSync(path.join(packageDir, 'dist/theme.css'), '.ocean {}\n');

    expect(
      resolveThemeImports(discovered(), {cwd: dir, ownerThemeCount: 1}),
    ).toMatchObject({
      module: '@acme/themes/built',
      stylesheet: '@acme/themes/theme.css',
    });
    expect(() =>
      resolveThemeImports(discovered(), {cwd: dir, ownerThemeCount: 2}),
    ).toThrow(/no resolvable built module and stylesheet/i);
  });

  it('fails when the built module does not export the descriptor stem', () => {
    const dir = project();
    const packageDir = packageTheme(dir, {
      './themes/ocean': './dist/ocean.js',
      './themes/ocean.css': './dist/ocean.css',
    });
    fs.writeFileSync(
      path.join(packageDir, 'dist/ocean.js'),
      'export const wrongTheme = {};\n',
    );
    fs.writeFileSync(path.join(packageDir, 'dist/ocean.css'), '.ocean {}\n');

    expect(() => resolveThemeImports(discovered(), {cwd: dir})).toThrow(
      /does not export "oceanTheme"/i,
    );
  });

  it('fails rather than ignoring a declared font export with no file', () => {
    const dir = project();
    const packageDir = packageTheme(dir, {
      './themes/ocean': './dist/ocean.js',
      './themes/ocean.css': './dist/ocean.css',
      './themes/ocean.fonts.css': './dist/missing.css',
    });
    fs.writeFileSync(
      path.join(packageDir, 'dist/ocean.js'),
      'export const oceanTheme = {};\n',
    );
    fs.writeFileSync(path.join(packageDir, 'dist/ocean.css'), '.ocean {}\n');

    expect(() => resolveThemeImports(discovered(), {cwd: dir})).toThrow(
      /font stylesheet does not resolve/i,
    );
  });

  it('requires local build outputs and names the build command', () => {
    const dir = project();
    const sourceDir = path.join(dir, 'src', 'themes', 'ocean');
    fs.mkdirSync(sourceDir, {recursive: true});
    const theme = discovered({
      package: './src/themes',
      sourceDir,
      docPath: path.join(sourceDir, 'oceanTheme.doc.mjs'),
      source: /** @type {const} */ ('local'),
    });

    expect(() => resolveThemeImports(theme, {cwd: dir})).toThrow(
      / theme build src\/themes\/ocean\/oceanTheme\.ts`/i,
    );
    fs.writeFileSync(
      path.join(sourceDir, 'ocean.js'),
      'export const oceanTheme = {};\n',
    );
    fs.writeFileSync(path.join(sourceDir, 'ocean.css'), '.ocean {}\n');
    expect(resolveThemeImports(theme, {cwd: dir})).toMatchObject({
      source: 'local',
      owner: './src/themes',
    });
  });

  it('uses ThemeImportError and gives the install command for an uninstalled package', () => {
    const dir = project();
    expect(() => resolveThemeImports(discovered(), {cwd: dir})).toThrow(
      expect.objectContaining({
        name: 'Error',
        message: expect.stringMatching(
          /`(npm install|pnpm add|yarn add|bun add) @acme\/themes`/,
        ),
      }),
    );
  });
});
