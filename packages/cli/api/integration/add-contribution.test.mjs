// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  integrationAdd,
  integrationAddAgentDoc,
  integrationAddCodemod,
  integrationAddComponent,
  integrationAddDoc,
  integrationAddTemplate,
} from './add-contribution.mjs';
import {iconNewSet} from '../icon/new-set/new-set.mjs';
import {validateLocalIntegration} from './validate-integration.mjs';
import {NAMESPACE_DOCS_CLI} from '../../foundation/integrations/cli-requirement.mjs';

let tmpDir;

/**
 * @param {{manifest?: string, files?: string[], includeFiles?: boolean, name?: string, exports?: unknown}} [opts]
 */
function setup({
  manifest = 'export default {};\n',
  files = ['dist'],
  includeFiles = true,
  name = '@acme/integration',
  exports,
} = {}) {
  /** @type {{name: string, version: string, files?: string[], exports?: unknown}} */
  const pkg = {name, version: '1.0.0'};
  if (includeFiles) pkg.files = files;
  if (exports !== undefined) pkg.exports = exports;
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(tmpDir, 'astryx.integration.mjs'), manifest);
}

/** Create a bare package dir with no manifest (first-add scenario). */
function setupBare({files, includeFiles = true} = {}) {
  /** @type {{name: string, version: string, files?: string[]}} */
  const pkg = {name: '@acme/integration', version: '1.0.0'};
  if (includeFiles) pkg.files = files ?? ['dist'];
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-add-contrib-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

// ── COMPONENT ───────────────────────────────────────────────────────

describe('integrationAdd component', () => {
  it('writes doc + source, patches root, and appends to files array', async () => {
    setup();
    const result = await integrationAdd('component', 'MyWidget', {cwd: tmpDir});

    expect(result.type).toBe('integration.add');
    expect(result.data.kind).toBe('component');
    expect(result.data.name).toBe('MyWidget');
    expect(result.data.root).toEqual({path: './components', created: true});
    expect(result.data.written).toBe(true);
    expect(result.data.dryRun).toBe(false);
    expect(result.data.files).toContain('components/MyWidget.doc.mjs');
    expect(result.data.files).toContain('components/MyWidget.tsx');
    expect(result.data.files).toContain('astryx.integration.mjs');

    // Doc file is valid
    const doc = fs.readFileSync(
      path.join(tmpDir, 'components/MyWidget.doc.mjs'),
      'utf-8',
    );
    expect(doc).toContain("@astryxdesign/cli/authoring').ComponentDoc");
    expect(doc).toContain("type: 'component'");
    expect(doc).toContain("name: 'MyWidget'");
    expect(doc).toContain('props: []');

    // Source file exists
    expect(fs.existsSync(path.join(tmpDir, 'components/MyWidget.tsx'))).toBe(
      true,
    );

    // Manifest updated
    const manifestContent = fs.readFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'utf-8',
    );
    expect(manifestContent).toContain("components: './components'");

    // package.json files updated
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.files).toContain('components');
    expect(pkg.files).toContain('astryx.integration.mjs');

    // Doctor validates cleanly
    const validation = await validateLocalIntegration(tmpDir);
    const componentErrors = validation.issues.filter(
      i => i.code === 'invalid_component',
    );
    expect(componentErrors).toEqual([]);
  });

  it('publishes and documents the generated component in an existing exports map', async () => {
    setup({exports: {'.': './index.mjs'}});

    await integrationAddComponent('MyWidget', {cwd: tmpDir});

    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.exports).toEqual({
      '.': './index.mjs',
      './components/MyWidget': './components/MyWidget.tsx',
    });
    expect(
      fs.readFileSync(
        path.join(tmpDir, 'components/MyWidget.doc.mjs'),
        'utf-8',
      ),
    ).toContain('import: "@acme/integration/components/MyWidget"');
  });

  it('does not create exports when the package has no exports map', async () => {
    setup();

    await integrationAddComponent('MyWidget', {cwd: tmpDir});

    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.exports).toBeUndefined();
  });

  it('refuses an existing conflicting component export before writing files', async () => {
    setup({
      exports: {
        '.': './index.mjs',
        './components/MyWidget': './different.tsx',
      },
    });

    await expect(
      integrationAddComponent('MyWidget', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_INTEGRATION_EXPORT_CONFLICT'});
    expect(fs.existsSync(path.join(tmpDir, 'components'))).toBe(false);
  });

  it('dry-runs without writing', async () => {
    setup();
    const result = await integrationAdd('component', 'MyWidget', {
      cwd: tmpDir,
      dryRun: true,
    });
    expect(result.data.written).toBe(false);
    expect(result.data.dryRun).toBe(true);
    expect(result.data.root).toEqual({path: './components', created: true});
    expect(fs.existsSync(path.join(tmpDir, 'components'))).toBe(false);
  });

  it('creates the manifest on first add', async () => {
    setupBare();
    const result = await integrationAdd('component', 'MyWidget', {cwd: tmpDir});
    expect(result.data.root.created).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'astryx.integration.mjs'))).toBe(
      true,
    );
  });

  it('refuses to overwrite an existing doc file', async () => {
    setup();
    fs.mkdirSync(path.join(tmpDir, 'components'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'components/MyWidget.doc.mjs'),
      'existing',
    );
    await expect(
      integrationAdd('component', 'MyWidget', {cwd: tmpDir}),
    ).rejects.toThrow(/Refusing to overwrite/);
  });

  it('refuses to overwrite an existing source file', async () => {
    setup();
    fs.mkdirSync(path.join(tmpDir, 'components'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'components/MyWidget.tsx'), 'existing');
    await expect(
      integrationAdd('component', 'MyWidget', {cwd: tmpDir}),
    ).rejects.toThrow(/Refusing to overwrite/);
  });

  it('rejects a lowercase name', async () => {
    setup();
    await expect(
      integrationAdd('component', 'myWidget', {cwd: tmpDir}),
    ).rejects.toThrow(/PascalCase/);
  });

  // ── MUTATION TESTS: same-stem pair ──────────────────────────────

  it('mutation: doc alone (no .tsx) causes a validate-contributions error', async () => {
    setup();
    await integrationAdd('component', 'MyWidget', {cwd: tmpDir});
    // Remove the .tsx — keep the doc
    fs.rmSync(path.join(tmpDir, 'components/MyWidget.tsx'));
    const validation = await validateLocalIntegration(tmpDir);
    const componentErrors = validation.issues.filter(
      i => i.code === 'invalid_component',
    );
    expect(componentErrors.length).toBeGreaterThan(0);
  });

  it('mutation: source alone (no .doc) is invisible to discovery', async () => {
    setup();
    await integrationAdd('component', 'MyWidget', {cwd: tmpDir});
    // Remove the doc — keep the tsx
    fs.rmSync(path.join(tmpDir, 'components/MyWidget.doc.mjs'));
    const validation = await validateLocalIntegration(tmpDir);
    // No error because the component is simply invisible — it was never discovered
    const componentErrors = validation.issues.filter(
      i => i.code === 'invalid_component',
    );
    expect(componentErrors).toEqual([]);
    expect(
      validation.issues.some(
        issue => issue.code === 'source_without_component_doc',
      ),
    ).toBe(true);
    // The component is not discoverable without metadata.
    const {discoverIntegrationComponents} =
      await import('../../foundation/discovery/component-discovery.mjs');
    const {loadManifestObject} =
      await import('../../foundation/integrations/integrations.mjs');
    const {assertWithin} = await import('../../foundation/fs/path-safety.mjs');
    const manifest = await loadManifestObject(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'test',
      {fresh: true},
    );
    const compsRoot = assertWithin(manifest.components, tmpDir, {
      label: 'test',
    });
    const records = discoverIntegrationComponents({
      name: '@acme/integration',
      components: compsRoot,
      __spec: '@acme/integration',
      __packageDir: tmpDir,
      __manifestFile: path.join(tmpDir, 'astryx.integration.mjs'),
    });
    expect(records.some(r => r.name === 'MyWidget')).toBe(false);
  });
});

