// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {Project, DEFAULT_ISSUES_URL, findConfigPath} from './project.mjs';
import {InMemoryConfigCache} from './config-cache.mjs';
import {getCliInvocation} from '../env/package-manager.mjs';
import * as componentDiscovery from '../discovery/component-discovery.mjs';
import {discoverCoreTemplates} from '../discovery/template-adapter.mjs';

let tmpDir;
let originalCwd;

/**
 * Scaffold a consumer project (package.json + astryx.config.mjs) under a
 * repo-local temp dir, plus an installed integration package under
 * node_modules. The repo-local location is required so Vite permits dynamic
 * import of the config/integration modules (it blocks /tmp).
 */
function scaffold({
  integrations = ['@acme/widgets'],
  issuesUrl,
  withComponents = true,
  withTemplates = true,
  templateId = 'hero',
  templateType = 'block',
  templateReplaces = null,
  withCodemods = true,
  brokenComponent = false,
  brokenCodemod = false,
  docs = null,
  unknownKeys = null,
  agentDocs = null,
  cliCommand = null,
  integrationIssuesUrl = 'https://example.com/widgets/issues',
} = {}) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  const config = {integrations};
  if (issuesUrl) config.issuesUrl = issuesUrl;
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default ${JSON.stringify(config)};\n`,
  );

  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );

  const manifest = {};
  if (withComponents) manifest.components = './components';
  if (withTemplates) manifest.templates = './templates';
  if (withCodemods) manifest.codemods = './codemods';
  if (docs) manifest.docs = './docs';
  if (agentDocs != null) manifest.agentDocs = agentDocs;
  if (cliCommand != null) manifest.cliCommand = cliCommand;
  if (unknownKeys) Object.assign(manifest, unknownKeys);
  if (integrationIssuesUrl) manifest.issuesUrl = integrationIssuesUrl;
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default ${JSON.stringify(manifest)};\n`,
  );

  if (withComponents) {
    const compDir = path.join(pkgDir, 'components');
    fs.mkdirSync(compDir, {recursive: true});
    fs.writeFileSync(
      path.join(compDir, 'Widget.doc.mjs'),
      `export const docs = { name: 'Widget', usage: {description: 'A widget'}, props: [] };\n`,
    );
    if (!brokenComponent) {
      fs.writeFileSync(
        path.join(compDir, 'Widget.tsx'),
        `export function Widget() { return null; }\n`,
      );
    }
    // brokenComponent => doc with no sibling .tsx (invalid_component issue).
  }

  if (withTemplates) {
    const tDir = path.join(pkgDir, 'templates');
    fs.mkdirSync(tDir, {recursive: true});
    fs.writeFileSync(
      path.join(tDir, `${templateId}.doc.mjs`),
      `export default { type: '${templateType}', name: 'Fixture template', description: 'A fixture template'${templateReplaces == null ? '' : `, replaces: ${JSON.stringify(templateReplaces)}`} };\n`,
    );
    fs.writeFileSync(
      path.join(tDir, `${templateId}.tsx`),
      `export default function FixtureTemplate() { return null; }\n`,
    );
  }

  if (withCodemods) {
    const cmDir = path.join(pkgDir, 'codemods', '0.2.0');
    fs.mkdirSync(cmDir, {recursive: true});
    if (brokenCodemod) {
      fs.writeFileSync(
        path.join(cmDir, 'bad.mjs'),
        `export default { not: 'a codemod' };\n`,
      );
    } else {
      fs.writeFileSync(
        path.join(cmDir, 'drop-foo.mjs'),
        `export default { type: 'code', title: 'Drop foo', transform: (file) => file.source };\n`,
      );
    }
  }

  if (docs) {
    const docsDir = path.join(pkgDir, 'docs');
    fs.mkdirSync(docsDir, {recursive: true});
    for (const [file, doc] of Object.entries(docs)) {
      fs.writeFileSync(
        path.join(docsDir, file),
        typeof doc === 'string'
          ? doc
          : `export const docs = ${JSON.stringify(doc, null, 2)};\n`,
      );
    }
  }

  return pkgDir;
}

