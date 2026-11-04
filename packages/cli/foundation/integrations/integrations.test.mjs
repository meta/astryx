// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {Project} from '../config/project.mjs';
import {
  loadIntegrations,
  loadLocalIntegration,
  resolvePackageDir,
} from './integrations.mjs';
import {discover} from '../../api/discover/discover.mjs';

let tmpDir;
let originalCwd;

function writeManifestPackage(
  dir,
  {basename = 'astryx.integration.mjs', body},
) {
  const pkgDir = path.join(dir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name: '@acme/widgets',
      version: '1.2.3',
    }),
  );
  fs.writeFileSync(path.join(pkgDir, basename), body);
  return pkgDir;
}

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-integration-test-'),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default { integrations: ['@acme/widgets'] };\n`,
  );
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('configured integrations', () => {
  it('resolves identity from package.json and contribution roots to absolute paths', async () => {
    const pkgDir = writeManifestPackage(tmpDir, {
      body: `export default {
        components: './docs',
        templates: './blocks',
        codemods: './codemods',
        issuesUrl: 'https://example.com/issues',
      };\n`,
    });
    fs.mkdirSync(path.join(pkgDir, 'docs'));
    fs.writeFileSync(
      path.join(pkgDir, 'docs', 'Widget.doc.mjs'),
      `export const doc = {
        name: 'Widget',
        usage: {description: 'Acme widget'},
        props: [],
      };\n`,
    );

    const project = await Project.load(tmpDir);
    expect(project.integrations).toEqual(['@acme/widgets']);
    const loaded = project.loadedIntegrations[0];
    // Identity comes from package.json, not the manifest.
    expect(loaded.name).toBe('@acme/widgets');
    expect(loaded.providerId).toBe('@acme/widgets');
    expect(loaded.version).toBe('1.2.3');
    expect(loaded.components).toBe(path.join(pkgDir, 'docs'));
    expect(loaded.templates).toBe(path.join(pkgDir, 'blocks'));
    expect(loaded.codemods).toBe(path.join(pkgDir, 'codemods'));
    expect(loaded.issuesUrl).toBe('https://example.com/issues');
  });

  it('preserves provider identity across an explicit package rename', async () => {
    writeManifestPackage(tmpDir, {
      body: `export default {providerId: '@acme/legacy-widgets'};\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});
    expect(loaded.name).toBe('@acme/widgets');
    expect(loaded.providerId).toBe('@acme/legacy-widgets');
    expect(loaded.__unknownKeys).toEqual([]);
  });

  it('deduplicates package aliases by canonical provider identity', async () => {
    writeManifestPackage(tmpDir, {body: `export default {};\n`});
    const aliasDir = path.join(
      tmpDir,
      'node_modules',
      '@acme',
      'widgets-alias',
    );
    fs.mkdirSync(aliasDir, {recursive: true});
    fs.writeFileSync(
      path.join(aliasDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(aliasDir, 'astryx.integration.mjs'),
      `export default {};\n`,
    );

    const loaded = await loadIntegrations(
      ['@acme/widgets', '@acme/widgets-alias'],
      {cwd: tmpDir},
    );
    expect(loaded).toHaveLength(1);
    expect(loaded[0].providerId).toBe('@acme/widgets');
  });

  it('makes integration components discoverable', async () => {
    const pkgDir = writeManifestPackage(tmpDir, {
      body: `export default { components: './docs' };\n`,
    });
    fs.mkdirSync(path.join(pkgDir, 'docs'));
    fs.writeFileSync(
      path.join(pkgDir, 'docs', 'Widget.doc.mjs'),
      `export const doc = {
        name: 'Widget',
        usage: {description: 'Acme widget'},
        props: [],
      };\n`,
    );

    const result = await discover(undefined, {});
    expect(result.type).toBe('discover.list');
    expect(result.data).toEqual([
      expect.objectContaining({
        name: '@acme/widgets',
        category: '@acme/widgets',
        components: ['Widget'],
      }),
    ]);
  });

  it('loads agentDocs from the default manifest in authored order', async () => {
    const pkgDir = writeManifestPackage(tmpDir, {
      body: `export default {
        agentDocs: {
          append: ['after one', 'after two'],
        },
      };\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});
    expect(loaded.agentDocs).toEqual({
      append: ['after one', 'after two'],
    });
    expect(loaded.__unknownKeys).toEqual([]);

    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      `export default {agentDocs: {append: ['after rewrite']}};\n`,
    );
    const [fresh] = await loadIntegrations(['@acme/widgets'], {
      cwd: tmpDir,
      fresh: true,
    });
    expect(fresh.agentDocs).toEqual({append: ['after rewrite']});
  });

  it('ignores an agentDocs named export; the contract is the default manifest field', async () => {
    writeManifestPackage(tmpDir, {
      body: `export const agentDocs = {append: ['wrong place']};\nexport default {};\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});
    expect(loaded.agentDocs).toBeUndefined();
  });

  it.each([
    ['wrong outer shape', []],
    ['wrong append shape', {append: 'not-an-array'}],
    ['non-string entry', {append: ['ok', 42]}],
    [
      'too many lines',
      {append: Array.from({length: 9}, (_, i) => `line ${i}`)},
    ],
    ['too many code points', {append: ['😀'.repeat(241)]}],
    ['control character', {append: ['bad\u0001line']}],
    ['managed marker', {append: ['ASTRYX:START']}],
  ])(
    'isolates invalid agentDocs (%s) from valid roots',
    async (_label, agentDocs) => {
      const pkgDir = writeManifestPackage(tmpDir, {
        body: `export default ${JSON.stringify({
          components: './components',
          agentDocs,
        })};\n`,
      });
      fs.mkdirSync(path.join(pkgDir, 'components'));

      const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});

      expect(loaded.__loadError).toBeUndefined();
      expect(loaded.components).toBe(path.join(pkgDir, 'components'));
      expect(loaded.agentDocs).toBeUndefined();
      expect(loaded.__agentDocsError).toMatch(/agentDocs/i);
    },
  );

  it('errors when the package has no conventional root manifest', async () => {
    const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
    fs.mkdirSync(pkgDir, {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets'}),
    );
    await expect(
      loadIntegrations(['@acme/widgets'], {cwd: tmpDir}),
    ).rejects.toThrow(/no conventional root manifest/);
  });

  it('errors when the package has multiple root manifests', async () => {
    const pkgDir = writeManifestPackage(tmpDir, {
      body: `export default {};\n`,
    });
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.js'),
      `module.exports = {};\n`,
    );
    await expect(
      loadIntegrations(['@acme/widgets'], {cwd: tmpDir}),
    ).rejects.toThrow(/multiple root manifests/);
  });

  it('errors when the package is not installed', async () => {
    await expect(
      loadIntegrations(['@acme/missing'], {cwd: tmpDir}),
    ).rejects.toThrow(/Could not find installed integration package/);
  });
});

describe('provider identity conflicts', () => {
  /**
   * Install one integration package that contributes a single component.
   * @param {string} dir directory under node_modules
   * @param {{name: string, version: string}} pkg package.json identity
   * @param {Record<string, unknown>} manifest extra manifest fields
   * @param {string} component the component it contributes
   */
  function installPackage(dir, pkg, manifest, component) {
    const pkgDir = path.join(tmpDir, 'node_modules', ...dir.split('/'));
    const componentsDir = path.join(pkgDir, 'components');
    fs.mkdirSync(componentsDir, {recursive: true});
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      `export default ${JSON.stringify({components: './components', ...manifest})};\n`,
    );
    fs.writeFileSync(
      path.join(componentsDir, `${component}.doc.mjs`),
      `export default {type: 'component', name: '${component}', props: []};\n`,
    );
    fs.writeFileSync(
      path.join(componentsDir, `${component}.tsx`),
      `export function ${component}() { return null; }\n`,
    );
  }

  /** @param {string[]} integrations */
  function configure(integrations) {
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default ${JSON.stringify({integrations})};\n`,
    );
  }

  /**
   * Make the project directory itself the package being authored.
   * @param {Record<string, unknown>} pkg package.json fields
   * @param {Record<string, unknown>} manifest extra manifest fields
   * @param {string} component the component it contributes
   */
  function writeLocalPackage(pkg, manifest, component) {
    const componentsDir = path.join(tmpDir, 'local-components');
    fs.mkdirSync(componentsDir, {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default ${JSON.stringify({components: './local-components', ...manifest})};\n`,
    );
    fs.writeFileSync(
      path.join(componentsDir, `${component}.doc.mjs`),
      `export default {type: 'component', name: '${component}', props: []};\n`,
    );
    fs.writeFileSync(
      path.join(componentsDir, `${component}.tsx`),
      `export function ${component}() { return null; }\n`,
    );
  }

  /** @param {import('../config/project.mjs').Project} project */
  async function conflictIssues(project) {
    return (await project.issues()).filter(
      issue => issue.code === 'duplicate_provider',
    );
  }

  it('keeps the first package and reports a different package claiming its ID', async () => {
    installPackage(
      '@acme/widgets',
      {name: '@acme/widgets', version: '1.0.0'},
      {},
      'Widget',
    );
    installPackage(
      '@acme/renamed',
      {name: '@acme/renamed', version: '2.0.0'},
      {providerId: '@acme/widgets'},
      'RenamedWidget',
    );
    configure(['@acme/widgets', '@acme/renamed']);

    const loaded = await loadIntegrations(['@acme/widgets', '@acme/renamed'], {
      cwd: tmpDir,
    });
    expect(loaded.map(integration => integration.name)).toEqual([
      '@acme/widgets',
      '@acme/renamed',
    ]);
    expect(loaded[1]).toMatchObject({
      providerId: '@acme/widgets',
      __providerConflict: {
        providerId: '@acme/widgets',
        claimedBy: '@acme/widgets',
      },
    });
    expect(loaded[1].components).toBeUndefined();

    const project = await Project.load(tmpDir, {fresh: true});
    const owned = (await project.components()).map(component => [
      component.package,
      component.name,
    ]);
    expect(owned).toContainEqual(['@acme/widgets', 'Widget']);
    expect(owned.some(([pkg]) => pkg === '@acme/renamed')).toBe(false);
    expect(await project.issues()).toContainEqual(
      expect.objectContaining({
        package: '@acme/renamed@2.0.0',
        code: 'duplicate_provider',
        severity: 'warning',
        message: expect.stringContaining(
          '@acme/widgets@1.0.0 loads first and is used',
        ),
      }),
    );
  });

  it('reports the same package configured again at another version', async () => {
    installPackage(
      '@acme/widgets',
      {name: '@acme/widgets', version: '1.0.0'},
      {},
      'Widget',
    );
    installPackage(
      'widgets-next',
      {name: '@acme/widgets', version: '2.0.0'},
      {},
      'NextWidget',
    );
    configure(['@acme/widgets', 'widgets-next']);

    const project = await Project.load(tmpDir, {fresh: true});
    const owned = (await project.components()).map(component => component.name);
    expect(owned).toContain('Widget');
    expect(owned).not.toContain('NextWidget');
    expect(await project.issues()).toContainEqual(
      expect.objectContaining({
        package: '@acme/widgets@2.0.0',
        code: 'duplicate_provider',
        severity: 'warning',
        message: expect.stringContaining('(from "widgets-next")'),
      }),
    );
  });

  it('reports an autolinked dependency that claims a configured ID', async () => {
    installPackage(
      '@acme/widgets',
      {name: '@acme/widgets', version: '1.0.0'},
      {},
      'Widget',
    );
    installPackage(
      '@acme/renamed',
      {name: '@acme/renamed', version: '2.0.0'},
      {providerId: '@acme/widgets'},
      'RenamedWidget',
    );
    configure(['@acme/widgets']);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: {'@acme/renamed': '2.0.0'},
      }),
    );

    const project = await Project.load(tmpDir, {fresh: true});
    expect(
      project.loadedIntegrations.find(
        integration => integration.name === '@acme/renamed',
      ),
    ).toMatchObject({
      __autolinked: true,
      __providerConflict: {claimedBy: '@acme/widgets'},
    });
    expect(await project.issues()).toContainEqual(
      expect.objectContaining({
        package: '@acme/renamed@2.0.0',
        code: 'duplicate_provider',
      }),
    );
  });

  it("reports a set-aside package whose spec is the winner's name", async () => {
    installPackage(
      'widgets-old',
      {name: '@acme/widgets', version: '1.0.0'},
      {},
      'OldWidget',
    );
    installPackage(
      '@acme/widgets',
      {name: '@acme/widgets', version: '2.0.0'},
      {},
      'NewWidget',
    );
    configure(['widgets-old', '@acme/widgets']);

    const project = await Project.load(tmpDir, {fresh: true});
    const owned = (await project.components()).map(component => component.name);
    expect(owned).toContain('OldWidget');
    expect(owned).not.toContain('NewWidget');
    expect(await conflictIssues(project)).toEqual([
      expect.objectContaining({
        package: '@acme/widgets@2.0.0',
        severity: 'warning',
        message: expect.stringContaining(
          '@acme/widgets@2.0.0 and @acme/widgets@1.0.0 (from "widgets-old") both claim',
        ),
      }),
    ]);
  });

  it('reports an unversioned set-aside package whose spec is the winner\'s name', async () => {
    installPackage(
      'widgets-old',
      {name: '@acme/widgets', version: '1.0.0'},
      {},
      'OldWidget',
    );
    installPackage('@acme/widgets', {name: '@acme/widgets'}, {}, 'NewWidget');
    configure(['widgets-old', '@acme/widgets']);

    const project = await Project.load(tmpDir, {fresh: true});
    expect(await conflictIssues(project)).toEqual([
      expect.objectContaining({
        package: '@acme/widgets',
        message: expect.stringContaining(
          '@acme/widgets@1.0.0 (from "widgets-old") loads first and is used',
        ),
      }),
    ]);
  });

  it('reports an autolinked alias of the same package at another version', async () => {
    installPackage(
      '@acme/legacy-ui',
      {name: '@acme/ui', version: '0.1.22'},
      {},
      'LegacyButton',
    );
    installPackage(
      '@acme/ui',
      {name: '@acme/ui', version: '1.0.0'},
      {},
      'NewButton',
    );
    fs.rmSync(path.join(tmpDir, 'astryx.config.mjs'));
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: {
          '@acme/legacy-ui': 'npm:@acme/ui@0.1.22',
          '@acme/ui': '1.0.0',
        },
      }),
    );

    const project = await Project.load(tmpDir, {fresh: true});
    const owned = (await project.components()).map(component => component.name);
    expect(owned).toContain('LegacyButton');
    expect(owned).not.toContain('NewButton');
    expect(await conflictIssues(project)).toEqual([
      expect.objectContaining({
        package: '@acme/ui@1.0.0',
        message: expect.stringContaining(
          '@acme/ui@1.0.0 and @acme/ui@0.1.22 (from "@acme/legacy-ui") both claim',
        ),
      }),
    ]);
  });

  it('recomputes conflicts after the authored package replaces its installed copy', async () => {
    installPackage(
      '@acme/widgets',
      {name: '@acme/widgets', version: '1.0.0'},
      {},
      'Widget',
    );
    installPackage(
      '@acme/renamed',
      {name: '@acme/renamed', version: '2.0.0'},
      {providerId: '@acme/widgets'},
      'RenamedWidget',
    );
    configure(['@acme/widgets', '@acme/renamed']);
    writeLocalPackage(
      {name: '@acme/widgets', version: '3.0.0-dev'},
      {providerId: '@acme/widgets-next'},
      'LocalWidget',
    );

    const project = await Project.load(tmpDir, {fresh: true});
    expect(
      project.loadedIntegrations.some(
        integration => integration.__providerConflict,
      ),
    ).toBe(false);
    const owned = (await project.components()).map(component => component.name);
    expect(owned).toEqual(
      expect.arrayContaining(['LocalWidget', 'RenamedWidget']),
    );
    expect(owned).not.toContain('Widget');
    expect(await conflictIssues(project)).toEqual([]);
  });

  it('lets the package being authored win over its installed predecessor', async () => {
    installPackage(
      '@acme/widgets',
      {name: '@acme/widgets', version: '1.0.0'},
      {},
      'Widget',
    );
    fs.rmSync(path.join(tmpDir, 'astryx.config.mjs'));
    writeLocalPackage(
      {
        name: '@acme/renamed',
        version: '2.0.0-dev',
        devDependencies: {'@acme/widgets': '1.0.0'},
      },
      {providerId: '@acme/widgets'},
      'RenamedWidget',
    );

    const project = await Project.load(tmpDir, {fresh: true});
    const owned = (await project.components()).map(component => component.name);
    expect(owned).toContain('RenamedWidget');
    expect(owned).not.toContain('Widget');
    expect(await conflictIssues(project)).toEqual([
      expect.objectContaining({
        package: '@acme/widgets@1.0.0',
        message: expect.stringContaining(
          '@acme/renamed@2.0.0-dev is the package being authored, so it is used',
        ),
      }),
    ]);
  });
});

describe('local integration self-resolution', () => {
  it('preserves a valid gapReport named export', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/local', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export const gapReport = {
  audience: 'internal',
  handle(report) { return {status: 'filed', message: report.component}; },
};
export default {};
`,
    );

    const loaded = await loadLocalIntegration(tmpDir, {fresh: true});

    expect(loaded).toMatchObject({
      name: '@acme/local',
      providerId: '@acme/local',
      __local: true,
    });
    expect(loaded?.__gapReport?.audience).toBe('internal');
    expect(
      loaded?.__gapReport?.handle(
        /** @type {any} */ ({component: 'LocalWidget'}),
        /** @type {any} */ ({signal: new AbortController().signal}),
      ),
    ).toEqual({status: 'filed', message: 'LocalWidget'});
    expect(loaded?.__gapReportError).toBeUndefined();
  });

  it('preserves a malformed gapReport error without dropping the manifest', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/local', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export const gapReport = {audience: 'internal', command: './report.mjs'};
export default {issuesUrl: 'https://example.com/issues'};
`,
    );

    const loaded = await loadLocalIntegration(tmpDir, {fresh: true});

    expect(loaded).toMatchObject({
      name: '@acme/local',
      issuesUrl: 'https://example.com/issues',
      __local: true,
    });
    expect(loaded?.__loadError).toBeUndefined();
    expect(loaded?.__gapReport).toBeUndefined();
    expect(loaded?.__gapReportError).toMatch(/gapReport.*handle/i);
  });
});

describe('resolvePackageDir — spec must be a bare package name', () => {
  it.each(['../../../etc', 'a/../../b', '/abs/evil', 'foo/..', '..'])(
    'rejects a traversal/absolute spec %s',
    spec => {
      expect(() => resolvePackageDir(spec, '/proj')).toThrow(
        /Invalid|outside node_modules/i,
      );
    },
  );

  it('accepts scoped and plain package names', () => {
    expect(resolvePackageDir('@acme/x', '/proj')).toBe(
      path.join('/proj', 'node_modules', '@acme', 'x'),
    );
    expect(resolvePackageDir('lodash', '/proj')).toBe(
      path.join('/proj', 'node_modules', 'lodash'),
    );
  });
});

describe('a broken integration manifest degrades gracefully (skip + warn)', () => {
  it('does not crash Project.load; other integrations still load and the error surfaces', async () => {
    // tmpDir already has @acme/widgets wired; add a good + bad alongside it.
    const config = `export default { integrations: ['@good/a', '@bad/b'] };\n`;
    fs.writeFileSync(path.join(tmpDir, 'astryx.config.mjs'), config);
    for (const [name, body] of [
      ['@good/a', 'export default {};'],
      ['@bad/b', 'throw new Error("boom manifest");'],
    ]) {
      const dir = path.join(tmpDir, 'node_modules', ...name.split('/'));
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({name, version: '1.0.0'}),
      );
      fs.writeFileSync(path.join(dir, 'astryx.integration.mjs'), body);
    }

    const project = await Project.load(tmpDir); // must not throw
    expect(project.loadedIntegrations.map(i => i.name)).toContain('@good/a');
    const issues = await project.issues();
    expect(issues.some(i => /boom manifest/.test(i.message))).toBe(true);
  });
});

describe('the `debug` named export', () => {
  // A NAMED export, not a manifest key. A key would have to be understood by
  // every CLI version already installed against the integration, and an older
  // one rejects an unknown key by discarding the whole manifest — components,
  // templates and codemods with it (#5119). A named export is simply not read
  // by a CLI that does not know about it.
  it('is carried out of the manifest module as __debug', async () => {
    writeManifestPackage(tmpDir, {
      body: `export const debug = () => {};\nexport default {issuesUrl: 'https://example.com/i'};\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});

    expect(typeof loaded.__debug).toBe('function');
    expect(loaded.issuesUrl).toBe('https://example.com/i');
  });

  it('leaves __debug undefined when the module does not export one', async () => {
    writeManifestPackage(tmpDir, {body: `export default {};\n`});

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});

    expect(loaded.__debug).toBeUndefined();
  });

  it('leaves __debug undefined when the export is not a function', async () => {
    writeManifestPackage(tmpDir, {
      body: `export const debug = 'not a function';\nexport default {};\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});

    expect(loaded.__debug).toBeUndefined();
  });

  it('does not become a manifest key, so it is not reported as an unknown one', async () => {
    writeManifestPackage(tmpDir, {
      body: `export const debug = () => {};\nexport default {};\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});

    expect(loaded.__unknownKeys).toEqual([]);
  });
});