// ── FILES ALLOWLIST MUTATION ────────────────────────────────────────

describe('package.json files allowlist', () => {
  it('never creates a files field when absent', async () => {
    setup({includeFiles: false});
    await integrationAdd('component', 'MyWidget', {cwd: tmpDir});
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.files).toBeUndefined();
  });

  it('appends root and manifest to existing files array', async () => {
    setup({files: ['dist']});
    await integrationAdd('component', 'MyWidget', {cwd: tmpDir});
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.files).toEqual(['dist', 'components', 'astryx.integration.mjs']);
  });

  it('does not duplicate entries already in files', async () => {
    setup({files: ['dist', 'components', 'astryx.integration.mjs']});
    await integrationAdd('component', 'MyWidget', {cwd: tmpDir});
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.files).toEqual(['dist', 'components', 'astryx.integration.mjs']);
  });
});

// ── DOC TOPIC ───────────────────────────────────────────────────────

describe('integrationAdd doc', () => {
  it('writes a valid generic topic with receipt', async () => {
    setup();
    const result = await integrationAdd('doc', 'my-guide', {cwd: tmpDir});

    expect(result.data.kind).toBe('doc');
    expect(result.data.name).toBe('my-guide');
    expect(result.data.root).toEqual({path: './docs', created: true});
    expect(result.data.files).toContain('docs/my-guide.doc.mjs');

    const doc = fs.readFileSync(
      path.join(tmpDir, 'docs/my-guide.doc.mjs'),
      'utf-8',
    );
    expect(doc).toContain("@astryxdesign/cli/authoring').ReferenceDoc");
    expect(doc).toContain("type: 'generic'");
    expect(doc).toContain("name: 'my-guide'");

    const validation = await validateLocalIntegration(tmpDir);
    const docErrors = validation.issues.filter(i => i.code === 'invalid_doc');
    expect(docErrors).toEqual([]);
  });

  it('refuses to write from a folder with no package.json into the package above it', async () => {
    setupBare();
    const inside = path.join(tmpDir, 'kit');
    fs.mkdirSync(inside);
    await expect(
      integrationAdd('doc', 'my-guide', {cwd: inside, parent: 'acme'}),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: expect.stringContaining('has no package.json'),
    });
    expect(fs.existsSync(path.join(tmpDir, 'docs'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'astryx.integration.mjs'))).toBe(false);
  });

  it('finds an integration from a folder inside it', async () => {
    setup();
    const inside = path.join(tmpDir, 'src');
    fs.mkdirSync(inside);
    const result = await integrationAdd('doc', 'my-guide', {cwd: inside});
    expect(result.data.files).toContain('docs/my-guide.doc.mjs');
    expect(fs.existsSync(path.join(tmpDir, 'docs/my-guide.doc.mjs'))).toBe(true);
  });

  it('places a guide in a namespace of the package, writing the namespace once', async () => {
    setup();
    const first = await integrationAdd('doc', 'deploying', {
      cwd: tmpDir,
      parent: 'acme',
    });
    expect(first.data.files).toEqual(
      expect.arrayContaining(['docs/deploying.doc.mjs', 'docs/acme.doc.mjs']),
    );
    const guide = fs.readFileSync(path.join(tmpDir, 'docs/deploying.doc.mjs'), 'utf-8');
    expect(guide).toContain("placement: {parent: 'namespace:acme', slot: 'guides'}");
    const namespace = fs.readFileSync(path.join(tmpDir, 'docs/acme.doc.mjs'), 'utf-8');
    expect(namespace).toContain("type: 'namespace'");
    expect(namespace).toContain("guides: {title: 'Guides', accepts: {kinds: ['generic']}}");

    // The namespace doc needs a CLI that reads it, declared as an optional peer.
    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
    expect(pkg.peerDependencies).toEqual({'@astryxdesign/cli': '>=0.6.4'});
    expect(pkg.peerDependenciesMeta).toEqual({'@astryxdesign/cli': {optional: true}});

    const second = await integrationAdd('doc', 'upgrading', {
      cwd: tmpDir,
      parent: 'acme',
    });
    expect(second.data.files).not.toContain('docs/acme.doc.mjs');

    const validation = await validateLocalIntegration(tmpDir);
    expect(validation.issues.filter(i => i.code === 'invalid_doc')).toEqual([]);
  });

  it('finds the --parent namespace by its name, wherever its file is, and uses its slot', async () => {
    setup({manifest: "export default {docs: './docs'};\n"});
    fs.mkdirSync(path.join(tmpDir, 'docs', 'ns'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'ns', 'acme.doc.mjs'),
      "export default {type: 'namespace', name: 'acme', title: 'Acme', summary: 'Acme.', slots: {items: {title: 'Items', accepts: {kinds: ['generic']}}}};\n",
    );
    const result = await integrationAdd('doc', 'deploying', {cwd: tmpDir, parent: 'acme'});
    expect(result.data.files).not.toContain('docs/acme.doc.mjs');
    expect(fs.existsSync(path.join(tmpDir, 'docs', 'acme.doc.mjs'))).toBe(false);
    expect(fs.readFileSync(path.join(tmpDir, 'docs', 'deploying.doc.mjs'), 'utf-8')).toContain(
      "placement: {parent: 'namespace:acme', slot: 'items'}",
    );
  });

  it('refuses --parent when its file is not that namespace, or the namespace has no slot for a guide', async () => {
    setup({manifest: "export default {docs: './docs'};\n"});
    fs.mkdirSync(path.join(tmpDir, 'docs'), {recursive: true});
    const nsFile = path.join(tmpDir, 'docs', 'acme.doc.mjs');
    fs.writeFileSync(
      nsFile,
      "export default {type: 'generic', name: 'acme', title: 'Acme', description: 'A topic.', sections: [{title: 'Only', content: [{type: 'prose', text: 'x'}]}]};\n",
    );
    await expect(
      integrationAdd('doc', 'deploying', {cwd: tmpDir, parent: 'acme'}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    // A fresh file: the module loader keeps the first import of a path.
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'beta.doc.mjs'),
      "export default {type: 'namespace', name: 'beta', title: 'Beta', summary: 'Beta.', slots: {items: {title: 'Items', accepts: {kinds: ['function']}}}};\n",
    );
    await expect(
      integrationAdd('doc', 'deploying', {cwd: tmpDir, parent: 'beta'}),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: expect.stringContaining('no slot that takes a guide'),
    });
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'gamma.doc.mjs'),
      "export default {type: 'namespace', name: 'gamma', title: 'Gamma', summary: 'Gamma.', slots: {guides: {title: 'Guides', accepts: {kinds: ['function']}}, more: {title: 'More', accepts: {kinds: ['generic']}}, extra: {title: 'Extra', accepts: {kinds: ['generic']}}}};\n",
    );
    await expect(
      integrationAdd('doc', 'deploying', {cwd: tmpDir, parent: 'gamma'}),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: expect.stringContaining('more than one slot that takes a guide (more, extra)'),
    });
    expect(fs.existsSync(path.join(tmpDir, 'docs', 'deploying.doc.mjs'))).toBe(false);
  });

  it('raises a CLI peer that admits a CLI too old for namespace docs, and keeps one that does not', async () => {
    setup();
    const file = path.join(tmpDir, 'package.json');
    const write = (/** @type {string} */ range) => {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf-8'));
      pkg.peerDependencies = {'@astryxdesign/cli': range};
      fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
    };
    write('^0.6.0');
    await integrationAdd('doc', 'deploying', {cwd: tmpDir, parent: 'acme'});
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).peerDependencies).toEqual({
      '@astryxdesign/cli': `>=${NAMESPACE_DOCS_CLI}`,
    });
    write('^9.1.0');
    await integrationAdd('doc', 'upgrading', {cwd: tmpDir, parent: 'acme'});
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).peerDependencies).toEqual({
      '@astryxdesign/cli': '^9.1.0',
    });
  });

  it('refuses --parent with a relationship, or a namespace name that is not a route segment', async () => {
    setup();
    await expect(
      integrationAdd('doc', 'x', {cwd: tmpDir, parent: 'acme', replaces: 'getting-started'}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
    await expect(
      integrationAdd('doc', 'x', {cwd: tmpDir, parent: 'Acme Kit'}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
    await expect(
      integrationAdd('template', 'x', {cwd: tmpDir, parent: 'acme'}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });

  it('includes replaces in the generated doc', async () => {
    setup();
    const result = await integrationAdd('doc', 'my-tokens', {
      cwd: tmpDir,
      replaces: 'tokens',
    });
    const doc = fs.readFileSync(
      path.join(tmpDir, 'docs/my-tokens.doc.mjs'),
      'utf-8',
    );
    expect(doc).toContain("replaces: 'tokens'");
    expect(doc).not.toContain('extends:');
  });

  it('includes extends in the generated doc', async () => {
    setup();
    const result = await integrationAdd('doc', 'extra-tokens', {
      cwd: tmpDir,
      extends: 'tokens',
    });
    const doc = fs.readFileSync(
      path.join(tmpDir, 'docs/extra-tokens.doc.mjs'),
      'utf-8',
    );
    expect(doc).toContain("extends: 'tokens'");
    expect(doc).not.toContain('replaces:');
  });

  it('rejects replaces + extends together', async () => {
    setup();
    await expect(
      integrationAdd('doc', 'my-tokens', {
        cwd: tmpDir,
        replaces: 'tokens',
        extends: 'tokens',
      }),
    ).rejects.toThrow(/not both/);
  });

  it.each([
    ['my--guide', 'My Guide'],
    ['a-_-b', 'A B'],
    ['___', '___'],
  ])(
    'accepts topic name %s without crashing title generation',
    async (name, title) => {
      setup();
      await integrationAdd('doc', name, {cwd: tmpDir});
      expect(
        fs.readFileSync(path.join(tmpDir, 'docs', `${name}.doc.mjs`), 'utf-8'),
      ).toContain(`title: '${title}'`);
    },
  );

  it('rejects an unsafe replacement topic before writing source', async () => {
    setup();
    await expect(
      integrationAdd('doc', 'my-guide', {
        cwd: tmpDir,
        replaces: "topic'; process.exit(1); //",
      }),
    ).rejects.toThrow(/--replaces/);
    expect(fs.existsSync(path.join(tmpDir, 'docs'))).toBe(false);
  });
});

// ── TEMPLATE ────────────────────────────────────────────────────────

describe('integrationAdd template', () => {
  it('writes a valid page template with receipt', async () => {
    setup();
    const result = await integrationAdd('template', 'my-widget', {
      cwd: tmpDir,
    });

    expect(result.data.kind).toBe('template');
    expect(result.data.name).toBe('my-widget');
    expect(result.data.root).toEqual({path: './templates', created: true});
    expect(result.data.files).toContain('templates/my-widget.doc.mjs');
    expect(result.data.files).toContain('templates/my-widget.tsx');

    const spec = fs.readFileSync(
      path.join(tmpDir, 'templates/my-widget.doc.mjs'),
      'utf-8',
    );
    expect(spec).toContain(
      "@astryxdesign/cli/authoring').IntegrationTemplateDoc",
    );
    expect(spec).toContain("type: 'page'");
    expect(spec).toContain("name: 'my-widget'");

    expect(fs.existsSync(path.join(tmpDir, 'templates/my-widget.tsx'))).toBe(
      true,
    );

    const manifest = fs.readFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'utf-8',
    );
    expect(manifest).toContain("templates: './templates'");
  });

  it('publishes generated template source in an existing exports map', async () => {
    setup({exports: './index.mjs'});

    await integrationAddTemplate('my-widget', {cwd: tmpDir, type: 'page'});

    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.exports).toEqual({
      '.': './index.mjs',
      './templates/my-widget': './templates/my-widget.tsx',
    });
  });

  it('supports block type', async () => {
    setup();
    const result = await integrationAdd('template', 'my-card', {
      cwd: tmpDir,
      templateType: 'block',
    });
    const spec = fs.readFileSync(
      path.join(tmpDir, 'templates/my-card.doc.mjs'),
      'utf-8',
    );
    expect(spec).toContain("type: 'block'");
    expect(spec).toContain('aspectRatio: 1');
  });

  it('rejects an invalid template type', async () => {
    setup();
    await expect(
      integrationAdd('template', 'my-widget', {
        cwd: tmpDir,
        templateType: /** @type {any} */ ('invalid'),
      }),
    ).rejects.toThrow(/must be "page" or "block"/);
  });
});

// ── CODEMOD ─────────────────────────────────────────────────────────

describe('integrationAdd codemod', () => {
  it('writes a valid identity codemod under the version folder', async () => {
    setup();
    const result = await integrationAdd('codemod', 'rename-widget', {
      cwd: tmpDir,
      to: '1.0.0',
    });

    expect(result.data.kind).toBe('codemod');
    expect(result.data.name).toBe('rename-widget');
    expect(result.data.root).toEqual({path: './codemods', created: true});
    expect(result.data.files).toContain('codemods/1.0.0/rename-widget.mjs');

    const codemod = fs.readFileSync(
      path.join(tmpDir, 'codemods/1.0.0/rename-widget.mjs'),
      'utf-8',
    );
    expect(codemod).toContain("type: 'code'");
    expect(codemod).toContain('transform(file, api)');
    expect(codemod).toContain('return file.source');

    const manifest = fs.readFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'utf-8',
    );
    expect(manifest).toContain("codemods: './codemods'");
  });

  it('requires --to as valid semver', async () => {
    setup();
    await expect(
      integrationAdd('codemod', 'rename-widget', {cwd: tmpDir}),
    ).rejects.toThrow(/--to is required/);
    await expect(
      integrationAdd('codemod', 'rename-widget', {
        cwd: tmpDir,
        to: 'v1',
      }),
    ).rejects.toThrow(/exact semver/);
  });

  it('accepts an exact semver prerelease target', async () => {
    setup();
    const result = await integrationAdd('codemod', 'rename-widget', {
      cwd: tmpDir,
      to: '1.0.0-beta.1',
    });
    expect(result.data.files).toContain(
      'codemods/1.0.0-beta.1/rename-widget.mjs',
    );
  });
});

// ── AGENT-DOC ───────────────────────────────────────────────────────

describe('integrationAdd agent-doc', () => {
  it('adds a line to agentDocs.append and verifies', async () => {
    setup();
    const result = await integrationAdd(
      'agent-doc',
      'This integration provides MyWidget.',
      {cwd: tmpDir},
    );

    expect(result.data.kind).toBe('agent-doc');
    expect(result.data.name).toBe('This integration provides MyWidget.');
    expect(result.data.root).toBeNull();
    expect(result.data.files).toContain('astryx.integration.mjs');

    const manifest = fs.readFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'utf-8',
    );
    expect(manifest).toContain('This integration provides MyWidget.');
    expect(manifest).toContain('agentDocs');
    expect(manifest).toContain('append');
  });

  it('converges: adding the same line twice is idempotent', async () => {
    setup();
    await integrationAdd('agent-doc', 'A line.', {cwd: tmpDir});
    const result = await integrationAdd('agent-doc', 'A line.', {
      cwd: tmpDir,
    });
    expect(result.data.written).toBe(false);
    expect(result.data.files).toEqual([]);
  });

  it('appends to existing lines', async () => {
    setup({
      manifest:
        "export default {\n  agentDocs: {\n    append: ['Line one.'],\n  },\n};\n",
    });
    await integrationAdd('agent-doc', 'Line two.', {cwd: tmpDir});
    const manifest = fs.readFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'utf-8',
    );
    expect(manifest).toContain('Line one.');
    expect(manifest).toContain('Line two.');
  });

  it('creates the manifest when none exists', async () => {
    setupBare();
    await integrationAdd('agent-doc', 'A line.', {cwd: tmpDir});
    expect(fs.existsSync(path.join(tmpDir, 'astryx.integration.mjs'))).toBe(
      true,
    );
    const manifest = fs.readFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'utf-8',
    );
    expect(manifest).toContain('A line.');
  });

  it('rejects a blank line', async () => {
    setup();
    await expect(
      integrationAdd('agent-doc', '   ', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });

  it('adds the manifest to an existing package files allowlist', async () => {
    setup({files: ['dist']});
    await integrationAdd('agent-doc', 'A line.', {cwd: tmpDir});
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.files).toEqual(['dist', 'astryx.integration.mjs']);
  });

  it('refuses invalid existing agent-doc state instead of deleting it', async () => {
    const manifest =
      "export default {agentDocs: {append: [' line with spaces ']}};\n";
    setup({manifest});
    await expect(
      integrationAdd('agent-doc', 'A new line.', {cwd: tmpDir}),
    ).rejects.toThrow(/Cannot update agentDocs/);
    expect(
      fs.readFileSync(path.join(tmpDir, 'astryx.integration.mjs'), 'utf-8'),
    ).toBe(manifest);
  });

  it('preserves comments attached to existing agent-doc state', async () => {
    setup({
      manifest:
        "export default {\n  // Keep this owner note.\n  agentDocs: {append: ['Line one.']},\n};\n",
    });
    await integrationAdd('agent-doc', 'Line two.', {cwd: tmpDir});
    const manifest = fs.readFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'utf-8',
    );
    expect(manifest).toContain('// Keep this owner note.');
    expect(manifest).toContain('Line one.');
    expect(manifest).toContain('Line two.');
  });

  it('refuses non-static agent-doc state without changing it', async () => {
    const manifest =
      "const docs = {append: ['Line one.']};\nexport default {agentDocs: docs};\n";
    setup({manifest});
    await expect(
      integrationAdd('agent-doc', 'Line two.', {cwd: tmpDir}),
    ).rejects.toThrow(/not a static object literal/);
    expect(
      fs.readFileSync(path.join(tmpDir, 'astryx.integration.mjs'), 'utf-8'),
    ).toBe(manifest);
  });

  it('refuses a runtime-computed manifest without changing it', async () => {
    const manifest =
      "function makeManifest() { return {agentDocs: {append: ['Line one.']}}; }\nexport default makeManifest();\n";
    setup({manifest});
    await expect(
      integrationAdd('agent-doc', 'Line two.', {cwd: tmpDir}),
    ).rejects.toThrow(/default export is not a static object literal/);
    expect(
      fs.readFileSync(path.join(tmpDir, 'astryx.integration.mjs'), 'utf-8'),
    ).toBe(manifest);
  });

  it('dry-run predicts the same files as the real write', async () => {
    setup({files: ['dist']});
    const plan = await integrationAdd('agent-doc', 'A line.', {
      cwd: tmpDir,
      dryRun: true,
    });
    const written = await integrationAdd('agent-doc', 'A line.', {cwd: tmpDir});
    expect(written.data.files).toEqual(plan.data.files);
  });

  it('dry-run predicts without writing', async () => {
    setup();
    const before = fs.readFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      'utf-8',
    );
    const result = await integrationAdd('agent-doc', 'A line.', {
      cwd: tmpDir,
      dryRun: true,
    });
    expect(result.data.written).toBe(false);
    expect(result.data.dryRun).toBe(true);
    expect(
      fs.readFileSync(path.join(tmpDir, 'astryx.integration.mjs'), 'utf-8'),
    ).toBe(before);
  });
});