/** A minimal, valid topic for the docs-root fixtures. */
function topicDoc(fields) {
  return {
    type: 'generic',
    name: 'deploying',
    title: 'Deploying',
    description: 'How to ship it.',
    sections: [
      {title: 'Overview', content: [{type: 'prose', text: 'Ship it.'}]},
    ],
    ...fields,
  };
}

/** Scaffold the package being authored, with no config and no installation. */
function scaffoldLocalPackage({name = '@acme/local'} = {}) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name, version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    `export default {
      components: './components',
      templates: './templates',
      docs: './docs',
      themes: './themes',
    };\n`,
  );

  fs.mkdirSync(path.join(tmpDir, 'components'));
  fs.writeFileSync(
    path.join(tmpDir, 'components', 'LocalWidget.doc.mjs'),
    `export default {type: 'component', name: 'LocalWidget', props: []};\n`,
  );
  fs.writeFileSync(
    path.join(tmpDir, 'components', 'LocalWidget.tsx'),
    `export function LocalWidget() { return null; }\n`,
  );

  fs.mkdirSync(path.join(tmpDir, 'templates'));
  fs.writeFileSync(
    path.join(tmpDir, 'templates', 'local-page.doc.mjs'),
    `export default {type: 'page', name: 'Local page', description: 'Local page.'};\n`,
  );
  fs.writeFileSync(
    path.join(tmpDir, 'templates', 'local-page.tsx'),
    `export default function LocalPage() { return null; }\n`,
  );

  fs.mkdirSync(path.join(tmpDir, 'docs'));
  fs.writeFileSync(
    path.join(tmpDir, 'docs', 'local-guide.doc.mjs'),
    `export default ${JSON.stringify(
      topicDoc({name: 'local-guide', title: 'Local guide'}),
    )};\n`,
  );

  fs.mkdirSync(path.join(tmpDir, 'themes', 'ocean'), {recursive: true});
  fs.writeFileSync(
    path.join(tmpDir, 'themes', 'ocean', 'oceanTheme.doc.mjs'),
    `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Ocean theme.', maintained: true};\n`,
  );
  fs.writeFileSync(
    path.join(tmpDir, 'themes', 'ocean', 'oceanTheme.ts'),
    `export const oceanTheme = {};\n`,
  );
}

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-project-test-'));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
  vi.restoreAllMocks();
});

describe('Project.load', () => {
  it('returns an empty config + no integrations when no config file exists', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    const project = await Project.load(tmpDir);
    expect(project.config).toEqual({integrations: []});
    expect(project.integrations).toEqual([]);
    expect(project.loadedIntegrations).toEqual([]);
    expect(project.cwd).toBe(tmpDir);
  });

  it('self-resolves the package being authored through every consumer surface', async () => {
    scaffoldLocalPackage();

    const project = await Project.load(tmpDir);

    expect(project.loadedIntegrations).toHaveLength(1);
    expect(project.loadedIntegrations[0]).toMatchObject({
      name: '@acme/local',
      __local: true,
    });
    expect(
      (await project.components()).some(
        component =>
          component.name === 'LocalWidget' &&
          component.package === '@acme/local',
      ),
    ).toBe(true);
    expect(
      (await project.templates()).some(
        template =>
          template.dirName === 'local-page' &&
          template.package === '@acme/local',
      ),
    ).toBe(true);
    expect((await project.docs()).resolve('local-guide')).toMatchObject({
      package: '@acme/local',
    });
    expect(await project.themes()).toContainEqual(
      expect.objectContaining({slug: 'ocean', package: '@acme/local'}),
    );
  });

  it('prefers local bytes over an installed copy of the same package', async () => {
    scaffold();
    scaffoldLocalPackage({name: '@acme/widgets'});

    const project = await Project.load(tmpDir);

    expect(project.loadedIntegrations).toHaveLength(1);
    expect(project.loadedIntegrations[0].__local).toBe(true);
    const owned = (await project.components()).filter(
      component => component.package === '@acme/widgets',
    );
    expect(owned.map(component => component.name)).toEqual(['LocalWidget']);
  });

  it('exposes the validated config surface and loaded integrations', async () => {
    scaffold({issuesUrl: 'https://example.com/issues'});
    const project = await Project.load(tmpDir);
    expect(project.config.issuesUrl).toBe('https://example.com/issues');
    expect(project.integrations).toEqual(['@acme/widgets']);
    expect(project.loadedIntegrations).toHaveLength(1);
    expect(project.loadedIntegrations[0].name).toBe('@acme/widgets');
  });

  it('rejects an invalid config shape (strict validation)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default { integrations: [42] };\n`,
    );
    await expect(Project.load(tmpDir)).rejects.toThrow(/integrations/);
  });
});

