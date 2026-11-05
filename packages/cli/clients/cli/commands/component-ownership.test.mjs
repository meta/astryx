// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  discoverIntegrationComponents,
  discoverOwnedComponents,
  findIntegrationComponentDoc,
  findIntegrationComponentSource,
  CORE_PACKAGE,
} from '../../../foundation/discovery/component-discovery.mjs';

// The api `component()` reads integrations via Project.load(). In the vitest
// environment, Vite's `server.fs.allow` only permits loading modules from
// under `node_modules`, so a real astryx.config.mjs at a tmp root cannot be
// imported. We therefore mock Project.load to return a project whose
// `loadedIntegrations` are resolved (exactly the shape lib/integrations.mjs
// produces) while keeping the integration's `components` dir on disk under
// node_modules so its `.doc.mjs` files load normally.
const projectLoadMock = vi.fn();
vi.mock('../../../foundation/config/project.mjs', () => ({
  Project: {load: (...args) => projectLoadMock(...args)},
}));

// Import the api AFTER the mock is registered.
const {component} = await import('../../../api/component/component.mjs');

// These are real-filesystem integration tests: each `component()` call scans
// the entire core library (recursive readdir + hundreds of existsSync probes).
// Under saturated parallel CI workers that I/O gets starved and can exceed the
// 5s default, surfacing as a spurious timeout. Size the budget to the work, as
// detail-levels.test.mjs already does for its discovery beforeAll.
vi.setConfig({testTimeout: 30_000, hookTimeout: 30_000});

let tmpDir;

const INTEGRATION_NAME = '@test/meta';
const INTEGRATION_ISSUES = 'https://example.com/meta/issues';

/**
 * Build a consumer fixture:
 * - packages/core symlinked to the real @astryxdesign/core (loadDocs source)
 * - node_modules/@test/meta with a `components` dir using the same-stem
 *   source/doc convention (MetaAppShell.tsx + MetaAppShell.doc.mjs)
 * Returns the absolute `components` dir so the Project.load mock can hand back a
 * resolved integration entry.
 */
function createFixture({
  withSource = true,
  extraComponent = null,
  packageExports = null,
  entryPoint = null,
} = {}) {
  const realCoreDir = path.resolve(import.meta.dirname, '..', '..', '..', '..', 'core');
  const coreDir = path.join(tmpDir, 'packages', 'core');
  fs.mkdirSync(path.dirname(coreDir), {recursive: true});
  fs.symlinkSync(realCoreDir, coreDir);

  const intDir = path.join(tmpDir, 'node_modules', '@test', 'meta');
  const compDir = path.join(intDir, 'components');
  fs.mkdirSync(compDir, {recursive: true});
  fs.writeFileSync(
    path.join(intDir, 'package.json'),
    JSON.stringify({
      name: INTEGRATION_NAME,
      version: '1.2.3',
      ...(packageExports ? {exports: packageExports} : {}),
    }),
  );
  fs.writeFileSync(
    path.join(compDir, 'MetaAppShell.doc.mjs'),
    `export default {\n  type: 'component',\n  name: 'MetaAppShell',\n  usage: { description: 'Meta-flavored app shell.' },\n  props: [{ name: 'title', type: 'string', description: 'Header title' }],\n};\n`,
  );
  if (withSource) {
    fs.writeFileSync(
      path.join(compDir, 'MetaAppShell.tsx'),
      "'use client';\nexport function MetaAppShell() { return null; }\n",
    );
  }
  if (extraComponent) {
    fs.writeFileSync(
      path.join(compDir, `${extraComponent}.doc.mjs`),
      `export default {\n  type: 'component',\n  name: '${extraComponent}',\n  usage: { description: '${extraComponent} from meta.' },\n  props: [],\n};\n`,
    );
    fs.writeFileSync(
      path.join(compDir, `${extraComponent}.tsx`),
      `export function ${extraComponent}() { return null; }\n`,
    );
  }

  // A component whose directory is an entry point exporting several
  // components, so the directory name and the component name differ.
  if (entryPoint) {
    const entryDir = path.join(compDir, entryPoint.directory);
    fs.mkdirSync(entryDir, {recursive: true});
    const ownSpecifier = entryPoint.importSpec
      ? `\n  import: '${entryPoint.importSpec}',`
      : '';
    fs.writeFileSync(
      path.join(entryDir, `${entryPoint.component}.doc.mjs`),
      `export default {\n  type: 'component',\n  name: '${entryPoint.component}',${ownSpecifier}\n  usage: { description: '${entryPoint.component} from an entry point.' },\n  props: [],\n};\n`,
    );
  }

  const integration = {
    name: INTEGRATION_NAME,
    version: '1.2.3',
    components: compDir,
    templates: undefined,
    codemods: undefined,
    issuesUrl: INTEGRATION_ISSUES,
    __packageDir: intDir,
  };
  projectLoadMock.mockResolvedValue({
    integrations: [INTEGRATION_NAME],
    loadedIntegrations: [integration],
  });
  return {coreDir, intDir, compDir, integration};
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-ownership-'));
  projectLoadMock.mockReset();
  // Default: no integrations (core only).
  projectLoadMock.mockResolvedValue({integrations: [], loadedIntegrations: []});
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('discoverIntegrationComponents (ownership records)', () => {
  it('records name, package, sourcePath, and issuesUrl for same-stem components', () => {
    const {integration, compDir} = createFixture();
    const records = discoverIntegrationComponents(integration);
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec.name).toBe('MetaAppShell');
    expect(rec.package).toBe(INTEGRATION_NAME);
    expect(rec.issuesUrl).toBe(INTEGRATION_ISSUES);
    expect(rec.sourcePath).toBe(path.join(compDir, 'MetaAppShell.tsx'));
    expect(fs.existsSync(rec.sourcePath)).toBe(true);
  });

  it('records sourcePath: null when the integration ships docs without source', () => {
    const {integration} = createFixture({withSource: false});
    const [rec] = discoverIntegrationComponents(integration);
    expect(rec.sourcePath).toBeNull();
  });
});

