// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for autolink — loading an installed integration the
 * config does not name.
 *
 * The fixtures are the shapes that actually exist in the projects this
 * targets: a scaffold that added the dependency and wrote no config, an npm
 * alias, a package mid-rename declared under both spellings, and a hoisted
 * install. Temp dirs are repo-local because the loader dynamically imports the
 * manifest and Vite refuses to import out of the OS temp dir.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEPENDENCY_FIELDS,
  autolinkIntegrations,
  findAutolinkCandidates,
  readDeclaredDependencies,
  resolveInstalledPackageDir,
} from './autolink.mjs';
import {Project} from '../config/project.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-autolink-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Write a project package.json.
 * @param {string} dir
 * @param {object} fields
 */
function writeProject(dir, fields = {}) {
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'consumer', ...fields}),
  );
}

/**
 * Install a package under `<hostDir>/node_modules/<installAs>`.
 *
 * `installAs` is the directory (what an npm alias controls); `name` is the
 * package's own identity, which is a different string exactly when the
 * dependency is aliased.
 *
 * @param {string} hostDir
 * @param {object} options
 * @returns {string} the installed package directory
 */
function installPackage(
  hostDir,
  {
    installAs,
    name = installAs,
    version = '1.0.0',
    manifest = {components: './components'},
    manifestBasenames = ['astryx.integration.mjs'],
    componentName = 'Widget',
  } = {},
) {
  const pkgDir = path.join(hostDir, 'node_modules', ...installAs.split('/'));
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name, version}),
  );
  for (const basename of manifestBasenames) {
    fs.writeFileSync(
      path.join(pkgDir, basename),
      typeof manifest === 'string'
        ? manifest
        : `export default ${JSON.stringify(manifest)};\n`,
    );
  }
  if (manifest && typeof manifest === 'object' && manifest.components) {
    const componentsDir = path.join(pkgDir, 'components');
    fs.mkdirSync(componentsDir, {recursive: true});
    fs.writeFileSync(
      path.join(componentsDir, `${componentName}.doc.mjs`),
      `export default {type: 'component', name: '${componentName}', usage: {description: 'A widget'}, props: []};\n`,
    );
    fs.writeFileSync(
      path.join(componentsDir, `${componentName}.tsx`),
      `export function ${componentName}() { return null; }\n`,
    );
  }
  return pkgDir;
}

/** @param {string} dir @param {string[]} integrations */
function writeConfig(dir, integrations) {
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    `export default ${JSON.stringify({integrations})};\n`,
  );
}

describe('readDeclaredDependencies', () => {
  it('reads dependencies, devDependencies and optionalDependencies — not peerDependencies', () => {
    writeProject(tmpDir, {
      dependencies: {a: '1'},
      devDependencies: {b: '1'},
      optionalDependencies: {c: '1'},
      peerDependencies: {d: '1'},
    });
    const declared = readDeclaredDependencies(tmpDir);
    expect(declared.map(entry => entry.name)).toEqual(['a', 'b', 'c']);
    expect(declared.map(entry => entry.field)).toEqual(DEPENDENCY_FIELDS);
  });

  it('keeps the first field a name is declared in', () => {
    writeProject(tmpDir, {
      dependencies: {a: '1'},
      devDependencies: {a: '2'},
    });
    expect(readDeclaredDependencies(tmpDir)).toEqual([
      {name: 'a', field: 'dependencies'},
    ]);
  });

  it('refuses a key that is not a bare package name', () => {
    writeProject(tmpDir, {
      dependencies: {'../evil': '1', '/abs': '1', './rel': '1', ok: '1'},
    });
    expect(readDeclaredDependencies(tmpDir).map(e => e.name)).toEqual(['ok']);
  });

  it('is empty when there is no readable package.json', () => {
    expect(readDeclaredDependencies(tmpDir)).toEqual([]);
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{not json');
    expect(readDeclaredDependencies(tmpDir)).toEqual([]);
  });
});

describe('resolveInstalledPackageDir', () => {
  it('finds a package hoisted to a parent node_modules', () => {
    const appDir = path.join(tmpDir, 'apps', 'web');
    writeProject(appDir);
    installPackage(tmpDir, {installAs: '@acme/widgets'});
    const resolved = resolveInstalledPackageDir('@acme/widgets', appDir);
    expect(resolved?.hostDir).toBe(tmpDir);
    expect(resolved?.packageDir).toBe(
      path.join(tmpDir, 'node_modules', '@acme', 'widgets'),
    );
  });

  it('prefers the nearest node_modules', () => {
    const appDir = path.join(tmpDir, 'apps', 'web');
    writeProject(appDir);
    installPackage(tmpDir, {installAs: '@acme/widgets'});
    installPackage(appDir, {installAs: '@acme/widgets'});
    expect(resolveInstalledPackageDir('@acme/widgets', appDir)?.hostDir).toBe(
      appDir,
    );
  });

  it('is null for a directory with no package.json', () => {
    writeProject(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'empty'), {recursive: true});
    expect(resolveInstalledPackageDir('empty', tmpDir)).toBeNull();
    expect(resolveInstalledPackageDir('../escape', tmpDir)).toBeNull();
  });
});