describe('Project.issues and a near-miss manifest key', () => {
  it.each([
    [
      'alone, while the loaded integration fills providerId from the package name',
      {providerID: '@acme/widgets'},
      'Fix: rename "providerID" to "providerId" in astryx.integration.mjs.',
    ],
    [
      'beside the key it suggests',
      {providerID: '@acme/widgets', providerId: '@acme/widgets'},
      'Fix: remove "providerID" from astryx.integration.mjs; it already sets "providerId".',
    ],
  ])(
    'reads the keys the manifest declares: providerID %s',
    async (_label, unknownKeys, fix) => {
      scaffold({unknownKeys});
      const project = await Project.load(tmpDir);
      const keys = (await project.issues()).filter(
        issue => issue.code === 'unknown_manifest_key',
      );
      expect(keys).toHaveLength(1);
      expect(keys[0].message).toContain(fix);
    },
  );
});

describe('Project.load and the cliCommand an integration declares', () => {
  it('records it, so the picker prints commands with it', async () => {
    scaffold({cliCommand: 'acme astryx'});
    const project = await Project.load(tmpDir);
    expect(project.loadedIntegrations[0].cliCommand).toBe('acme astryx');
    expect(getCliInvocation(tmpDir)).toBe('acme astryx');
  });

  it('ignores an invalid one with a warning and keeps the rest of the package', async () => {
    scaffold({cliCommand: ' acme astryx\n'});
    const project = await Project.load(tmpDir);
    const [widgets] = project.loadedIntegrations;
    expect(widgets.__loadError).toBeUndefined();
    expect(widgets.cliCommand).toBeUndefined();
    expect(widgets.components).toBeDefined();
    expect(getCliInvocation(tmpDir)).not.toContain('acme astryx');
    const issues = await project.issues();
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'invalid_cli_command',
        severity: 'warning',
      }),
    );
  });

  it('drops a previous load once the declaration is gone', async () => {
    scaffold({cliCommand: 'acme astryx'});
    await Project.load(tmpDir);
    scaffold();
    await Project.load(tmpDir, {fresh: true});
    expect(getCliInvocation(tmpDir)).not.toBe('acme astryx');
  });
});

describe("Project.load({core: 'project'})", () => {
  it('reads only the installed Core, never the Core the answering release carries', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-project-core-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({name: 'a', dependencies: {'@astryxdesign/core': '^0.7.0'}}),
      );
      const any = await Project.load(dir);
      const own = await Project.load(dir, {core: 'project'});
      // The CLI in this repository carries the Core beside it.
      expect(any.coreDir()).not.toBeNull();
      expect(own.coreDir()).toBeNull();
      expect((await own.components()).filter(c => c.package === '@astryxdesign/core')).toEqual([]);

      const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
      fs.mkdirSync(core, {recursive: true});
      fs.writeFileSync(
        path.join(core, 'package.json'),
        JSON.stringify({name: '@astryxdesign/core', version: '0.7.0'}),
      );
      expect((await Project.load(dir, {core: 'project'})).coreDir()).toBe(fs.realpathSync(core));
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('findConfigPath', () => {
  it('rejects multiple config files at the same root', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default {};\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.js'),
      `module.exports = {};\n`,
    );
    expect(() => findConfigPath(tmpDir)).toThrow(
      /Multiple Astryx config files/,
    );
  });
});