// ── CROSS-KIND: custom root preservation ────────────────────────────

describe('custom root preservation', () => {
  it('uses an existing custom root from the manifest', async () => {
    setup({manifest: "export default {\n  components: './src/ui',\n};\n"});
    const result = await integrationAdd('component', 'MyWidget', {
      cwd: tmpDir,
    });
    expect(result.data.root.path).toBe('./src/ui');
    expect(fs.existsSync(path.join(tmpDir, 'src/ui/MyWidget.doc.mjs'))).toBe(
      true,
    );
  });
});

describe('typed descriptor conformance', () => {
  it('emits a strongly typed .doc.mjs for every canonical item writer', async () => {
    setup();
    await integrationAdd('component', 'MyWidget', {cwd: tmpDir});
    await integrationAdd('doc', 'my-guide', {cwd: tmpDir});
    await integrationAdd('template', 'my-page', {cwd: tmpDir});
    await integrationAdd('theme', 'ocean', {cwd: tmpDir});
    await iconNewSet('outline', {cwd: tmpDir});

    // Codemod and agent-doc keep their released formats for compatibility;
    // no new kind may copy those exceptions.
    for (const [relativePath, type] of [
      ['components/MyWidget.doc.mjs', 'ComponentDoc'],
      ['docs/my-guide.doc.mjs', 'ReferenceDoc'],
      ['templates/my-page.doc.mjs', 'IntegrationTemplateDoc'],
      ['themes/ocean/oceanTheme.doc.mjs', 'ThemeDoc'],
      ['icon-sets/outline/outline.doc.mjs', 'IconSetDoc'],
    ]) {
      const source = fs.readFileSync(path.join(tmpDir, relativePath), 'utf-8');
      expect(source).toContain(`@astryxdesign/cli/authoring').${type}`);
      expect(source).toContain('export default {');
    }
    expect(
      fs.existsSync(path.join(tmpDir, 'templates/my-page.template.mjs')),
    ).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'themes/manifest.json'))).toBe(
      false,
    );
  });
});