describe('findAutolinkCandidates', () => {
  it('probes declared dependencies only — never walks node_modules', () => {
    writeProject(tmpDir, {dependencies: {'@acme/widgets': '^1.0.0'}});
    installPackage(tmpDir, {installAs: '@acme/widgets'});
    installPackage(tmpDir, {installAs: '@acme/undeclared'});

    const candidates = findAutolinkCandidates(tmpDir);
    expect(candidates.map(candidate => candidate.spec)).toEqual([
      '@acme/widgets',
    ]);
  });

  it('ignores a transitive dependency that ships a manifest', () => {
    writeProject(tmpDir, {dependencies: {'@acme/widgets': '^1.0.0'}});
    const pkgDir = installPackage(tmpDir, {installAs: '@acme/widgets'});
    // @acme/widgets depends on @acme/inner; the project does not.
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@acme/widgets',
        version: '1.0.0',
        dependencies: {'@acme/inner': '^1.0.0'},
      }),
    );
    installPackage(tmpDir, {installAs: '@acme/inner'});

    expect(findAutolinkCandidates(tmpDir).map(c => c.spec)).toEqual([
      '@acme/widgets',
    ]);
  });

  it('skips a declared dependency with no manifest', () => {
    writeProject(tmpDir, {dependencies: {react: '^19.0.0'}});
    installPackage(tmpDir, {installAs: 'react', manifestBasenames: []});
    expect(findAutolinkCandidates(tmpDir)).toEqual([]);
  });

  it('skips a package with more than one root manifest instead of failing', () => {
    writeProject(tmpDir, {dependencies: {'@acme/widgets': '^1.0.0'}});
    installPackage(tmpDir, {
      installAs: '@acme/widgets',
      manifestBasenames: ['astryx.integration.mjs', 'astryx.integration.js'],
    });
    expect(findAutolinkCandidates(tmpDir)).toEqual([]);
  });

  it('collapses two dependency keys that link to one package directory', () => {
    // pnpm links every dependency from one store entry, so the two spellings of
    // a package mid-rename share a real path.
    writeProject(tmpDir, {
      dependencies: {'@acme/legacy-ui': '^0.5.0', '@acme/ui': '^0.1.0'},
    });
    const real = installPackage(tmpDir, {
      installAs: '@acme/ui',
      name: '@acme/ui',
      version: '0.1.22',
    });
    const linkDir = path.join(tmpDir, 'node_modules', '@acme');
    fs.mkdirSync(linkDir, {recursive: true});
    fs.symlinkSync(real, path.join(linkDir, 'legacy-ui'), 'dir');

    const candidates = findAutolinkCandidates(tmpDir);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].spec).toBe('@acme/legacy-ui');
  });

  it('excludes package directories already loaded', () => {
    writeProject(tmpDir, {dependencies: {'@acme/widgets': '^1.0.0'}});
    const pkgDir = installPackage(tmpDir, {installAs: '@acme/widgets'});
    expect(findAutolinkCandidates(tmpDir, {exclude: [pkgDir]})).toEqual([]);
  });
});