describe('Project discovery', () => {
  it('components() returns integration ownership records', async () => {
    scaffold();
    const project = await Project.load(tmpDir);
    const comps = await project.components();
    const widget = comps.find(
      c => c.name === 'Widget' && c.package === '@acme/widgets',
    );
    expect(widget).toBeTruthy();
    expect(widget.sourcePath).toMatch(/Widget\.tsx$/);
  });

  it('templates() returns integration templates type-tagged', async () => {
    scaffold();
    const project = await Project.load(tmpDir);
    const templates = await project.templates();
    const hero = templates.find(t => t.package === '@acme/widgets');
    expect(hero).toBeTruthy();
    expect(hero.type).toBe('block');
  });

  it('templates() projects a valid integration replacement instead of its Core target', async () => {
    const corePage = (await discoverCoreTemplates()).find(
      template => template.type === 'page',
    );
    expect(corePage).toBeDefined();
    scaffold({
      templateId: 'acme-app-shell',
      templateType: 'page',
      templateReplaces: corePage.dirName,
    });
    const project = await Project.load(tmpDir);

    const templates = await project.templates();

    expect(
      templates.find(template => template.dirName === 'acme-app-shell'),
    ).toMatchObject({
      package: '@acme/widgets',
      replaces: corePage.dirName,
    });
    expect(
      templates.find(
        template =>
          template.dirName === corePage.dirName &&
          template.package !== '@acme/widgets',
      ),
    ).toBeUndefined();
    expect(await project.issues()).toEqual([]);
  });

  it('reports replacement issues regardless of discovery call order without hiding other contributions', async () => {
    scaffold({
      templateReplaces: 'missing-core-template',
    });

    const componentsFirst = await Project.load(tmpDir);
    expect(
      (await componentsFirst.components()).some(
        component => component.package === '@acme/widgets',
      ),
    ).toBe(true);
    expect(await componentsFirst.issues()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_template_replacement_target',
          package: '@acme/widgets',
        }),
      ]),
    );

    const issuesFirst = await Project.load(tmpDir, {fresh: true});
    expect(await issuesFirst.issues()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_template_replacement_target',
          package: '@acme/widgets',
        }),
      ]),
    );
    expect(
      (await issuesFirst.components()).some(
        component => component.package === '@acme/widgets',
      ),
    ).toBe(true);
    const ownTemplate = (await issuesFirst.templates()).find(
      template =>
        template.package === '@acme/widgets' && template.dirName === 'hero',
    );
    expect(ownTemplate).toBeDefined();
    expect(ownTemplate).not.toHaveProperty('replaces');

    const sharedCache = new InMemoryConfigCache();
    const warm = await Project.load(tmpDir, {cache: sharedCache});
    await warm.templates();
    const cached = await Project.load(tmpDir, {cache: sharedCache});
    expect(await cached.issues()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_template_replacement_target',
          package: '@acme/widgets',
        }),
      ]),
    );
  });

  it('codemods() returns core registry groups + integration groups', async () => {
    scaffold();
    const project = await Project.load(tmpDir);
    const {core, integration} = await project.codemods('0.1.0', '0.2.0');
    expect(Array.isArray(core)).toBe(true);
    expect(integration).toHaveLength(1);
    expect(integration[0].version).toBe('0.2.0');
    expect(integration[0].codemods[0].id).toBe('drop-foo');
  });

  it('docs() adds an integration topic beside the built-in ones', async () => {
    scaffold({docs: {'deploying.doc.mjs': topicDoc()}});
    const project = await Project.load(tmpDir);
    const catalog = await project.docs();
    expect(catalog.resolve('deploying')).toMatchObject({
      name: 'deploying',
      package: '@acme/widgets',
    });
    // The CLI's own topics are still there.
    expect(catalog.resolve('color').package).toBe('@astryxdesign/cli');
    expect(await project.issues()).toEqual([]);
  });

  it('docs() lets an integration replace a built-in topic, aliasing the old name', async () => {
    scaffold({
      docs: {
        'setup.doc.mjs': topicDoc({name: 'setup', replaces: 'getting-started'}),
      },
    });
    const project = await Project.load(tmpDir);
    const catalog = await project.docs();
    expect(catalog.resolve('setup').package).toBe('@acme/widgets');
    expect(catalog.resolve('getting-started').name).toBe('setup');
  });

  it('docs() records an unusable topic as an issue and contributes none', async () => {
    scaffold({
      docs: {
        'ok.doc.mjs': topicDoc(),
        'broken.doc.mjs': topicDoc({name: 'broken', sections: []}),
      },
    });
    const project = await Project.load(tmpDir);
    const catalog = await project.docs();
    expect(catalog.resolve('deploying')).toBeUndefined();
    const issues = await project.issues();
    expect(
      issues.some(i => i.code === 'invalid_doc' && i.severity === 'error'),
    ).toBe(true);
  });

  it('keeps regular contributions when agentDocs is invalid', async () => {
    scaffold({
      agentDocs: {append: [' invalid']},
      docs: {'deploying.doc.mjs': topicDoc()},
    });
    const project = await Project.load(tmpDir);

    expect(
      (await project.components()).some(c => c.package === '@acme/widgets'),
    ).toBe(true);
    expect(
      (await project.templates()).some(t => t.package === '@acme/widgets'),
    ).toBe(true);
    expect((await project.codemods('0.1.0', '0.2.0')).integration).toHaveLength(
      1,
    );
    expect((await project.docs()).resolve('deploying')?.package).toBe(
      '@acme/widgets',
    );

    const issues = await project.issues();
    expect(
      issues.some(
        issue =>
          issue.package === '@acme/widgets' &&
          issue.code === 'invalid_agent_docs' &&
          issue.severity === 'error',
      ),
    ).toBe(true);
  });

  it('memoizes components() — the second call does not re-walk', async () => {
    scaffold();
    const project = await Project.load(tmpDir);
    const spy = vi.spyOn(componentDiscovery, 'discoverIntegrationComponents');
    const first = await project.components();
    const callsAfterFirst = spy.mock.calls.length;
    const second = await project.components();
    // Same identity (cached value) and no additional discovery walk.
    expect(second).toBe(first);
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('Project forward compatibility', () => {
  // An integration is published once and installed against many CLI versions,
  // so a manifest key from a NEWER CLI reaches an older one routinely. It used
  // to fail the strict parse, and a manifest that fails to parse contributes
  // nothing — one added field cost the package its components, templates and
  // codemods on every older consumer, silently (#5119).
  it('keeps every contribution when the manifest holds a key this CLI does not know', async () => {
    scaffold({unknownKeys: {futureRoot: './future', anotherOne: 42}});
    const project = await Project.load(tmpDir);

    const comps = await project.components();
    expect(
      comps.some(c => c.name === 'Widget' && c.package === '@acme/widgets'),
    ).toBe(true);
    expect(
      (await project.templates()).some(t => t.package === '@acme/widgets'),
    ).toBe(true);
    const {integration} = await project.codemods('0.1.0', '0.2.0');
    expect(integration).toHaveLength(1);

    const issues = await project.issues();
    expect(issues.every(i => i.severity !== 'error')).toBe(true);
    const unknown = issues.filter(i => i.code === 'unknown_manifest_key');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].severity).toBe('warning');
    expect(unknown[0].message).toContain('"futureRoot"');
    expect(unknown[0].message).toContain('"anotherOne"');
  });

  it('still refuses a known key of the wrong type', async () => {
    scaffold({unknownKeys: {components: 42}});
    const project = await Project.load(tmpDir);
    const issues = await project.issues();
    expect(issues.some(i => i.severity === 'error')).toBe(true);
  });
});

