// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which esbuild builds a rendered page's script: a native esbuild whose
 *   version satisfies the CLI's own esbuild-wasm range, from the project first
 *   and then from beside the CLI, else the CLI's esbuild-wasm, with the reason.
 *   With the CLI's esbuild-wasm lost, only a native esbuild in the range
 *   builds; otherwise nothing does. Each case installs stand-in packages in
 *   temporary folders, under a stand-in CLI whose package.json declares
 *   `esbuild-wasm: ^0.28.2`, the form publishing writes.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {chooseEsbuild, findEsbuild} from './esbuild-dependency.mjs';

/** @type {string} */
let root;
/** @type {string} */
let project;
/** @type {string} */
let cli;

/**
 * Installs a stand-in package with a `main` entry in `dir`'s node_modules.
 * @param {string} dir
 * @param {string} name
 * @param {string | null} [version] null leaves the version out
 * @returns {string} the entry file
 */
function install(dir, name, version = '0.28.2') {
  const packageDir = path.join(dir, 'node_modules', name);
  fs.mkdirSync(path.join(packageDir, 'lib'), {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({name, ...(version ? {version} : {}), main: 'lib/main.js'}),
  );
  fs.writeFileSync(path.join(packageDir, 'lib', 'main.js'), '');
  return path.join(packageDir, 'lib', 'main.js');
}

/**
 * Writes the stand-in CLI's package.json with its esbuild-wasm range.
 * @param {string} range
 */
function declare(range) {
  fs.writeFileSync(
    path.join(cli, 'package.json'),
    JSON.stringify({name: 'cli', dependencies: {'esbuild-wasm': range}}),
  );
}

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-esbuild-lookup-')),
  );
  project = path.join(root, 'project');
  cli = path.join(root, 'cli');
  fs.mkdirSync(project);
  fs.mkdirSync(cli);
  declare('^0.28.2');
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

