// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {findAstryxProject, findCoreDir, findProjectCoreDir, findProjectRoot, listComponents, discoverExternalPackages, existsCaseExact, findInstalledPackage, findNodeModulesPackage, findPackageRoot, findProjectPackageOf, findWorkspaceRoot} from './paths.mjs';
import {CLI_ROOT} from './paths.mjs';
import {linkThisCliAsProjectCli} from '../../test-utils/release-fixtures.mjs';

let tmpDir;

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-paths-test-'));
}

beforeEach(() => {
  tmpDir = makeTmpDir();
});

afterEach(() => {
  delete process.versions.pnp;
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Write a package.json naming `name` into `dir`, creating the folder.
 * @param {string} dir @param {string} name @param {string} [version]
 */
function writePackage(dir, name, version = '0.7.0') {
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name, version}));
  return dir;
}

/**
 * Write a project package.json into `dir`, creating the folder.
 * @param {string} dir @param {Record<string, unknown>} [fields]
 */
function writeProject(dir, fields = {}) {
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: path.basename(dir), ...fields}));
  return dir;
}

/**
 * Run `fn` with `home` as the home folder.
 * @template T
 * @param {string} home @param {() => T} fn
 * @returns {T}
 */
function withHome(home, fn) {
  const previous = process.env.HOME;
  process.env.HOME = home;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
  }
}

/** Declares Core, which makes a package.json an Astryx project. */
const DECLARES_CORE = {dependencies: {'@astryxdesign/core': '^0.7.0'}};

/** @param {string} root @param {string} name @param {string} version */
function install(root, name, version) {
  return writePackage(path.join(root, 'node_modules', ...name.split('/')), name, version);
}

/**
 * Stand in for the runtime a Yarn Plug'n'Play process exposes:
 * `process.versions.pnp` plus a requirable `pnpapi`. The packages themselves
 * live outside any node_modules, the way Yarn stores them. The top-level
 * afterEach removes `process.versions.pnp` again.
 * @param {Record<string, string>} resolved name -> package directory
 * @returns {string} a project folder inside the PnP runtime
 */
function withPnp(resolved) {
  const runtime = path.join(tmpDir, 'runtime');
  const api = path.join(runtime, 'node_modules', 'pnpapi');
  fs.mkdirSync(api, {recursive: true});
  fs.writeFileSync(
    path.join(api, 'package.json'),
    JSON.stringify({name: 'pnpapi', version: '1.0.0', main: 'index.js'}),
  );
  fs.writeFileSync(
    path.join(api, 'index.js'),
    `const resolved = ${JSON.stringify(resolved)};\n` +
      'module.exports = {\n' +
      '  resolveToUnqualified(name) {\n' +
      '    if (!(name in resolved)) {\n' +
      "      const e = new Error(name); e.code = 'MODULE_NOT_FOUND'; throw e;\n" +
      '    }\n' +
      '    return resolved[name];\n' +
      '  },\n' +
      '};\n',
  );
  Object.defineProperty(process.versions, 'pnp', {
    value: '3',
    configurable: true,
  });
  return runtime;
}

