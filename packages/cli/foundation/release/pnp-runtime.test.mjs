// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Yarn Plug'n'Play runtime a copy started outside it preloads to see
 * the project (spec AST-081 FR9): which runtime a folder needs, and the
 * environment that preloads it as Yarn does.
 */

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  findPnpRuntime,
  runtimeToPreload,
  withPnpRuntime,
} from './pnp-runtime.mjs';
import {
  cleanupFixtures,
  installCore,
  installStandInCli,
  project,
  tempDir,
} from '../../test-utils/release-fixtures.mjs';
import {writePnpRuntime} from '../../test-utils/pnp-fixtures.mjs';

afterEach(() => {
  delete process.versions.pnp;
  cleanupFixtures();
});

/**
 * A Plug'n'Play project that declares Astryx and keeps no node_modules.
 * @param {{loader?: boolean}} [options]
 */
function pnpProject({loader = false} = {}) {
  const root = project(tempDir('pnp'), {
    '@astryxdesign/core': '0.7.10',
    '@astryxdesign/cli': '0.7.10',
  });
  writePnpRuntime(root, {});
  if (loader) fs.writeFileSync(path.join(root, '.pnp.loader.mjs'), '');
  return root;
}

describe('findPnpRuntime', () => {
  it('finds the nearest .pnp.cjs and the loader beside it', () => {
    const root = pnpProject({loader: true});
    const src = path.join(root, 'src', 'pages');
    fs.mkdirSync(src, {recursive: true});
    expect(findPnpRuntime(src)).toEqual({
      file: path.join(root, '.pnp.cjs'),
      loader: path.join(root, '.pnp.loader.mjs'),
    });
  });

  it('gives no loader when Yarn wrote none, and nothing without a runtime', () => {
    const root = pnpProject();
    expect(findPnpRuntime(root)?.loader).toBeNull();
    expect(findPnpRuntime(tempDir('plain'))).toBeNull();
  });
});

describe('runtimeToPreload', () => {
  it('names the runtime of a project that declares Astryx and installs it only through Plug\'n\'Play', () => {
    const root = pnpProject();
    const src = path.join(root, 'src');
    fs.mkdirSync(src);
    expect(runtimeToPreload(src, undefined)?.file).toBe(
      path.join(root, '.pnp.cjs'),
    );
  });

  it('needs none inside a runtime, or when the Node options preload it already', () => {
    const root = pnpProject();
    const file = path.join(root, '.pnp.cjs');
    expect(runtimeToPreload(root, `--require ${file}`)).toBeNull();
    Object.defineProperty(process.versions, 'pnp', {
      value: '3',
      configurable: true,
    });
    expect(runtimeToPreload(root, undefined)).toBeNull();
  });

  it('needs none when the CLI or Core is installed where the run sees it', () => {
    const withCli = pnpProject();
    installStandInCli(withCli, '0.7.10');
    expect(runtimeToPreload(withCli, undefined)).toBeNull();
    const withCore = pnpProject();
    installCore(withCore, '0.7.10');
    expect(runtimeToPreload(withCore, undefined)).toBeNull();
  });

  it('needs none for a folder that declares no Astryx, or one declared outside the runtime', () => {
    const plain = project(tempDir('pnp-plain'), {react: '19.2.0'});
    writePnpRuntime(plain, {});
    expect(runtimeToPreload(plain, undefined)).toBeNull();

    const outer = project(tempDir('outer'), {'@astryxdesign/core': '0.7.10'});
    const inner = path.join(outer, 'tools');
    fs.mkdirSync(inner);
    writePnpRuntime(inner, {});
    expect(runtimeToPreload(inner, undefined)).toBeNull();
  });
});

describe('withPnpRuntime', () => {
  it('adds the runtime and its loader to NODE_OPTIONS, after the options already set', () => {
    const root = pnpProject({loader: true});
    const runtime = findPnpRuntime(root);
    if (!runtime) throw new Error('no runtime');
    const env = withPnpRuntime(
      {NODE_OPTIONS: '--max-old-space-size=4096', HOME: '/home/me'},
      runtime,
    );
    expect(env).toEqual({
      HOME: '/home/me',
      NODE_OPTIONS: `--max-old-space-size=4096 --require ${runtime.file} --experimental-loader ${pathToFileURL(path.join(root, '.pnp.loader.mjs')).href}`,
    });
  });

  it('quotes a runtime path that holds white space, and adds no loader when there is none', () => {
    const file = path.join('/work', 'my app', '.pnp.cjs');
    expect(withPnpRuntime({}, {file, loader: null})).toEqual({
      NODE_OPTIONS: `--require ${JSON.stringify(file)}`,
    });
  });
});