describe('the `gapReport` named export', () => {
  it('loads a function handler without turning it into a manifest key', async () => {
    writeManifestPackage(tmpDir, {
      body:
        `const handle = async report => ({status: 'filed', message: report.component});\n` +
        `export const gapReport = {audience: 'public', handle};\n` +
        `export default {issuesUrl: 'https://example.com/i'};\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});

    expect(loaded.__gapReport?.audience).toBe('public');
    expect(typeof loaded.__gapReport?.handle).toBe('function');
    await expect(
      loaded.__gapReport?.handle(/** @type {any} */ ({component: 'Button'})),
    ).resolves.toEqual({
      status: 'filed',
      message: 'Button',
    });
    expect(loaded.__gapReportError).toBeUndefined();
    expect(loaded.__unknownKeys).toEqual([]);
    expect(loaded.issuesUrl).toBe('https://example.com/i');
  });

  it('isolates an invalid named handler from the default manifest', async () => {
    writeManifestPackage(tmpDir, {
      body:
        `export const gapReport = {audience: 'internal', command: './report.mjs'};\n` +
        `export default {issuesUrl: 'https://example.com/i'};\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});

    expect(loaded.__loadError).toBeUndefined();
    expect(loaded.__gapReport).toBeUndefined();
    expect(loaded.__gapReportError).toMatch(/gapReport/);
    expect(loaded.issuesUrl).toBe('https://example.com/i');
  });

  it('keeps a same-named default-manifest field unknown instead of treating it as a handler', async () => {
    writeManifestPackage(tmpDir, {
      body: `export default {gapReport: {audience: 'public', handle: () => {}}};\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});

    expect(loaded.__gapReport).toBeUndefined();
    expect(loaded.__unknownKeys).toEqual(['gapReport']);
  });
});

describe('the `discover` named export', () => {
  it('is carried out of the manifest module as __discover', async () => {
    writeManifestPackage(tmpDir, {
      body:
        `export async function discover() { return {schemaVersion: 1}; }\n` +
        `export default {issuesUrl: 'https://example.com/i'};\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});

    expect(typeof loaded.__discover).toBe('function');
    expect(loaded.__discoverError).toBeUndefined();
    expect(loaded.__unknownKeys).toEqual([]);
    expect(loaded.issuesUrl).toBe('https://example.com/i');
  });

  it('keeps the manifest and records why when the export is not a function', async () => {
    writeManifestPackage(tmpDir, {
      body:
        `export const discover = {url: 'https://example.com/catalog.json'};\n` +
        `export default {issuesUrl: 'https://example.com/i'};\n`,
    });

    const [loaded] = await loadIntegrations(['@acme/widgets'], {cwd: tmpDir});

    expect(loaded.__discover).toBeUndefined();
    expect(loaded.__discoverError).toContain('must be a function');
    expect(loaded.issuesUrl).toBe('https://example.com/i');
  });
});