describe('findCoreDir', () => {
  it('finds packages/core walking up directories', () => {
    const coreDir = writePackage(path.join(tmpDir, 'packages', 'core'), '@astryxdesign/core');

    const nested = path.join(tmpDir, 'sub', 'deep');
    fs.mkdirSync(nested, {recursive: true});

    expect(findCoreDir(nested)).toBe(coreDir);
  });

  it('finds node_modules/@astryxdesign/core fallback', () => {
    const nmCore = install(tmpDir, '@astryxdesign/core', '0.7.0');

    expect(findCoreDir(tmpDir)).toBe(nmCore);
  });

  it('returns null when nothing found', () => {
    expect(findProjectCoreDir(tmpDir)).toBeNull();
  });

  it('falls back to the carried Core outside a project, and only there', () => {
    // This copy's carried Core is the workspace Core beside it.
    expect(findCoreDir(tmpDir)).toBe(path.resolve(CLI_ROOT, '..', 'core'));
    linkThisCliAsProjectCli(tmpDir);
    // The project's own Core: findCoreDir falls back to the carried one.
    expect(findProjectCoreDir(tmpDir)).toBeNull();
  });

  // A route folder such as src/app/(shop)/orders/[id]/edit sits six folders
  // below the project root, where Core is installed.
  it('finds Core from any depth inside the project that installs it', () => {
    writeProject(tmpDir, {dependencies: {'@astryxdesign/core': '^0.7.0'}});
    const nmCore = install(tmpDir, '@astryxdesign/core', '0.7.0');
    const route = path.join(tmpDir, 'src', 'app', '(shop)', 'orders', '[id]', 'edit');
    fs.mkdirSync(route, {recursive: true});

    expect(findCoreDir(route)).toBe(nmCore);
  });

  it('searches a workspace up to its root from any depth in a member', () => {
    writeProject(tmpDir, {private: true, workspaces: ['apps/*']});
    const nmCore = install(tmpDir, '@astryxdesign/core', '0.7.0');
    const member = writeProject(path.join(tmpDir, 'apps', 'web'), {dependencies: {'@astryxdesign/core': '^0.7.0'}});
    const route = path.join(member, 'src', 'app', '(shop)', 'orders', '[id]');
    fs.mkdirSync(route, {recursive: true});

    expect(findCoreDir(route)).toBe(nmCore);
  });

  it('searches only the folder and the four above it outside any Astryx project', () => {
    install(tmpDir, '@astryxdesign/core', '0.7.0');
    const project = writeProject(path.join(tmpDir, 'a', 'b', 'c', 'd', 'e', 'app'));

    // The project's own Core: findCoreDir falls back to the carried one.
    expect(findProjectCoreDir(project)).toBeNull();
  });

  // A package.json that only sets the module type is not the project, so a
  // folder deep below it still reaches the Core the project installs.
  it('looks past a nested package.json that declares no Astryx package', () => {
    writeProject(tmpDir, DECLARES_CORE);
    const nmCore = install(tmpDir, '@astryxdesign/core', '0.7.0');
    fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'src', 'package.json'), JSON.stringify({type: 'module'}));
    const deep = path.join(tmpDir, 'src', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6');
    fs.mkdirSync(deep, {recursive: true});

    expect(findCoreDir(deep)).toBe(nmCore);
  });

  // Past the reach the search starts at the project root: a tool folder
  // between them that installs its own Core but declares nothing never
  // answers for the project, as `upgrade` targets the project's Core.
  it('answers the project\'s Core, not a tool folder\'s, from deep inside the tool', () => {
    const app = path.join(tmpDir, 'app');
    writeProject(app, DECLARES_CORE);
    const projectCore = install(app, '@astryxdesign/core', '0.7.0');
    const tool = path.join(app, 'tools', 'codegen');
    writePackage(tool, 'codegen');
    install(tool, '@astryxdesign/core', '0.9.0');
    const deep = path.join(tool, 'src', 'a', 'b', 'c', 'd', 'e');
    fs.mkdirSync(deep, {recursive: true});

    expect(findProjectCoreDir(deep)).toBe(projectCore);
    expect(findInstalledPackage(path.join(deep, 'f'), '@astryxdesign/core')).toBe(projectCore);
  });

  // Node loads the hoisted copy whatever the member declares: an override or
  // resolution can force it, and a peer range can be stale. Reads answer from
  // the copy that loads.
  it.each([
    ['a range the copy is outside of', {devDependencies: {'@astryxdesign/core': '~0.6.8'}}],
    ['only a stale peer range', {peerDependencies: {'@astryxdesign/core': '^0.6.8'}}],
  ])('takes a workspace Core when the member declares %s', (_label, fields) => {
    writeProject(tmpDir, {private: true, workspaces: ['apps/*'], overrides: {'@astryxdesign/core': '0.7.1'}});
    const nmCore = install(tmpDir, '@astryxdesign/core', '0.7.1');
    const member = writeProject(path.join(tmpDir, 'apps', 'web'), fields);

    expect(findCoreDir(member)).toBe(nmCore);
  });

  it('skips a packages/core folder that holds another package', () => {
    writePackage(path.join(tmpDir, 'packages', 'core'), '@acme/core', '1.0.0');
    const app = path.join(tmpDir, 'apps', 'web');
    fs.mkdirSync(app, {recursive: true});

    // The project's own Core: findCoreDir falls back to the carried one.
    expect(findProjectCoreDir(app)).toBeNull();

    const nmCore = install(tmpDir, '@astryxdesign/core', '0.7.0');
    expect(findCoreDir(app)).toBe(nmCore);
  });

  it('skips a node_modules/@astryxdesign/core folder with no package.json', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', '@astryxdesign', 'core'), {recursive: true});

    // The project's own Core: findCoreDir falls back to the carried one.
    expect(findProjectCoreDir(tmpDir)).toBeNull();
  });

  it("asks Yarn Plug'n'Play when no folder holds Core", () => {
    const store = writePackage(path.join(tmpDir, 'store', '@astryxdesign-core'), '@astryxdesign/core');
    const project = withPnp({'@astryxdesign/core': store});

    expect(findCoreDir(project)).toBe(store);
  });
});