describe('autolinkIntegrations', () => {
  it('loads a declared dependency that ships a manifest, and marks it', async () => {
    writeProject(tmpDir, {dependencies: {'@acme/widgets': '^1.0.0'}});
    installPackage(tmpDir, {installAs: '@acme/widgets'});

    const [integration, ...rest] = await autolinkIntegrations({
      projectDir: tmpDir,
    });
    expect(rest).toEqual([]);
    expect(integration.name).toBe('@acme/widgets');
    expect(integration.__autolinked).toBe(true);
    expect(integration.__dependencyField).toBe('dependencies');
    expect(integration.components).toBe(
      path.join(tmpDir, 'node_modules', '@acme', 'widgets', 'components'),
    );
  });

  it('reads the dependency KEY, never the value', async () => {
    // Every one of these is a real installed shape and none is a semver range.
    writeProject(tmpDir, {
      dependencies: {
        '@acme/legacy-ui': 'npm:@acme/ui@0.1.22',
        '@acme/linked': 'link:../linked',
        '@acme/filed': 'file:../filed',
      },
      devDependencies: {
        '@acme/workspaced': 'workspace:*',
        '@acme/cataloged': 'catalog:',
      },
    });
    // The aliased key installs a package whose own name is the aliased one.
    installPackage(tmpDir, {
      installAs: '@acme/legacy-ui',
      name: '@acme/ui',
      version: '0.1.22',
    });
    for (const installAs of [
      '@acme/linked',
      '@acme/filed',
      '@acme/workspaced',
      '@acme/cataloged',
    ]) {
      installPackage(tmpDir, {installAs});
    }

    const loaded = await autolinkIntegrations({projectDir: tmpDir});
    expect(loaded.map(i => i.name)).toEqual([
      // Identity is the resolved package's own name, not the key it is under.
      '@acme/ui',
      '@acme/linked',
      '@acme/filed',
      '@acme/workspaced',
      '@acme/cataloged',
    ]);
    const aliased = loaded[0];
    expect(aliased.__spec).toBe('@acme/legacy-ui');
    expect(aliased.version).toBe('0.1.22');
  });

  it('loads one integration when both spellings of a rename are installed', async () => {
    // Mid-rename, with two directories on disk rather than one linked store
    // entry: the package name is the identity that collapses them.
    writeProject(tmpDir, {
      dependencies: {'@acme/legacy-ui': '^0.5.0', '@acme/ui': '^0.1.0'},
    });
    installPackage(tmpDir, {
      installAs: '@acme/legacy-ui',
      name: '@acme/ui',
      version: '0.1.22',
    });
    installPackage(tmpDir, {
      installAs: '@acme/ui',
      name: '@acme/ui',
      version: '0.1.22',
    });

    const loaded = await autolinkIntegrations({projectDir: tmpDir});
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('@acme/ui');
  });

  it('does not load one already loaded from config', async () => {
    writeProject(tmpDir, {dependencies: {'@acme/widgets': '^1.0.0'}});
    const pkgDir = installPackage(tmpDir, {installAs: '@acme/widgets'});
    const loaded = await autolinkIntegrations({
      projectDir: tmpDir,
      loaded: [
        /** @type {any} */ ({name: '@acme/widgets', __packageDir: pkgDir}),
      ],
    });
    expect(loaded).toEqual([]);
  });

  it('drops a dependency whose manifest is broken, and raises no issue for it', async () => {
    // The project cannot fix a dependency's packaging bug, so autolink must not
    // hand it one to look at. Both failure modes: a manifest that throws on
    // import, and one that loads but fails schema validation.
    writeProject(tmpDir, {
      dependencies: {
        '@acme/throws': '^1.0.0',
        '@acme/invalid': '^1.0.0',
        '@acme/widgets': '^1.0.0',
      },
    });
    installPackage(tmpDir, {
      installAs: '@acme/throws',
      manifest: 'throw new Error("boom");\n',
    });
    installPackage(tmpDir, {
      installAs: '@acme/invalid',
      manifest: {components: 42},
    });
    installPackage(tmpDir, {installAs: '@acme/widgets'});

    const loaded = await autolinkIntegrations({projectDir: tmpDir});
    expect(loaded.map(i => i.name)).toEqual(['@acme/widgets']);

    const project = await Project.load(tmpDir);
    expect(await project.issues()).toEqual([]);
  });
});

describe('Project.load with autolink', () => {
  it('discovers components from an installed integration with no config at all', async () => {
    // The population this exists for: the scaffold added the dependency and
    // wrote no astryx.config, so the CLI used to report the component missing.
    writeProject(tmpDir, {dependencies: {'@acme/widgets': '^1.0.0'}});
    installPackage(tmpDir, {
      installAs: '@acme/widgets',
      componentName: 'MetaOncall',
    });

    const project = await Project.load(tmpDir);
    expect(project.configPath).toBeNull();
    expect(project.integrations).toEqual([]);
    expect(project.loadedIntegrations.map(i => i.name)).toEqual([
      '@acme/widgets',
    ]);
    const components = await project.components();
    expect(components.map(component => component.name)).toContain('MetaOncall');
  });

  it('keeps a configured integration explicit and puts autolinked ones after it', async () => {
    writeProject(tmpDir, {
      dependencies: {'@acme/widgets': '^1.0.0', '@acme/extras': '^1.0.0'},
    });
    writeConfig(tmpDir, ['@acme/widgets']);
    installPackage(tmpDir, {installAs: '@acme/widgets'});
    installPackage(tmpDir, {
      installAs: '@acme/extras',
      componentName: 'Extra',
    });

    const project = await Project.load(tmpDir);
    expect(project.integrations).toEqual(['@acme/widgets']);
    expect(
      project.loadedIntegrations.map(i => [i.name, i.__autolinked ?? false]),
    ).toEqual([
      ['@acme/widgets', false],
      ['@acme/extras', true],
    ]);
  });

  it('resolves a dependency hoisted to a workspace root', async () => {
    const appDir = path.join(tmpDir, 'apps', 'web');
    writeProject(appDir, {dependencies: {'@acme/widgets': '^1.0.0'}});
    installPackage(tmpDir, {installAs: '@acme/widgets'});

    const project = await Project.load(appDir);
    expect(project.loadedIntegrations.map(i => i.name)).toEqual([
      '@acme/widgets',
    ]);
  });

  it('leaves a project with no astryx dependencies untouched', async () => {
    writeProject(tmpDir, {dependencies: {react: '^19.0.0'}});
    installPackage(tmpDir, {installAs: 'react', manifestBasenames: []});

    const project = await Project.load(tmpDir);
    expect(project.loadedIntegrations).toEqual([]);
    expect(await project.issues()).toEqual([]);
  });
});
