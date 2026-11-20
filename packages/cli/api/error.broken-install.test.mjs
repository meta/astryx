// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file brokenInstallError: a declared package missing under an installed
 *   package is a broken install. The app's install names the app's install
 *   command, wherever its package manager keeps the packages; a run on a CLI
 *   copy of its own (global, one-off, release cache) names that copy for a
 *   package its install holds; a miss in the app's own files is not a broken
 *   install.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, describe, expect, it, vi} from 'vitest';
import {brokenInstallError} from './error.mjs';
import {releasesDir} from '../foundation/release/cache.mjs';

/** @param {string} prefix */
const tempDir = prefix =>
  fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
/** @param {string} dir @param {Record<string, unknown>} pkg */
function writePackage(dir, pkg) {
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
}
/** @param {string} file */
const requireStack = file =>
  new Error(`Cannot find module 'tslib'\nRequire stack:\n- ${file}`);
const RECAST = {name: 'recast', dependencies: {tslib: '2.0.0'}};

const app = tempDir('broken-install-');
// An app whose package manager keeps its packages outside it (pnpm's global
// virtual store).
const storeApp = tempDir('broken-install-store-app-');
const store = tempDir('broken-install-store-');
// A global CLI copy: npm's global folder holds no package.json.
const global = tempDir('broken-install-global-');
afterAll(() => {
  for (const dir of [app, storeApp, store, global])
    fs.rmSync(dir, {recursive: true, force: true});
});

writePackage(app, {
  name: 'app',
  dependencies: {recast: '1.0.0', tslib: '2.0.0'},
});
fs.writeFileSync(path.join(app, 'package-lock.json'), '{}');
const recast = path.join(app, 'node_modules', 'recast');
writePackage(recast, RECAST);
const ownFile = path.join(app, 'themes', 'brand', 'brand.theme.ts');

writePackage(storeApp, {name: 'store-app', dependencies: {recast: '1.0.0'}});
fs.writeFileSync(path.join(storeApp, 'pnpm-lock.yaml'), '');
const storeRecast = path.join(
  store,
  'v10',
  'links',
  'recast',
  '1.0.0',
  'hash',
  'node_modules',
  'recast',
);
writePackage(storeRecast, RECAST);
fs.mkdirSync(path.join(storeApp, 'node_modules'), {recursive: true});
fs.symlinkSync(storeRecast, path.join(storeApp, 'node_modules', 'recast'));

const globalModules = path.join(global, 'lib', 'node_modules');
const globalCli = path.join(globalModules, '@astryxdesign', 'cli');
writePackage(globalCli, {name: '@astryxdesign/cli'});
const globalRecast = path.join(globalModules, 'recast');
writePackage(globalRecast, RECAST);

// A pnpm one-off copy: the CLI and its dependencies each in their own
// `.pnpm` folder of the runner's cache.
const dlx = tempDir('broken-install-dlx-');
afterAll(() => fs.rmSync(dlx, {recursive: true, force: true}));
const dlxStore = path.join(dlx, 'dlx', 'abc', 'node_modules', '.pnpm');
const dlxCli = path.join(
  dlxStore,
  '@astryxdesign+cli@1.0.0',
  'node_modules',
  '@astryxdesign',
  'cli',
);
writePackage(dlxCli, {name: '@astryxdesign/cli'});
const dlxRecast = path.join(dlxStore, 'recast@1.0.0', 'node_modules', 'recast');
writePackage(dlxRecast, RECAST);

// The release cache, in a home of the test's own.
const home = tempDir('broken-install-home-');
afterAll(() => fs.rmSync(home, {recursive: true, force: true}));
vi.stubEnv('HOME', home);
vi.stubEnv('XDG_CACHE_HOME', path.join(home, '.cache'));
vi.stubEnv('LOCALAPPDATA', path.join(home, 'AppData', 'Local'));
const release = path.join(releasesDir(), '1.0.0');
const releaseCli = path.join(release, 'node_modules', '@astryxdesign', 'cli');
writePackage(releaseCli, {name: '@astryxdesign/cli'});
const releaseRecast = path.join(release, 'node_modules', 'recast');
writePackage(releaseRecast, RECAST);