describe('findInstalledPackage', () => {
  it('finds a package in the node_modules chain above startDir', () => {
    const installed = install(tmpDir, '@astryxdesign/core', '0.6.0');
    const nested = path.join(tmpDir, 'src', 'deep');
    fs.mkdirSync(nested, {recursive: true});

    expect(findInstalledPackage(nested, '@astryxdesign/core')).toBe(installed);
  });

  it('finds a package from any depth inside the project', () => {
    writeProject(tmpDir, DECLARES_CORE);
    const installed = install(tmpDir, '@astryxdesign/core', '0.7.0');
    const deep = path.join(tmpDir, 'apps', 'web', 'src', 'app', '(shop)', 'orders', '[id]');
    fs.mkdirSync(deep, {recursive: true});

    expect(findInstalledPackage(deep, '@astryxdesign/core')).toBe(installed);
  });

  it('does not search past six folders outside the project', () => {
    install(tmpDir, '@astryxdesign/core', '0.7.0');
    const project = writeProject(path.join(tmpDir, 'a', 'b', 'c', 'd', 'e', 'f', 'app'));

    expect(findInstalledPackage(project, '@astryxdesign/core')).toBeNull();
  });

  it('reports a package the project never installed as missing', () => {
    expect(findInstalledPackage(tmpDir, '@astryxdesign/core')).toBeNull();
  });

  // The regression this lookup exists for: `require.resolve` folds NODE_PATH in
  // even when `paths` is given, so a package reachable only from the ambient
  // environment read as installed in the user's project.
  it('does not answer from a package that is only on NODE_PATH', () => {
    const ambient = path.join(tmpDir, 'ambient');
    install(ambient, '@astryxdesign/core', '0.6.0');
    const project = path.join(tmpDir, 'project');
    fs.mkdirSync(project, {recursive: true});

    const previous = process.env.NODE_PATH;
    process.env.NODE_PATH = path.join(ambient, 'node_modules');
    try {
      expect(findInstalledPackage(project, '@astryxdesign/core')).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.NODE_PATH;
      else process.env.NODE_PATH = previous;
    }
  });

  describe('under Yarn Plug\'n\'Play, which has no node_modules', () => {
    it('falls back to the PnP runtime when there is no chain to walk', () => {
      const store = path.join(tmpDir, 'store', '@astryxdesign-core');
      fs.mkdirSync(store, {recursive: true});
      fs.writeFileSync(
        path.join(store, 'package.json'),
        JSON.stringify({name: '@astryxdesign/core', version: '0.6.0'}),
      );
      const project = withPnp({'@astryxdesign/core': store});

      expect(findInstalledPackage(project, '@astryxdesign/core')).toBe(store);
    });

    it('still reports a package the PnP project never declared', () => {
      const project = withPnp({});

      expect(findInstalledPackage(project, '@astryxdesign/core')).toBeNull();
    });
  });
});