describe('public per-kind APIs', () => {
  it('exposes narrow functions for every non-theme contribution kind', async () => {
    setup();
    const results = await Promise.all([
      integrationAddComponent('MyWidget', {cwd: tmpDir, dryRun: true}),
      integrationAddDoc('my-guide', {cwd: tmpDir, dryRun: true}),
      integrationAddTemplate('my-page', {
        cwd: tmpDir,
        dryRun: true,
        type: 'page',
      }),
      integrationAddCodemod('rename-widget', {
        cwd: tmpDir,
        dryRun: true,
        to: '1.0.0',
      }),
      integrationAddAgentDoc('Use MyWidget.', {cwd: tmpDir, dryRun: true}),
      iconNewSet('outline', {cwd: tmpDir, dryRun: true}),
    ]);

    expect(results.map(result => result.data.kind)).toEqual([
      'component',
      'doc',
      'template',
      'codemod',
      'agent-doc',
      'icon-set',
    ]);
  });
});

describe('public dispatcher', () => {
  it('delegates theme authoring to the theme-specific implementation', async () => {
    setup();
    const result = await integrationAdd('theme', 'ocean', {cwd: tmpDir});
    expect(result.data).toMatchObject({kind: 'theme', name: 'ocean'});
    expect(result.data.files).toContain('themes/ocean/oceanTheme.ts');
    expect(result.data.files).toContain('themes/ocean/oceanTheme.doc.mjs');
  });

  it('refuses a kind-specific option on the wrong kind', async () => {
    setup();
    await expect(
      integrationAdd('component', 'MyWidget', {
        cwd: tmpDir,
        to: '1.0.0',
      }),
    ).rejects.toThrow(/does not apply/);
    expect(fs.existsSync(path.join(tmpDir, 'components'))).toBe(false);
  });

  it('names every supported kind when the kind is unknown', async () => {
    setup();
    await expect(
      integrationAdd(/** @type {any} */ ('plugin'), 'thing', {cwd: tmpDir}),
    ).rejects.toThrow(/component, doc, template, codemod, agent-doc, or theme/);
  });
});