describe('chooseEsbuild', () => {
  it("uses the project's esbuild on the same minor version, so the project keeps native speed", () => {
    const own = install(project, 'esbuild', '0.28.9');
    install(cli, 'esbuild');
    install(cli, 'esbuild-wasm');
    expect(chooseEsbuild(cli, project)).toEqual({
      entry: own,
      build: 'esbuild',
      version: '0.28.9',
      reason: 'the project\u2019s esbuild satisfies ^0.28.2',
    });
  });

  it('skips a project esbuild on an older minor version, such as one hoisted from other tools', () => {
    install(project, 'esbuild', '0.14.0');
    const wasm = install(cli, 'esbuild-wasm');
    expect(chooseEsbuild(cli, project)).toEqual({
      entry: wasm,
      build: 'esbuild-wasm',
      version: '0.28.2',
      reason: 'the project\u2019s esbuild 0.14.0 is outside ^0.28.2',
    });
  });

  it('skips a project esbuild on a newer minor version', () => {
    install(project, 'esbuild', '0.29.0');
    const wasm = install(cli, 'esbuild-wasm');
    expect(chooseEsbuild(cli, project)?.entry).toBe(wasm);
  });

  it('names a hoisted esbuild that the project and the CLI share once', () => {
    const nested = path.join(project, 'node_modules', '@astryxdesign', 'cli');
    fs.mkdirSync(nested, {recursive: true});
    fs.writeFileSync(
      path.join(nested, 'package.json'),
      JSON.stringify({name: 'cli', dependencies: {'esbuild-wasm': '^0.28.2'}}),
    );
    install(project, 'esbuild', '0.25.12');
    const wasm = install(project, 'esbuild-wasm');
    expect(chooseEsbuild(nested, project)).toMatchObject({
      entry: wasm,
      reason: 'the project\u2019s esbuild 0.25.12 is outside ^0.28.2',
    });
  });

  it("skips a project esbuild below the range's patch floor", () => {
    install(project, 'esbuild', '0.28.1');
    const wasm = install(cli, 'esbuild-wasm');
    expect(chooseEsbuild(cli, project)).toMatchObject({
      entry: wasm,
      reason: 'the project\u2019s esbuild 0.28.1 is outside ^0.28.2',
    });
  });

  it("reads the installed esbuild-wasm's version and its patches where the manifest names the catalog, as in the repository", () => {
    declare('catalog:');
    install(cli, 'esbuild-wasm', '0.28.2');
    const own = install(project, 'esbuild', '0.28.9');
    expect(chooseEsbuild(cli, project)).toMatchObject({
      entry: own,
      reason: 'the project\u2019s esbuild satisfies ^0.28.2',
    });
    install(project, 'esbuild', '0.28.1');
    expect(chooseEsbuild(cli, project)?.build).toBe('esbuild-wasm');
  });

  it('fails closed to esbuild-wasm for a declared range the lookup does not read', () => {
    declare('>=0.28 || 1.x');
    install(project, 'esbuild', '0.28.5');
    const wasm = install(cli, 'esbuild-wasm');
    expect(chooseEsbuild(cli, project)).toMatchObject({
      entry: wasm,
      reason:
        'the CLI\u2019s esbuild-wasm range >=0.28 || 1.x is not one the lookup reads',
    });
  });

  it('skips a project esbuild whose version cannot be read', () => {
    install(project, 'esbuild', null);
    const wasm = install(cli, 'esbuild-wasm');
    expect(chooseEsbuild(cli, project)).toMatchObject({
      entry: wasm,
      reason: 'the project\u2019s esbuild has no readable version',
    });
  });

  it("reads the range from the CLI's own package.json", () => {
    declare('>=0.28.0 <0.30.0');
    const own = install(project, 'esbuild', '0.29.1');
    install(cli, 'esbuild-wasm');
    expect(chooseEsbuild(cli, project)?.entry).toBe(own);
  });

  it('uses a native esbuild beside the CLI when the project has none', () => {
    const beside = install(cli, 'esbuild');
    install(cli, 'esbuild-wasm');
    expect(chooseEsbuild(cli, project)).toMatchObject({
      entry: beside,
      build: 'esbuild',
      reason: 'the esbuild beside the CLI satisfies ^0.28.2',
    });
  });

  it("falls back to the CLI's esbuild-wasm when no native esbuild is installed", () => {
    const wasm = install(cli, 'esbuild-wasm');
    expect(chooseEsbuild(cli, project)).toEqual({
      entry: wasm,
      build: 'esbuild-wasm',
      version: '0.28.2',
      reason: 'no native esbuild satisfying ^0.28.2 is installed',
    });
    expect(findEsbuild(cli)).toBe(wasm);
  });

  it("uses a project esbuild on the same minor version when the CLI's esbuild-wasm is missing", () => {
    const own = install(project, 'esbuild', '0.28.5');
    expect(chooseEsbuild(cli, project)).toEqual({
      entry: own,
      build: 'esbuild',
      version: '0.28.5',
      reason: 'the project\u2019s esbuild satisfies ^0.28.2',
    });
  });

  it("finds nothing when the CLI's esbuild-wasm is missing and no native esbuild is on the same minor version", () => {
    install(project, 'esbuild', '0.29.0');
    expect(chooseEsbuild(cli, project)).toBeNull();
    expect(findEsbuild(cli, project)).toBeNull();
  });

  it("takes no native esbuild unchecked when the CLI's esbuild-wasm is missing and its manifest gives no range", () => {
    declare('catalog:');
    install(project, 'esbuild', '0.14.0');
    expect(chooseEsbuild(cli, project)).toBeNull();
  });

  it("finds nothing when the CLI's install lost its esbuild-wasm and no native esbuild is installed", () => {
    expect(chooseEsbuild(cli, project)).toBeNull();
    expect(findEsbuild(cli, project)).toBeNull();
  });
});