describe('findProjectPackageOf', () => {
  const NAMES = ['@astryxdesign/core', '@xds/core'];

  it('takes the earlier name when one folder installs both', () => {
    writeProject(tmpDir, DECLARES_CORE);
    const current = install(tmpDir, '@astryxdesign/core', '0.7.0');
    install(tmpDir, '@xds/core', '0.3.0');

    expect(findProjectPackageOf(tmpDir, NAMES)).toEqual({name: '@astryxdesign/core', packageDir: current});
  });

  it('takes the nearest folder over an earlier name further up', () => {
    writeProject(tmpDir, {private: true, workspaces: ['apps/*']});
    install(tmpDir, '@astryxdesign/core', '0.7.0');
    const member = writeProject(path.join(tmpDir, 'apps', 'legacy'), {dependencies: {'@xds/core': '0.3.0'}});
    const legacy = install(member, '@xds/core', '0.3.0');

    expect(findProjectPackageOf(member, NAMES)).toEqual({name: '@xds/core', packageDir: legacy});
  });

  it('returns null when none is installed', () => {
    expect(findProjectPackageOf(tmpDir, NAMES)).toBeNull();
  });

  it('finds the package from a subfolder of the project', () => {
    writeProject(tmpDir, DECLARES_CORE);
    const current = install(tmpDir, '@astryxdesign/core', '0.7.0');
    const deep = path.join(tmpDir, 'src', 'l1', 'l2');
    fs.mkdirSync(deep, {recursive: true});

    expect(findProjectPackageOf(deep, NAMES)).toEqual({name: '@astryxdesign/core', packageDir: current});
  });

  // A member uses what its workspace installs, whatever its own package.json
  // says: an override or resolution can force the copy, and a range or peer
  // range can be stale. Membership decides, not the declared version.
  it.each([
    ['~0.6.8', 'dependencies'],
    ['0.7.0 - 0.8.0', 'dependencies'],
    ['>= 0.7.0', 'dependencies'],
    ['^0.6.8', 'peerDependencies'],
  ])('takes the hoisted package for a member that declares %s in %s', (range, field) => {
    writeProject(tmpDir, {private: true, workspaces: ['apps/*']});
    const hoisted = install(tmpDir, '@astryxdesign/core', '0.7.1');
    const member = writeProject(path.join(tmpDir, 'apps', 'web'), {[field]: {'@astryxdesign/core': range}});

    expect(findProjectPackageOf(member, NAMES)).toEqual({name: '@astryxdesign/core', packageDir: hoisted});
  });

  it.each([
    ['Yarn object-form workspaces', {workspaces: {packages: ['apps/*']}}, null],
    ['a ** pattern', {workspaces: ['apps/**']}, null],
    ['a brace pattern', {workspaces: ['{apps,tools}/*']}, null],
    ['a brace list of globs', {workspaces: ['{apps/*,tools/*}']}, null],
    ['a nested brace list', {workspaces: ['{apps/{web,admin},tools/*}']}, null],
    ['a pnpm-workspace.yaml block list', {}, "packages:\n  - 'apps/*'  # apps\n  - \"tools/*\"\nonlyBuiltDependencies: []\n"],
    ['a pnpm-workspace.yaml flow list', {}, "packages: ['tools/*', apps/*]\n"],
  ])('takes the hoisted package for a member that %s lists', (_label, rootFields, yaml) => {
    writeProject(tmpDir, {private: true, ...rootFields});
    if (yaml) fs.writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), yaml);
    const hoisted = install(tmpDir, '@astryxdesign/core', '0.7.1');
    const member = writeProject(path.join(tmpDir, 'apps', 'web'), DECLARES_CORE);

    expect(findProjectPackageOf(member, NAMES)).toEqual({name: '@astryxdesign/core', packageDir: hoisted});
  });

  it.each([
    ['lists other folders', {workspaces: ['packages/*']}],
    ['excludes it with a ! pattern', {workspaces: ['apps/*', '!apps/web']}],
    ['lists other folders in a brace list of globs', {workspaces: ['{packages/*,tools/*}']}],
  ])('stops at the project root when the workspace %s', (_label, rootFields) => {
    writeProject(tmpDir, {private: true, ...rootFields});
    install(tmpDir, '@astryxdesign/core', '0.7.1');
    const project = writeProject(path.join(tmpDir, 'apps', 'web'), DECLARES_CORE);

    expect(findProjectPackageOf(project, NAMES)).toBeNull();
  });

  // AST-040 FR11: a Plug'n'Play project that declares Core keeps no
  // node_modules copy; the runtime answers for it.
  it("asks Yarn Plug'n'Play for a project that declares Core and has no node_modules copy", () => {
    const store = writePackage(path.join(tmpDir, 'store', '@astryxdesign-core'), '@astryxdesign/core', '0.7.1');
    const project = withPnp({'@astryxdesign/core': store});
    writeProject(project, DECLARES_CORE);

    expect(fs.existsSync(path.join(project, 'node_modules', '@astryxdesign'))).toBe(false);
    expect(findProjectPackageOf(project, NAMES)).toEqual({name: '@astryxdesign/core', packageDir: store});
  });

  // A project nested in another, outside any workspace, has its own install.
  it('stops at the root of a nested project outside any workspace', () => {
    writeProject(tmpDir, {dependencies: {'@astryxdesign/core': '0.8.0'}});
    install(tmpDir, '@astryxdesign/core', '0.8.0');
    const nested = writeProject(path.join(tmpDir, 'apps', 'web'), {dependencies: {'@astryxdesign/core': '0.9.0'}});

    expect(findProjectPackageOf(nested, NAMES)).toBeNull();
  });

  // With no Astryx project, released versions read only this folder's own
  // node_modules.
  it('reads only the folder itself when no Astryx project contains it', () => {
    writeProject(tmpDir);
    install(tmpDir, '@astryxdesign/core', '0.7.1');
    const plain = writeProject(path.join(tmpDir, 'plain'));

    expect(findProjectPackageOf(plain, NAMES)).toBeNull();
    const own = install(plain, '@astryxdesign/core', '0.7.1');
    expect(findProjectPackageOf(plain, NAMES)).toEqual({name: '@astryxdesign/core', packageDir: own});
  });
});