describe('dry-run receipts match the real write', () => {
  /** Package states each writer has to plan for. */
  const STATES = {
    'no manifest': {pkg: {files: ['dist']}},
    'an empty manifest': {pkg: {}, manifest: 'export default {};\n'},
    'declared roots and an exports map': {
      pkg: {files: ['dist'], exports: {'.': './dist/index.js'}},
      manifest:
        "export default {\n  components: './components',\n  docs: './docs',\n  templates: './templates',\n  codemods: './codemods',\n  themes: './themes',\n  experimental: {iconSets: './icon-sets'},\n};\n",
    },
  };
  /** @type {Array<[any, string, Record<string, unknown>]>} */
  const KINDS = [
    ['component', 'AcmeWidget', {}],
    ['doc', 'deploying', {}],
    ['template', 'account-page', {}],
    ['template', 'account-card', {templateType: 'block'}],
    ['codemod', 'rename-widget', {to: '1.2.0'}],
    ['agent-doc', 'Run acme verify before finishing.', {}],
    ['theme', 'ocean', {}],
    ['icon-set', 'outline', {}],
  ];

  /** Every file under the package, keyed by project path, with its bytes. */
  function snapshot() {
    /** @type {Record<string, string>} */
    const files = {};
    /** @param {string} dir */
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          files[path.relative(tmpDir, full).split(path.sep).join('/')] =
            fs.readFileSync(full, 'base64');
        }
      }
    };
    walk(tmpDir);
    return files;
  }

  for (const [stateName, state] of Object.entries(STATES)) {
    for (const [kind, name, options] of KINDS) {
      it(`${kind} ${name} in a package with ${stateName}`, async () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          `${JSON.stringify({name: '@acme/integration', version: '1.0.0', ...state.pkg}, null, 2)}\n`,
        );
        if (state.manifest != null) {
          fs.writeFileSync(
            path.join(tmpDir, 'astryx.integration.mjs'),
            state.manifest,
          );
        }
        const before = snapshot();

        // An icon set is experimental: its own call, not an integrationAdd kind.
        const add = (/** @type {Record<string, unknown>} */ more) =>
          kind === 'icon-set'
            ? iconNewSet(name, {cwd: tmpDir, ...options, ...more})
            : integrationAdd(kind, name, {cwd: tmpDir, ...options, ...more});
        const plan = await add({dryRun: true});
        expect(snapshot()).toEqual(before);

        const written = await add({});
        const after = snapshot();
        const changed = Object.keys(after)
          .filter(file => after[file] !== before[file])
          .sort();

        expect(written.data.root).toEqual(plan.data.root);
        expect(written.data.files).toEqual(plan.data.files);
        expect([...written.data.files].sort()).toEqual(changed);
      });
    }
  }
});