describe('brokenInstallError', () => {
  it("names the app's install command for a package in the app's install", () => {
    const error = brokenInstallError(
      requireStack(path.join(recast, 'main.js')),
      app,
    );
    expect(error?.code).toBe('ERR_DEP_MISSING');
    expect(error?.message).toContain('recast needs tslib');
    expect(error?.suggestions?.[0].name).toBe('npm install');
  });

  it("names the app's install command when its package manager keeps the packages outside the app", () => {
    const error = brokenInstallError(
      requireStack(path.join(storeRecast, 'main.js')),
      storeApp,
    );
    expect(error?.code).toBe('ERR_DEP_MISSING');
    expect(error?.suggestions?.[0].name).toBe('pnpm install');
  });

  it("names the folder of the global CLI copy this run uses, never the app's install", () => {
    const error = brokenInstallError(
      requireStack(path.join(globalRecast, 'main.js')),
      app,
      undefined,
      globalCli,
    );
    expect(error?.code).toBe('ERR_DEP_MISSING');
    expect(error?.message).toContain('recast needs tslib');
    expect(error?.message).toContain(globalCli);
    expect(error?.message).not.toContain('npm install');
    expect(error?.suggestions).toBeUndefined();
  });

  it("names a pnpm one-off CLI copy for its own packages, never the app's install", () => {
    const error = brokenInstallError(
      requireStack(path.join(dlxRecast, 'main.js')),
      storeApp,
      undefined,
      dlxCli,
    );
    expect(error?.message).toContain(dlxCli);
    expect(error?.suggestions).toBeUndefined();
  });

  it("never takes a package that NODE_PATH reaches for the app's", () => {
    // An app with no recast of its own.
    const bare = tempDir('broken-install-bare-');
    writePackage(bare, {name: 'bare'});
    fs.writeFileSync(path.join(bare, 'package-lock.json'), '{}');
    const nodePath = process.env.NODE_PATH;
    vi.stubEnv('NODE_PATH', globalModules);
    try {
      const error = brokenInstallError(
        requireStack(path.join(globalRecast, 'main.js')),
        bare,
        undefined,
        globalCli,
      );
      expect(error?.message).toContain(globalCli);
      expect(error?.suggestions).toBeUndefined();
    } finally {
      vi.stubEnv('NODE_PATH', nodePath);
      fs.rmSync(bare, {recursive: true, force: true});
    }
  });

  it('names the release folder to remove for a release-cache copy', () => {
    const error = brokenInstallError(
      requireStack(path.join(releaseRecast, 'main.js')),
      app,
      undefined,
      releaseCli,
    );
    expect(error?.message).toContain(`Remove ${release} so the next run`);
    expect(error?.suggestions).toBeUndefined();
  });

  it("names the app's install for a package the app links from outside its folder (pnpm's global virtual store), whichever CLI copy runs", () => {
    const error = brokenInstallError(
      requireStack(path.join(storeRecast, 'main.js')),
      storeApp,
      undefined,
      globalCli,
    );
    expect(error?.suggestions?.[0].name).toBe('pnpm install');
  });

  it("names the app's install for a package in the app even when the run uses a CLI copy of its own", () => {
    const error = brokenInstallError(
      requireStack(path.join(recast, 'main.js')),
      app,
      undefined,
      globalCli,
    );
    expect(error?.suggestions?.[0].name).toBe('npm install');
  });

  it("leaves a miss in the app's own files to the caller", () => {
    expect(
      brokenInstallError(
        new Error(`Cannot find package 'tslib' imported from ${ownFile}`),
        app,
      ),
    ).toBeNull();
    expect(brokenInstallError(new Error('boom'), app)).toBeNull();
  });
});