describe('findAstryxProject', () => {
  it('is the nearest folder whose package.json declares an Astryx package', () => {
    writeProject(tmpDir, DECLARES_CORE);
    const tool = writeProject(path.join(tmpDir, 'tools', 'lint'));
    const deep = path.join(tool, 'src');
    fs.mkdirSync(deep, {recursive: true});

    expect(findAstryxProject(deep)).toBe(tmpDir);
    const app = writeProject(path.join(tmpDir, 'apps', 'web'), {devDependencies: {'@astryxdesign/cli': '0.7.1'}});
    expect(findAstryxProject(app)).toBe(app);
  });

  it('counts a peer declaration and the legacy scope', () => {
    const integration = writeProject(path.join(tmpDir, 'integration'), {peerDependencies: {'@astryxdesign/core': '^0.7.0'}});
    const legacy = writeProject(path.join(tmpDir, 'legacy'), {dependencies: {'@xds/core': '0.3.0'}});

    expect(findAstryxProject(integration)).toBe(integration);
    expect(findAstryxProject(legacy)).toBe(legacy);
  });

  it('stops at a repository root', () => {
    writeProject(tmpDir, DECLARES_CORE);
    const repo = writeProject(path.join(tmpDir, 'repo'));
    fs.mkdirSync(path.join(repo, '.git'));
    const tools = path.join(repo, 'tools');
    fs.mkdirSync(tools, {recursive: true});

    expect(findAstryxProject(tools)).toBeNull();
  });

  it('never counts the home folder', () => {
    writeProject(tmpDir, DECLARES_CORE);
    const desktop = path.join(tmpDir, 'Desktop');
    fs.mkdirSync(desktop, {recursive: true});

    withHome(tmpDir, () => {
      expect(findAstryxProject(desktop)).toBeNull();
      expect(findAstryxProject(tmpDir)).toBeNull();
    });
  });

  it('returns null when no folder declares Astryx', () => {
    writeProject(tmpDir);

    expect(findAstryxProject(tmpDir)).toBeNull();
  });

  it('counts a member its workspace lists when the workspace root declares Astryx', () => {
    writeProject(tmpDir, {private: true, workspaces: ['apps/*'], ...DECLARES_CORE});
    const member = writeProject(path.join(tmpDir, 'apps', 'web'));
    const tests = writeProject(path.join(member, 'e2e'));

    expect(findAstryxProject(path.join(member, 'src'))).toBe(member);
    expect(findAstryxProject(tests)).toBe(member);
    const other = writeProject(path.join(tmpDir, 'tools', 'lint'));
    expect(findAstryxProject(other)).toBe(tmpDir);
  });
});