describe('discoverOwnedComponents (core + integrations)', () => {
  it('marks core components with the core package and integration components with their owner', () => {
    const {coreDir, integration} = createFixture();
    const records = discoverOwnedComponents(coreDir, [integration]);
    const core = records.find(r => r.package === CORE_PACKAGE);
    expect(core).toBeTruthy();
    expect(core.issuesUrl).toBeUndefined();
    const meta = records.find(r => r.name === 'MetaAppShell');
    expect(meta.package).toBe(INTEGRATION_NAME);
    expect(meta.issuesUrl).toBe(INTEGRATION_ISSUES);
    expect(meta.sourcePath).toContain('MetaAppShell.tsx');
  });
});

describe('findIntegrationComponentDoc / Source', () => {
  it('finds doc + source by name', () => {
    const {integration} = createFixture();
    expect(findIntegrationComponentDoc(integration, 'MetaAppShell')).toContain('MetaAppShell.doc.mjs');
    expect(findIntegrationComponentSource(integration, 'MetaAppShell')).toContain('MetaAppShell.tsx');
  });

  it('returns null source when none present', () => {
    const {integration} = createFixture({withSource: false});
    expect(findIntegrationComponentSource(integration, 'MetaAppShell')).toBeNull();
  });
});

describe('component() — integration ownership via config', () => {
  it('discovers a config integration component by package ownership (detail)', async () => {
    createFixture();
    const result = await component('MetaAppShell', {cwd: tmpDir});
    expect(result.type).toBe('component.detail');
    expect(result.data.name).toBe('MetaAppShell');
    expect(result.data.package).toBe(INTEGRATION_NAME);
    expect(result.data.sourceAvailable).toBe(true);
    // This fixture declares no `exports`, so there is no subpath to import
    // from and the specifier is the package root.
    expect(result.data.import).toBe(INTEGRATION_NAME);
  });

  it('--package resolves the integration component', async () => {
    createFixture();
    const result = await component('MetaAppShell', {cwd: tmpDir, package: INTEGRATION_NAME});
    expect(result.type).toBe('component.detail');
    expect(result.data.package).toBe(INTEGRATION_NAME);
  });

  it('--source returns the integration source when available', async () => {
    createFixture();
    const result = await component('MetaAppShell', {cwd: tmpDir, source: true});
    expect(result.type).toBe('component.detail.source');
    expect(result.data.component).toBe('MetaAppShell');
    expect(result.data.source).toContain('MetaAppShell');
  });

  it('--source throws ERR_NO_SOURCE when the integration ships no source', async () => {
    createFixture({withSource: false});
    await expect(
      component('MetaAppShell', {cwd: tmpDir, source: true}),
    ).rejects.toMatchObject({code: 'ERR_NO_SOURCE'});
  });

  it('errors with candidate packages when a name is ambiguous (core + integration)', async () => {
    // 'AppShell' exists in core; add a same-named integration component.
    createFixture({extraComponent: 'AppShell'});
    let caught;
    try {
      await component('AppShell', {cwd: tmpDir});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    expect(caught.code).toBe('ERR_AMBIGUOUS_COMPONENT');
    const pkgs = (caught.suggestions ?? []).map(s => s.name);
    expect(pkgs).toContain(CORE_PACKAGE);
    expect(pkgs).toContain(INTEGRATION_NAME);
  });

  it('--package disambiguates an ambiguous name to core', async () => {
    createFixture({extraComponent: 'AppShell'});
    const result = await component('AppShell', {cwd: tmpDir, package: CORE_PACKAGE});
    expect(result.type).toBe('component.detail');
    expect(result.data.package).toBe(CORE_PACKAGE);
  });

  it('--package disambiguates an ambiguous name to the integration', async () => {
    createFixture({extraComponent: 'AppShell'});
    const result = await component('AppShell', {cwd: tmpDir, package: INTEGRATION_NAME});
    expect(result.type).toBe('component.detail');
    expect(result.data.package).toBe(INTEGRATION_NAME);
  });

  it('resolves the import specifier against the package exports map', async () => {
    // The doc sits in a `Toolbar` directory but the component is
    // `ToolbarSearch`, so a specifier built from the component name would
    // point at a subpath the package does not export.
    createFixture({
      packageExports: {'.': './index.js', './Toolbar': './components/Toolbar/index.js'},
      entryPoint: {directory: 'Toolbar', component: 'ToolbarSearch'},
    });
    const result = await component('ToolbarSearch', {cwd: tmpDir});
    expect(result.data.import).toBe(`${INTEGRATION_NAME}/Toolbar`);
  });

  it('falls back to the package root when the directory is not an exported subpath', async () => {
    createFixture({
      packageExports: {'.': './index.js'},
      entryPoint: {directory: 'Toolbar', component: 'ToolbarSearch'},
    });
    const result = await component('ToolbarSearch', {cwd: tmpDir});
    expect(result.data.import).toBe(INTEGRATION_NAME);
  });

  it('keeps a specifier the doc file states for itself', async () => {
    createFixture({
      packageExports: {'.': './index.js', './Toolbar': './components/Toolbar/index.js'},
      entryPoint: {
        directory: 'Toolbar',
        component: 'ToolbarSearch',
        importSpec: `${INTEGRATION_NAME}/Toolbar/Search`,
      },
    });
    const result = await component('ToolbarSearch', {cwd: tmpDir});
    expect(result.data.import).toBe(`${INTEGRATION_NAME}/Toolbar/Search`);
  });

  it('reports every installed candidate for an ambiguous batch selector', async () => {
    createFixture({extraComponent: 'AppShell'});
    const result = await component(['MetaAppShell', 'AppShell'], {cwd: tmpDir});
    expect(result.type).toBe('component.batch');
    expect(result.data.results[0]).toMatchObject({
      selector: 'MetaAppShell',
      status: 'found',
    });
    expect(result.data.results[1]).toMatchObject({
      selector: 'AppShell',
      status: 'ambiguous',
      code: 'ERR_AMBIGUOUS_COMPONENT',
    });
    expect(result.data.results[1].candidates).toEqual(
      expect.arrayContaining([
        {
          package: CORE_PACKAGE,
          component: 'AppShell',
          kind: 'component',
          installed: true,
        },
        {
          package: INTEGRATION_NAME,
          component: 'AppShell',
          kind: 'component',
          installed: true,
        },
      ]),
    );
  });

  it('keeps the single-result envelope for one package-qualified selector', async () => {
    createFixture();
    const result = await component('@test/meta@1.2.3/MetaAppShell', {
      cwd: tmpDir,
    });
    expect(result.type).toBe('component.detail');
    expect(result.data).toMatchObject({
      name: 'MetaAppShell',
      package: INTEGRATION_NAME,
    });
  });

  it('resolves an exact installed package version and refuses another version', async () => {
    createFixture();
    const result = await component(
      [
        '@test/meta@1.2.3/MetaAppShell',
        '@test/meta@9.9.9/MetaAppShell',
      ],
      {cwd: tmpDir},
    );
    expect(result.type).toBe('component.batch');
    expect(result.data.results[0]).toMatchObject({
      selector: '@test/meta@1.2.3/MetaAppShell',
      status: 'found',
      result: {type: 'component.detail'},
    });
    expect(result.data.results[1]).toMatchObject({
      selector: '@test/meta@9.9.9/MetaAppShell',
      status: 'not_found',
      code: 'ERR_UNKNOWN_PACKAGE',
      suggestions: [
        {
          name: 'astryx discover @test/meta@9.9.9',
          reason: 'look up this package version',
        },
      ],
    });
  });

  it('reports a package-qualified selector that conflicts with --package', async () => {
    createFixture();
    const result = await component(
      ['@test/meta/MetaAppShell', 'Button'],
      {cwd: tmpDir, package: CORE_PACKAGE},
    );
    expect(result.type).toBe('component.batch');
    expect(result.data.results[0]).toMatchObject({
      selector: '@test/meta/MetaAppShell',
      status: 'error',
      code: 'ERR_INVALID_ARGUMENT',
    });
    expect(result.data.results[1]).toMatchObject({
      selector: 'Button',
      status: 'found',
    });
  });

  it('JSON list includes integration components as {name, package} objects', async () => {
    createFixture();
    const result = await component(undefined, {cwd: tmpDir, list: true});
    expect(result.type).toBe('component.list');
    expect(result.data.detail).toBe('names');
    const allEntries = Object.values(result.data.components).flat();
    for (const entry of allEntries) {
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.package).toBe('string');
    }
    const meta = allEntries.find(e => e.name === 'MetaAppShell');
    expect(meta).toBeTruthy();
    expect(meta.package).toBe(INTEGRATION_NAME);
    expect(allEntries.some(e => e.package === CORE_PACKAGE)).toBe(true);
  });
});