describe('Project issues (skip + warn)', () => {
  it('collects issues for a broken integration and skips its contributions', async () => {
    scaffold({brokenComponent: true});
    const project = await Project.load(tmpDir);
    const comps = await project.components();
    // Widget is skipped because its source is missing.
    expect(comps.find(c => c.package === '@acme/widgets')).toBeUndefined();
    const issues = await project.issues();
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some(i => i.package === '@acme/widgets')).toBe(true);
  });

  it('keeps valid contribution kinds and siblings when others are broken', async () => {
    const pkgDir = scaffold({brokenComponent: true});
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'broken.template.mjs'),
      `export default {type: 'block', name: 'Broken', description: 'Missing source'};\n`,
    );
    fs.writeFileSync(
      path.join(pkgDir, 'components', 'ValidWidget.doc.mjs'),
      `export default {type: 'component', name: 'ValidWidget', props: []};\n`,
    );
    fs.writeFileSync(
      path.join(pkgDir, 'components', 'ValidWidget.tsx'),
      `export function ValidWidget() { return null; }\n`,
    );
    const project = await Project.load(tmpDir);

    const templates = await project.templates();
    const components = await project.components();
    const issues = await project.issues();

    expect(
      templates.find(
        template =>
          template.dirName === 'hero' && template.package === '@acme/widgets',
      ),
    ).toBeDefined();
    expect(
      components.find(
        component =>
          component.name === 'ValidWidget' &&
          component.package === '@acme/widgets',
      ),
    ).toBeDefined();
    expect(
      components.find(
        component =>
          component.name === 'Widget' && component.package === '@acme/widgets',
      ),
    ).toBeUndefined();
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({code: 'invalid_component'}),
        expect.objectContaining({code: 'invalid_template'}),
      ]),
    );
  });

  it('does not throw when an integration codemod is broken', async () => {
    scaffold({brokenCodemod: true});
    const project = await Project.load(tmpDir);
    const {integration} = await project.codemods('0.1.0', '0.2.0');
    // Broken integration is skipped, not thrown.
    expect(integration).toHaveLength(0);
    const issues = await project.issues();
    expect(issues.some(i => i.code === 'invalid_codemod')).toBe(true);
  });

  it('issues() dedupes and is complete on demand', async () => {
    scaffold({brokenComponent: true});
    const project = await Project.load(tmpDir);
    // Call a discovery method first (collects some), then issues().
    await project.components();
    const a = await project.issues();
    const b = await project.issues();
    expect(a).toEqual(b);
    // No duplicate (package, code, message) tuples.
    const seen = new Set(
      a.map(i => `${i.package}\u0000${i.code}\u0000${i.message}`),
    );
    expect(seen.size).toBe(a.length);
  });

  it('issues() validates integrations not yet visited by a discovery call', async () => {
    scaffold({brokenComponent: true});
    const project = await Project.load(tmpDir);
    // No discovery call at all — issues() must still surface the broken one.
    const issues = await project.issues();
    expect(issues.some(i => i.package === '@acme/widgets')).toBe(true);
  });
});