describe('findPackageRoot', () => {
  it('finds the nearest package.json at or above the folder', () => {
    writeProject(tmpDir);
    const app = writeProject(path.join(tmpDir, 'apps', 'web'));
    const deep = path.join(app, 'src', 'app');
    fs.mkdirSync(deep, {recursive: true});

    expect(findPackageRoot(deep)).toBe(app);
    expect(findPackageRoot(tmpDir)).toBe(tmpDir);
  });

  it('returns null with no package.json', () => {
    expect(findPackageRoot(tmpDir)).toBeNull();
  });
});

describe('findWorkspaceRoot', () => {
  it('finds the nearest folder that declares workspaces in package.json', () => {
    writeProject(tmpDir, {private: true, workspaces: ['apps/*']});
    const member = writeProject(path.join(tmpDir, 'apps', 'web'));

    expect(findWorkspaceRoot(path.join(member, 'src'))).toBe(tmpDir);
  });

  it('finds the nearest folder with pnpm-workspace.yaml', () => {
    writeProject(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    const member = writeProject(path.join(tmpDir, 'apps', 'web'));

    expect(findWorkspaceRoot(member)).toBe(tmpDir);
  });

  it('is the nearest package.json outside a workspace, and the folder itself with none', () => {
    const app = writeProject(path.join(tmpDir, 'app'));
    const src = path.join(app, 'src');
    fs.mkdirSync(src, {recursive: true});

    expect(findWorkspaceRoot(src)).toBe(app);
    expect(findWorkspaceRoot(tmpDir)).toBe(tmpDir);
  });
});

describe('findNodeModulesPackage', () => {
  it('finds a package hoisted to a workspace root and names the folder that holds it', () => {
    const hoisted = install(tmpDir, '@acme/widgets', '1.0.0');
    const member = path.join(tmpDir, 'apps', 'web');
    fs.mkdirSync(member, {recursive: true});

    expect(findNodeModulesPackage(member, '@acme/widgets')).toEqual({packageDir: hoisted, hostDir: tmpDir});
  });

  it('does not ask Plug\'n\'Play', () => {
    const store = writePackage(path.join(tmpDir, 'store', 'acme-widgets'), '@acme/widgets');
    const project = withPnp({'@acme/widgets': store});

    expect(findNodeModulesPackage(project, '@acme/widgets')).toBeNull();
  });
});

describe('findProjectRoot', () => {
  it('finds root with workspaces in package.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'root', workspaces: ['packages/*']}),
    );

    const nested = path.join(tmpDir, 'packages', 'foo');
    fs.mkdirSync(nested, {recursive: true});

    expect(findProjectRoot(nested)).toBe(tmpDir);
  });

  it('returns null when no workspaces found', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'no-workspaces'}),
    );

    expect(findProjectRoot(tmpDir)).toBeNull();
  });
});

describe('discoverExternalPackages', () => {
  it('finds packages with an "astryx" field in package.json', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const extDir = path.join(nm, 'astryx-charts');
    fs.mkdirSync(extDir, {recursive: true});
    fs.writeFileSync(
      path.join(extDir, 'package.json'),
      JSON.stringify({
        name: 'astryx-charts',
        astryx: {docs: './src', category: 'Data Viz'},
      }),
    );

    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([
      {
        name: 'astryx-charts',
        category: 'Data Viz',
        docsDir: path.join(extDir, 'src'),
        blocksDir: null,
      },
    ]);
  });

  it('handles scoped packages (@org/pkg)', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const scopedDir = path.join(nm, '@acme', 'astryx-widgets');
    fs.mkdirSync(scopedDir, {recursive: true});
    fs.writeFileSync(
      path.join(scopedDir, 'package.json'),
      JSON.stringify({
        name: '@acme/astryx-widgets',
        astryx: {docs: './lib', category: 'Widgets'},
      }),
    );

    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([
      {
        name: '@acme/astryx-widgets',
        category: 'Widgets',
        docsDir: path.join(scopedDir, 'lib'),
        blocksDir: null,
      },
    ]);
  });

  it('skips @astryxdesign/core', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const coreDir = path.join(nm, '@astryxdesign', 'core');
    fs.mkdirSync(coreDir, {recursive: true});
    fs.writeFileSync(
      path.join(coreDir, 'package.json'),
      JSON.stringify({
        name: '@astryxdesign/core',
        astryx: {docs: './src'},
      }),
    );

    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([]);
  });

  it('skips packages without "astryx" field', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const extDir = path.join(nm, 'some-lib');
    fs.mkdirSync(extDir, {recursive: true});
    fs.writeFileSync(
      path.join(extDir, 'package.json'),
      JSON.stringify({name: 'some-lib'}),
    );

    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([]);
  });

  it('defaults category to package name when not specified', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const extDir = path.join(nm, 'my-components');
    fs.mkdirSync(extDir, {recursive: true});
    fs.writeFileSync(
      path.join(extDir, 'package.json'),
      JSON.stringify({
        name: 'my-components',
        astryx: {docs: './docs'},
      }),
    );

    const result = discoverExternalPackages(tmpDir);
    expect(result[0].category).toBe('my-components');
  });

  it('returns empty array when no node_modules found', () => {
    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([]);
  });

  it('walks up directories to find node_modules', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const extDir = path.join(nm, 'astryx-ext');
    fs.mkdirSync(extDir, {recursive: true});
    fs.writeFileSync(
      path.join(extDir, 'package.json'),
      JSON.stringify({
        name: 'astryx-ext',
        astryx: {docs: './src'},
      }),
    );

    const nested = path.join(tmpDir, 'packages', 'app');
    fs.mkdirSync(nested, {recursive: true});

    const result = discoverExternalPackages(nested);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('astryx-ext');
  });

  it('handles invalid JSON in package.json gracefully', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const extDir = path.join(nm, 'bad-json');
    fs.mkdirSync(extDir, {recursive: true});
    fs.writeFileSync(path.join(extDir, 'package.json'), '{not valid json!!!');

    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([]);
  });
});

describe('listComponents', () => {
  it('returns sorted component directory names, skipping hooks/theme/utils', () => {
    const srcDir = path.join(tmpDir, 'src');
    for (const dir of ['Button', 'Avatar', 'hooks', 'theme', 'utils', 'Zebra']) {
      fs.mkdirSync(path.join(srcDir, dir), {recursive: true});
    }

    const result = listComponents(tmpDir);
    expect(result).toEqual(['Avatar', 'Button', 'Zebra']);
  });

  it('returns empty array when src dir is missing', () => {
    expect(listComponents(tmpDir)).toEqual([]);
  });
});

describe('existsCaseExact', () => {
  it('accepts the real spelling and rejects a case variant of the file', () => {
    fs.writeFileSync(path.join(tmpDir, 'Button.doc.mjs'), '');

    expect(existsCaseExact(path.join(tmpDir, 'Button.doc.mjs'), tmpDir)).toBe(true);
    expect(existsCaseExact(path.join(tmpDir, 'button.doc.mjs'), tmpDir)).toBe(false);
    expect(existsCaseExact(path.join(tmpDir, 'BUTTON.DOC.MJS'), tmpDir)).toBe(false);
  });

  it('checks every segment below the root, not just the basename', () => {
    const dir = path.join(tmpDir, 'src', 'Button');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'Button.doc.mjs'), '');

    expect(existsCaseExact(path.join(tmpDir, 'src', 'Button', 'Button.doc.mjs'), tmpDir)).toBe(true);
    expect(existsCaseExact(path.join(tmpDir, 'src', 'button', 'Button.doc.mjs'), tmpDir)).toBe(false);
  });

  it('returns false for a missing path, and true for the root itself', () => {
    expect(existsCaseExact(path.join(tmpDir, 'nope.mjs'), tmpDir)).toBe(false);
    expect(existsCaseExact(tmpDir, tmpDir)).toBe(true);
  });

  it('refuses a target outside the root', () => {
    expect(existsCaseExact(os.tmpdir(), tmpDir)).toBe(false);
  });
});