describe('Project loads each integration in isolation', () => {
  /**
   * Install a package under node_modules with the given root files.
   * @param {string} name
   * @param {string[]} manifests manifest basenames to write
   */
  function installPackage(name, manifests) {
    const dir = path.join(tmpDir, 'node_modules', ...name.split('/'));
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name, version: '1.0.0'}),
    );
    for (const file of manifests) {
      fs.writeFileSync(path.join(dir, file), 'export default {};\n');
    }
  }

  /** @param {string[]} integrations */
  function writeConfig(integrations) {
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default ${JSON.stringify({integrations})};\n`,
    );
  }

  /** @param {Project} project */
  async function widgetComponents(project) {
    return (await project.components())
      .filter(component => component.package === '@acme/widgets')
      .map(component => component.name);
  }

  it.each([
    ['is not installed', '@acme/broken', () => {}, /Install it first/],
    [
      'has no root manifest',
      '@acme/broken',
      () => installPackage('@acme/broken', []),
      /no conventional root manifest/,
    ],
    [
      'has two root manifests',
      '@acme/broken',
      () =>
        installPackage('@acme/broken', [
          'astryx.integration.mjs',
          'astryx.integration.js',
        ]),
      /multiple root manifests/,
    ],
    [
      'is not a bare package name',
      '../escape',
      () => {},
      /Invalid integration package name/,
    ],
  ])(
    'keeps the others when a configured package %s',
    async (_label, spec, install, message) => {
      scaffold();
      install();
      writeConfig([spec, '@acme/widgets']);

      const project = await Project.load(tmpDir);

      expect(await widgetComponents(project)).toEqual(['Widget']);
      expect(await project.issues()).toContainEqual(
        expect.objectContaining({
          package: spec,
          code: 'integration_error',
          message: expect.stringMatching(message),
        }),
      );
    },
  );

  it('keeps configured integrations when the package being authored has two root manifests', async () => {
    scaffold();
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/local', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'export default {};\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.js'),
      'export default {};\n',
    );

    const project = await Project.load(tmpDir);

    expect(await widgetComponents(project)).toEqual(['Widget']);
    expect(await project.issues()).toContainEqual(
      expect.objectContaining({
        package: '@acme/local',
        code: 'integration_error',
        message: expect.stringMatching(/multiple root manifests/),
      }),
    );
  });

  it('puts the package being authored at its configured position when the config names it', async () => {
    scaffold();
    scaffoldLocalPackage({name: '@acme/local'});
    writeConfig(['@acme/local', '@acme/widgets']);

    const project = await Project.load(tmpDir);

    expect(
      project.loadedIntegrations.map(integration => [
        integration.name,
        Boolean(integration.__local),
      ]),
    ).toEqual([
      ['@acme/local', true],
      ['@acme/widgets', false],
    ]);
    expect(await project.issues()).not.toContainEqual(
      expect.objectContaining({package: '@acme/local', code: 'integration_error'}),
    );
  });
});

describe('Project finds configured integrations a workspace hoists', () => {
  // npm, Yarn and Bun workspaces install a member's dependencies at the
  // workspace root, so the member's own node_modules does not hold them.
  it('loads an integration named in a member config from the workspace root', async () => {
    scaffold();
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'root', private: true, workspaces: ['apps/*']}),
    );
    fs.rmSync(path.join(tmpDir, 'astryx.config.mjs'));
    const member = path.join(tmpDir, 'apps', 'web');
    fs.mkdirSync(member, {recursive: true});
    fs.writeFileSync(path.join(member, 'package.json'), JSON.stringify({name: 'web'}));
    fs.writeFileSync(
      path.join(member, 'astryx.config.mjs'),
      `export default ${JSON.stringify({integrations: ['@acme/widgets']})};\n`,
    );

    const project = await Project.load(member);

    const widgets = (await project.components()).filter(
      component => component.package === '@acme/widgets',
    );
    expect(widgets.map(component => component.name)).toEqual(['Widget']);
    expect(await project.issues()).not.toContainEqual(
      expect.objectContaining({package: '@acme/widgets', code: 'integration_error'}),
    );
  });
});

describe('Project.issuesUrl routing', () => {
  it('routes core to config.issuesUrl, falling back to the default', async () => {
    scaffold({issuesUrl: 'https://example.com/core'});
    const project = await Project.load(tmpDir);
    expect(project.issuesUrl()).toBe('https://example.com/core');
    expect(project.issuesUrl({package: '@astryxdesign/core'})).toBe(
      'https://example.com/core',
    );
  });

  it('falls back to the default core URL when config has none', async () => {
    scaffold();
    const project = await Project.load(tmpDir);
    expect(project.issuesUrl()).toBe(DEFAULT_ISSUES_URL);
  });

  it('routes an integration package to its manifest issuesUrl', async () => {
    scaffold({integrationIssuesUrl: 'https://example.com/widgets/issues'});
    const project = await Project.load(tmpDir);
    expect(project.issuesUrl({package: '@acme/widgets'})).toBe(
      'https://example.com/widgets/issues',
    );
  });

  it('returns undefined for an integration that ships no issuesUrl', async () => {
    scaffold({integrationIssuesUrl: null});
    const project = await Project.load(tmpDir);
    expect(project.issuesUrl({package: '@acme/widgets'})).toBeUndefined();
  });
});

describe('Project caching', () => {
  it('reuses a shared cache across instances for the same config bytes', async () => {
    scaffold();
    const cache = new InMemoryConfigCache();
    const p1 = await Project.load(tmpDir, {cache});
    const comps1 = await p1.components();
    const p2 = await Project.load(tmpDir, {cache});
    const comps2 = await p2.components();
    // Same cached value across Project instances (same key path).
    expect(comps2).toBe(comps1);
  });
});
