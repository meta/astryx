// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration-provided template discovery (same-stem + type-driven).
 *
 * These tests stand up a temp consumer project with an astryx.config and an
 * installed integration package that contributes templates, then exercise the
 * public `template()` API to verify discovery, package/type scoping, ambiguity
 * errors, and copy-to-dir naming.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  discoverAllWithErrors,
  discoverCoreTemplates,
  template,
} from './template.mjs';
import {search} from '../search/search.mjs';
import {build} from '../build/build.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

let tmpDir;
let originalCwd;

function makeConsumer() {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-template-it-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    `export default { integrations: ['@acme/widgets'] };\n`,
  );
  return dir;
}

/**
 * Install an @acme/widgets integration package that declares a templates root.
 * @returns the package dir.
 */
function installWidgets(consumerDir) {
  const pkgDir = path.join(consumerDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '2.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default { templates: './templates' };\n`,
  );
  fs.mkdirSync(path.join(pkgDir, 'templates'));
  return pkgDir;
}

/** Write a template doc + same-stem source under the templates root. */
function writeTemplate(pkgDir, id, {kind, body, source, withSource = true}) {
  const docPath = path.join(pkgDir, 'templates', `${id}.doc.mjs`);
  fs.mkdirSync(path.dirname(docPath), {recursive: true});
  fs.writeFileSync(
    docPath,
    body ??
      `export default {type: '${kind}', name: '${id} name', description: '${id} desc'};\n`,
  );
  if (withSource) {
    fs.writeFileSync(
      path.join(pkgDir, 'templates', `${id}.tsx`),
      source ??
        `export default function ${id.replace(/[^a-zA-Z0-9]/g, '')}() { return null; }\n`,
    );
  }
}

/**
 * Set `replaces` on each named template's own doc, declaring the templates
 * root first when the package has no manifest yet.
 */
function declareReplaces(pkgDir, replacements) {
  const manifest = path.join(pkgDir, 'astryx.integration.mjs');
  if (!fs.existsSync(manifest)) {
    fs.writeFileSync(manifest, `export default {templates: './templates'};\n`);
  }
  for (const [id, target] of Object.entries(replacements)) {
    const docPath = path.join(pkgDir, 'templates', `${id}.doc.mjs`);
    const doc = fs.readFileSync(docPath, 'utf-8');
    if (!doc.includes('export default {'))
      throw new Error(`${id}: no doc object`);
    fs.writeFileSync(
      docPath,
      doc.replace(
        'export default {',
        `export default {replaces: ${JSON.stringify(target)}, `,
      ),
    );
  }
}

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = makeConsumer();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integration template discovery', () => {
  it('discovers and lists an integration template with package + type', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'pricing', {kind: 'page'});

    const result = await template(undefined, {list: true, cwd: tmpDir});
    expect(result.type).toBe('template.list');
    const entry = result.data.find(t => t.id === 'pricing');
    expect(entry).toBeTruthy();
    expect(entry.type).toBe('page');
    expect(entry.package).toBe('@acme/widgets');
    expect(entry.name).toBe('pricing name');
    expect(entry.description).toBe('pricing desc');
  });

  it("reads an integration template's keywords in search and build", async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'observatory', {
      kind: 'page',
      body: "export default {type: 'page', name: 'Observatory', description: 'Live tiles over a sky view.', category: 'Dashboard - Observatory', keywords: ['telescope', 'star map']};\n",
    });

    const found = await search('telescope', {cwd: tmpDir, type: 'template'});
    expect(found.data.results.map(r => r.name)).toContain('observatory');
    const kit = await build('telescope star map page', {cwd: tmpDir});
    if (kit.type !== 'build.kit') throw new Error(kit.type);
    expect(kit.data.start?.name).toBe('observatory');
  });

  it('preserves integration block showcase metadata in list output', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'chart-showcase', {
      kind: 'block',
      body: `export default {
  type: 'block',
  name: 'Chart',
  displayName: 'Chart',
  description: 'A chart.',
  category: 'components/Chart',
  exampleFor: 'Chart',
  aspectRatio: 16 / 10,
  isShowcase: true,
  alsoExampleFor: ['ChartBar'],
  alsoShowcaseFor: ['ChartSwatch'],
  componentsUsed: ['Chart'],
};\n`,
    });

    const result = await template(undefined, {
      list: true,
      type: 'block',
      package: '@acme/widgets',
      cwd: tmpDir,
    });
    expect(result.data[0]).toMatchObject({
      id: 'chart-showcase',
      displayName: 'Chart',
      exampleFor: 'Chart',
      aspectRatio: 1.6,
      isShowcase: true,
      alsoExampleFor: ['ChartBar'],
      alsoShowcaseFor: ['ChartSwatch'],
      componentsUsed: ['Chart'],
    });
  });

  it('lists nested-id templates (kebab path under root)', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'marketing/hero', {kind: 'block'});

    const result = await template(undefined, {list: true, cwd: tmpDir});
    const entry = result.data.find(t => t.id === 'marketing/hero');
    expect(entry).toBeTruthy();
    expect(entry.type).toBe('block');
    expect(entry.package).toBe('@acme/widgets');
  });

  it('always reports core templates under @astryxdesign/core', async () => {
    const result = await template(undefined, {list: true, cwd: tmpDir});
    const core = result.data.filter(t => t.package === '@astryxdesign/core');
    expect(core.length).toBeGreaterThan(0);
  });

  it('--package narrows the listing', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'pricing', {kind: 'page'});

    const result = await template(undefined, {
      list: true,
      package: '@acme/widgets',
      cwd: tmpDir,
    });
    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe('pricing');
  });

  it('skips a template whose same-stem source is missing', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'orphan', {kind: 'page', withSource: false});

    const result = await template(undefined, {list: true, cwd: tmpDir});
    expect(result.data.find(t => t.id === 'orphan')).toBeUndefined();
  });

  it('skips a raw doc that is missing a type', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'untyped', {
      kind: 'page',
      body: `export default {name: 'Untyped', description: 'no type'};\n`,
    });

    const result = await template(undefined, {list: true, cwd: tmpDir});
    expect(result.data.find(t => t.id === 'untyped')).toBeUndefined();
  });

  it('does not read Object prototype keys as replacements', async () => {
    const pkgDir = installWidgets(tmpDir);
    for (const id of ['constructor', 'toString', '__proto__']) {
      writeTemplate(pkgDir, id, {kind: 'page'});
    }

    const discovered = await discoverAllWithErrors(tmpDir);
    expect(
      discovered.errors.filter(error => error.replacementTarget != null),
    ).toEqual([]);
    for (const id of ['constructor', 'toString', '__proto__']) {
      const entry = discovered.templates.find(
        template =>
          template.dirName === id && template.package === '@acme/widgets',
      );
      expect(entry).toBeDefined();
      expect(entry?.replaces).toBeUndefined();
    }
  });

  it('errors with candidates when an id is ambiguous across type/package', async () => {
    const pkgDir = installWidgets(tmpDir);
    // Same id "hero" as both a page and a block within the integration.
    writeTemplate(pkgDir, 'hero', {kind: 'page'});
    // Add a sibling block doc with the same stem in a different file is not
    // possible (same file). Instead install a second package with a "hero".
    const pkg2 = path.join(tmpDir, 'node_modules', '@acme', 'extra');
    fs.mkdirSync(path.join(pkg2, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg2, 'package.json'),
      JSON.stringify({name: '@acme/extra', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(pkg2, 'astryx.integration.mjs'),
      `export default { templates: './templates' };\n`,
    );
    fs.writeFileSync(
      path.join(pkg2, 'templates', 'hero.doc.mjs'),
      `export default {type: 'block', name: 'Hero block', description: 'b'};\n`,
    );
    fs.writeFileSync(
      path.join(pkg2, 'templates', 'hero.tsx'),
      `export default function Hero() { return null; }\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default { integrations: ['@acme/widgets', '@acme/extra'] };\n`,
    );

    await expect(
      template('hero', {targetPath: './out', cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_AMBIGUOUS_TEMPLATE'});
  });

  it('--type and --package narrow an ambiguous id to a single match', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'pricing', {kind: 'page'});

    const result = await template('pricing', {
      type: 'page',
      package: '@acme/widgets',
      show: true,
      cwd: tmpDir,
    });
    expect(result.type).toBe('template.show');
    expect(result.data.type).toBe('page');
  });

  it('copies a page template into a directory as page.tsx', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'pricing', {kind: 'page'});

    const result = await template('pricing', {
      targetPath: './dest',
      cwd: tmpDir,
    });
    expect(result.type).toBe('template.copy');
    expect(result.data.fileName).toBe('page.tsx');
    expect(fs.existsSync(path.join(tmpDir, 'dest', 'page.tsx'))).toBe(true);
  });

  it('uses a declared integration replacement by default and keeps the Core original addressable', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell', {
      kind: 'page',
      source:
        'export default function AcmeAppShell() { return <nav>AcmeSideNav + AcmeTopNav</nav>; }\n',
    });
    declareReplaces(pkgDir, {
      'acme-app-shell': 'shell-side-nav',
    });

    const listed = await template(undefined, {list: true, cwd: tmpDir});
    expect(
      listed.data.find(entry => entry.id === 'acme-app-shell'),
    ).toMatchObject({
      package: '@acme/widgets',
      replaces: 'shell-side-nav',
    });
    expect(
      listed.data.find(
        entry =>
          entry.id === 'shell-side-nav' &&
          entry.package === '@astryxdesign/core',
      ),
    ).toBeUndefined();

    const selected = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('acme-app-shell');
    expect(selected.data.source).toContain('AcmeSideNav + AcmeTopNav');

    const searched = await search('shell-side-nav', {
      type: 'template',
      cwd: tmpDir,
    });
    expect(searched.data.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: 'acme-app-shell'}),
      ]),
    );

    const original = await template('shell-side-nav', {
      package: '@astryxdesign/core',
      show: true,
      cwd: tmpDir,
    });
    expect(original.data.template).toBe('shell-side-nav');
    expect(original.data.source).toContain('@astryxdesign/core/SideNav');
    expect(original.data.source).not.toContain('AcmeSideNav + AcmeTopNav');
  });

  it('uses canonical replacement resolution for copy collisions', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell', {kind: 'page'});
    declareReplaces(pkgDir, {
      'acme-app-shell': 'shell-side-nav',
    });
    const target = path.join(tmpDir, 'existing');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'page.tsx'), '// keep me\n');

    const result = await runCli(
      ['template', 'shell-side-nav', 'existing'],
      tmpDir,
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'Refusing to overwrite existing file',
    );
    expect(fs.readFileSync(path.join(target, 'page.tsx'), 'utf-8')).toBe(
      '// keep me\n',
    );
  });

  it('keeps package-scoped lookup exact when one package also owns the Core id', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell', {
      kind: 'page',
      source:
        "export default function AcmeAppShell() { return 'active replacement'; }\n",
    });
    writeTemplate(pkgDir, 'shell-side-nav', {
      kind: 'page',
      source:
        "export default function PackageShellSideNav() { return 'package exact id'; }\n",
    });
    declareReplaces(pkgDir, {
      'acme-app-shell': 'shell-side-nav',
    });

    const unqualified = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(unqualified.data.template).toBe('acme-app-shell');
    expect(unqualified.data.source).toContain('active replacement');

    const packageExact = await template('shell-side-nav', {
      package: '@acme/widgets',
      show: true,
      cwd: tmpDir,
    });
    expect(packageExact.data.template).toBe('shell-side-nav');
    expect(packageExact.data.source).toContain('package exact id');

    const packageOwnId = await template('acme-app-shell', {
      package: '@acme/widgets',
      show: true,
      cwd: tmpDir,
    });
    expect(packageOwnId.data.template).toBe('acme-app-shell');
    expect(packageOwnId.data.source).toContain('active replacement');
  });

  it('preserves an active replacement whose own id is another active target', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'shell-top-nav', {
      kind: 'page',
      source:
        "export default function FirstReplacement() { return 'first replacement'; }\n",
    });
    writeTemplate(pkgDir, 'acme-second-shell', {
      kind: 'page',
      source:
        "export default function SecondReplacement() { return 'second replacement'; }\n",
    });
    declareReplaces(pkgDir, {
      'shell-top-nav': 'shell-side-nav',
      'acme-second-shell': 'shell-top-nav',
    });

    const first = await template('shell-side-nav', {show: true, cwd: tmpDir});
    expect(first.data.template).toBe('shell-top-nav');
    expect(first.data.source).toContain('first replacement');

    const second = await template('shell-top-nav', {show: true, cwd: tmpDir});
    expect(second.data.template).toBe('acme-second-shell');
    expect(second.data.source).toContain('second replacement');

    const firstSearch = await search('shell-side-nav', {
      type: 'template',
      cwd: tmpDir,
    });
    expect(firstSearch.data.results[0]).toMatchObject({
      name: 'shell-top-nav',
      command: 'astryx template shell-side-nav --type page',
    });

    const secondSearch = await search('shell-top-nav', {
      type: 'template',
      cwd: tmpDir,
    });
    expect(secondSearch.data.results[0]).toMatchObject({
      name: 'acme-second-shell',
      command: 'astryx template shell-top-nav --type page',
    });

    const renderedBuild = await runCli(['build', 'shell-side-nav'], tmpDir);
    expect(renderedBuild.status).toBe(0);
    expect(renderedBuild.stdout).toContain(
      'template shell-side-nav --type page <path>',
    );
    expect(renderedBuild.stdout).not.toContain('template shell-top-nav <path>');

    const listed = await template(undefined, {list: true, cwd: tmpDir});
    expect(listed.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'shell-top-nav',
          replaces: 'shell-side-nav',
          package: '@acme/widgets',
        }),
        expect.objectContaining({
          id: 'acme-second-shell',
          replaces: 'shell-top-nav',
          package: '@acme/widgets',
        }),
      ]),
    );
  });

  it('keeps an active replacement ahead of an undeclared exact-id template in search', async () => {
    const active = installWidgets(tmpDir);
    writeTemplate(active, 'active-shell', {
      kind: 'page',
      body: `export default {type: 'page', name: 'ZZZ active shell', description: 'replacement'};\n`,
    });
    declareReplaces(active, {'active-shell': 'shell-side-nav'});

    const accidental = path.join(tmpDir, 'node_modules', '@acme', 'extra');
    fs.mkdirSync(path.join(accidental, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(accidental, 'package.json'),
      JSON.stringify({name: '@acme/extra', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(accidental, 'astryx.integration.mjs'),
      `export default {templates: './templates'};\n`,
    );
    writeTemplate(accidental, 'shell-side-nav', {
      kind: 'page',
      body: `export default {type: 'page', name: 'AAA accidental shell', description: 'collision'};\n`,
    });
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default { integrations: ['@acme/widgets', '@acme/extra'] };\n`,
    );

    const selected = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('active-shell');
    const searched = await search('shell-side-nav', {
      type: 'template',
      cwd: tmpDir,
    });
    expect(searched.data.results[0]).toMatchObject({
      name: 'active-shell',
      command: 'astryx template shell-side-nav --type page',
    });
  });

  it('keeps the old discovery behavior when no replacement is declared', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell', {kind: 'page'});

    const core = await template('shell-side-nav', {show: true, cwd: tmpDir});
    expect(core.data.template).toBe('shell-side-nav');
    const integration = await template('acme-app-shell', {
      show: true,
      cwd: tmpDir,
    });
    expect(integration.data.template).toBe('acme-app-shell');
  });

  it('fails an ambiguous replacement closed and reports every declaration', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell-a', {kind: 'page'});
    writeTemplate(pkgDir, 'acme-app-shell-b', {kind: 'page'});
    declareReplaces(pkgDir, {
      'acme-app-shell-a': 'shell-side-nav',
      'acme-app-shell-b': 'shell-side-nav',
    });

    const discovered = await discoverAllWithErrors(tmpDir);
    expect(
      discovered.errors.filter(
        error => error.code === 'ambiguous_template_replacement',
      ),
    ).toHaveLength(2);
    const selected = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('shell-side-nav');
    expect(
      discovered.templates.filter(template =>
        template.dirName.startsWith('acme-app-shell-'),
      ),
    ).toHaveLength(2);
  });

  it('does not activate a replacement when the same package also declares a missing template', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell', {kind: 'page'});
    writeTemplate(pkgDir, 'missing-app-shell', {
      kind: 'page',
      withSource: false,
    });
    declareReplaces(pkgDir, {
      'acme-app-shell': 'shell-side-nav',
      'missing-app-shell': 'shell-side-nav',
    });

    const discovered = await discoverAllWithErrors(tmpDir);
    expect(discovered.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_template_replacement',
          template: 'missing-app-shell',
        }),
      ]),
    );
    const selected = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('shell-side-nav');
    const own = await template('acme-app-shell', {show: true, cwd: tmpDir});
    expect(own.data.template).toBe('acme-app-shell');
  });

  it('keeps Core when a template whose metadata does not load declares the same replacement', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell', {kind: 'page'});
    writeTemplate(pkgDir, 'broken-app-shell', {
      kind: 'page',
      body: "export default {type: 'page', name: 'broken', description: 'b', bogusField: 1};\n",
    });
    writeTemplate(pkgDir, 'unparsable-app-shell', {
      kind: 'page',
      body: "export default {replaces: 'shell-side-nav', type: 'page' name: 'x'};\n",
    });
    declareReplaces(pkgDir, {
      'acme-app-shell': 'shell-side-nav',
      'broken-app-shell': 'shell-side-nav',
    });

    const discovered = await discoverAllWithErrors(tmpDir);
    for (const id of ['broken-app-shell', 'unparsable-app-shell']) {
      expect(discovered.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid_template_replacement',
            template: id,
            replacementTarget: 'shell-side-nav',
          }),
        ]),
      );
    }
    const selected = await template('shell-side-nav', {show: true, cwd: tmpDir});
    expect(selected.data.template).toBe('shell-side-nav');
  });

  it('keeps Core when an installed .doc.ts template with invalid metadata computes its replacement', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell', {kind: 'page'});
    declareReplaces(pkgDir, {'acme-app-shell': 'shell-side-nav'});
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'ts-app-shell.doc.ts'),
      "const target: string = 'shell-side-nav';\nexport default {replaces: target, type: 'page', name: 'ts', description: 'd', bogusField: 1};\n",
    );
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'ts-app-shell.tsx'),
      'export default function TsAppShell() { return null; }\n',
    );
    const discovered = await discoverAllWithErrors(tmpDir);
    expect(discovered.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_template_replacement',
          template: 'ts-app-shell',
          replacementTarget: 'shell-side-nav',
        }),
      ]),
    );
    const selected = await template('shell-side-nav', {show: true, cwd: tmpDir});
    expect(selected.data.template).toBe('shell-side-nav');
  });

  it('keeps --json stdout clean when an unusable template doc writes as it loads', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      "export default {templates: './local-templates'};\n",
    );
    fs.mkdirSync(path.join(tmpDir, 'local-templates'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'local-templates', 'acme-shell.doc.ts'),
      "process.stdout.write('HELLO-FROM-DOC\\n');\nexport default {name: 'acme-shell', description: 'Acme shell.', replaces: 'dashboard'};\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, 'local-templates', 'acme-shell.tsx'),
      'export default function AcmeShell() { return null; }\n',
    );
    const result = await runCli(['--json', 'template', '--list'], tmpDir);
    expect(result.stdout).not.toContain('HELLO-FROM-DOC');
    // One clean JSON envelope, and the doc was read: its replacement shows.
    const envelope = JSON.parse(result.stdout);
    expect(envelope.type).toBe('template.list');
    const discovered = await discoverAllWithErrors(tmpDir);
    expect(discovered.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({template: 'acme-shell', replacementTarget: 'dashboard'}),
      ]),
    );
  });

  it('lets the later configured package win a shared replacement target with a warning', async () => {
    const first = installWidgets(tmpDir);
    writeTemplate(first, 'acme-app-shell-a', {
      kind: 'page',
      source:
        "export default function AcmeAppShellA() { return 'first replacement'; }\n",
    });
    declareReplaces(first, {
      'acme-app-shell-a': 'shell-side-nav',
    });

    const second = path.join(tmpDir, 'node_modules', '@acme', 'extra');
    fs.mkdirSync(path.join(second, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(second, 'package.json'),
      JSON.stringify({name: '@acme/extra', version: '1.0.0'}),
    );
    writeTemplate(second, 'acme-app-shell-b', {
      kind: 'page',
      source:
        "export default function AcmeAppShellB() { return 'later replacement'; }\n",
    });
    declareReplaces(second, {
      'acme-app-shell-b': 'shell-side-nav',
    });
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default { integrations: ['@acme/widgets', '@acme/extra'] };\n`,
    );

    const discovered = await discoverAllWithErrors(tmpDir);
    expect(discovered.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ambiguous_template_replacement',
          severity: 'warning',
          package: '@acme/extra',
        }),
      ]),
    );
    const selected = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('acme-app-shell-b');
    expect(selected.data.source).toContain('later replacement');

    const command = await runCli(['template', 'shell-side-nav'], tmpDir);
    expect(command.status).toBe(0);
    expect(command.stderr).toContain('@acme/extra has 1 integration issue');
    expect(command.stderr).toMatch(/Run: .+ doctor/);

    const doctor = await runCli(['doctor'], tmpDir);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain('configured later');
  });

  it('keeps an explicitly configured replacement ahead of an autolinked one', async () => {
    const explicit = installWidgets(tmpDir);
    writeTemplate(explicit, 'explicit-shell', {
      kind: 'page',
      source:
        "export default function ExplicitShell() { return 'explicit replacement'; }\n",
    });
    declareReplaces(explicit, {
      'explicit-shell': 'shell-side-nav',
    });

    const implicit = path.join(tmpDir, 'node_modules', '@acme', 'implicit');
    fs.mkdirSync(path.join(implicit, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(implicit, 'package.json'),
      JSON.stringify({name: '@acme/implicit', version: '1.0.0'}),
    );
    writeTemplate(implicit, 'implicit-shell', {
      kind: 'page',
      source:
        "export default function ImplicitShell() { return 'implicit replacement'; }\n",
    });
    declareReplaces(implicit, {
      'implicit-shell': 'shell-side-nav',
    });
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: {
          '@acme/widgets': '1.0.0',
          '@acme/implicit': '1.0.0',
        },
      }),
    );

    const discovered = await discoverAllWithErrors(tmpDir);
    expect(discovered.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ambiguous_template_replacement',
          severity: 'warning',
          package: '@acme/widgets',
          message: expect.stringContaining('explicitly configured'),
        }),
      ]),
    );
    const selected = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('explicit-shell');
    expect(selected.data.source).toContain('explicit replacement');
  });

  it('describes precedence truthfully when only autolinked packages conflict', async () => {
    const first = installWidgets(tmpDir);
    writeTemplate(first, 'first-shell', {kind: 'page'});
    declareReplaces(first, {
      'first-shell': 'shell-side-nav',
    });

    const second = path.join(tmpDir, 'node_modules', '@acme', 'implicit');
    fs.mkdirSync(path.join(second, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(second, 'package.json'),
      JSON.stringify({name: '@acme/implicit', version: '1.0.0'}),
    );
    writeTemplate(second, 'second-shell', {kind: 'page'});
    declareReplaces(second, {
      'second-shell': 'shell-side-nav',
    });
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      'export default {};\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: {
          '@acme/widgets': '1.0.0',
          '@acme/implicit': '1.0.0',
        },
      }),
    );

    const discovered = await discoverAllWithErrors(tmpDir);
    const warning = discovered.errors.find(
      error => error.code === 'ambiguous_template_replacement',
    );

    expect(warning?.package).toBe('@acme/implicit');
    expect(warning?.message).toContain(
      'listed later in package.json dependencies',
    );
    expect(warning?.message).toContain('astryx.config');
    expect(warning?.message).not.toContain('configured later');
  });

  it('does not let an invalid autolinked declaration disable an explicit replacement', async () => {
    const explicit = installWidgets(tmpDir);
    writeTemplate(explicit, 'explicit-shell', {
      kind: 'page',
      source:
        "export default function ExplicitShell() { return 'explicit replacement'; }\n",
    });
    declareReplaces(explicit, {
      'explicit-shell': 'shell-side-nav',
    });

    const implicit = path.join(tmpDir, 'node_modules', '@acme', 'implicit');
    fs.mkdirSync(path.join(implicit, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(implicit, 'package.json'),
      JSON.stringify({name: '@acme/implicit', version: '1.0.0'}),
    );
    writeTemplate(implicit, 'wrong-kind-shell', {kind: 'block'});
    declareReplaces(implicit, {
      'wrong-kind-shell': 'shell-side-nav',
    });
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: {
          '@acme/widgets': '1.0.0',
          '@acme/implicit': '1.0.0',
        },
      }),
    );

    const discovered = await discoverAllWithErrors(tmpDir);
    expect(discovered.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_template_replacement',
          package: '@acme/implicit',
        }),
      ]),
    );
    const selected = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('explicit-shell');
  });

  it('fails closed when an earlier package has an invalid replacement for the winning target', async () => {
    const first = installWidgets(tmpDir);
    writeTemplate(first, 'wrong-kind-shell', {kind: 'block'});
    declareReplaces(first, {
      'wrong-kind-shell': 'shell-side-nav',
    });

    const second = path.join(tmpDir, 'node_modules', '@acme', 'extra');
    fs.mkdirSync(path.join(second, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(second, 'package.json'),
      JSON.stringify({name: '@acme/extra', version: '1.0.0'}),
    );
    writeTemplate(second, 'valid-shell', {kind: 'page'});
    declareReplaces(second, {
      'valid-shell': 'shell-side-nav',
    });
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default { integrations: ['@acme/widgets', '@acme/extra'] };\n`,
    );

    const discovered = await discoverAllWithErrors(tmpDir);
    expect(discovered.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_template_replacement',
          package: '@acme/widgets',
        }),
      ]),
    );
    const selected = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('shell-side-nav');
  });

  it('reports a missing Core target and leaves the integration template available by its own id', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell', {kind: 'page'});
    declareReplaces(pkgDir, {
      'acme-app-shell': 'missing-core-shell',
    });

    const discovered = await discoverAllWithErrors(tmpDir);
    expect(discovered.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_template_replacement_target',
          template: 'acme-app-shell',
        }),
      ]),
    );
    const integration = await template('acme-app-shell', {
      show: true,
      cwd: tmpDir,
    });
    expect(integration.data.template).toBe('acme-app-shell');
    const listed = await template(undefined, {
      list: true,
      package: '@acme/widgets',
      cwd: tmpDir,
    });
    expect(
      listed.data.find(entry => entry.id === 'acme-app-shell')?.replaces,
    ).toBeUndefined();
  });

  it('reports a missing self-id target without hiding the integration template', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'ghost-shell', {kind: 'page'});
    declareReplaces(pkgDir, {
      'ghost-shell': 'ghost-shell',
    });

    const discovered = await discoverAllWithErrors(tmpDir);
    expect(discovered.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_template_replacement_target',
          template: 'ghost-shell',
          replacementTarget: 'ghost-shell',
        }),
      ]),
    );
    expect(
      discovered.templates.find(
        candidate =>
          candidate.dirName === 'ghost-shell' &&
          candidate.package === '@acme/widgets',
      ),
    ).toBeDefined();

    const selected = await template('ghost-shell', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('ghost-shell');
    expect(selected.data.source).toContain('ghostshell');
  });

  it('reports a replacement whose kind does not match Core', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell', {kind: 'block'});
    declareReplaces(pkgDir, {
      'acme-app-shell': 'shell-side-nav',
    });

    const discovered = await discoverAllWithErrors(tmpDir);
    expect(discovered.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_template_replacement',
          template: 'acme-app-shell',
        }),
      ]),
    );
    const selected = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('shell-side-nav');
  });

  it('falls back to Core for a rejected same-id replacement while package lookup keeps the integration template', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'shell-side-nav', {kind: 'block'});
    declareReplaces(pkgDir, {
      'shell-side-nav': 'shell-side-nav',
    });

    const selected = await template('shell-side-nav', {
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('shell-side-nav');
    expect(selected.data.type).toBe('page');

    const integration = await template('shell-side-nav', {
      package: '@acme/widgets',
      show: true,
      cwd: tmpDir,
    });
    expect(integration.data.template).toBe('shell-side-nav');
    expect(integration.data.type).toBe('block');

    const block = await template('shell-side-nav', {
      type: 'block',
      show: true,
      cwd: tmpDir,
    });
    expect(block.data.template).toBe('shell-side-nav');
    expect(block.data.type).toBe('block');

    const listedBlocks = await template(undefined, {
      list: true,
      type: 'block',
      cwd: tmpDir,
    });
    expect(listedBlocks.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'shell-side-nav',
          type: 'block',
          package: '@acme/widgets',
        }),
      ]),
    );

    const searched = await search('shell-side-nav', {
      type: 'template',
      limit: 100,
      cwd: tmpDir,
    });
    const sameId = searched.data.results.filter(
      result => result.name === 'shell-side-nav',
    );
    expect(sameId).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'page',
          command: 'astryx template shell-side-nav --type page',
        }),
        expect.objectContaining({
          kind: 'block',
          command: 'astryx template shell-side-nav --type block',
        }),
      ]),
    );

    const kit = await build('shell-side-nav', {
      type: 'template',
      limit: 100,
      cwd: tmpDir,
    });
    expect(kit.type).toBe('build.kit');
    if (kit.type !== 'build.kit') throw new Error('expected build.kit');
    expect(kit.data.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'shell-side-nav',
          command: 'astryx template shell-side-nav --type block',
        }),
      ]),
    );
  });

  it('round-trips both kinds when a block replacement shadows a page with the same id', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-callout', {
      kind: 'block',
      source:
        "export default function AcmeCallout() { return 'replacement block'; }\n",
    });
    writeTemplate(pkgDir, 'CardCallout', {
      kind: 'page',
      source:
        "export default function CardCalloutPage() { return 'ordinary page'; }\n",
    });
    declareReplaces(pkgDir, {
      'acme-callout': 'CardCallout',
    });

    const bare = await template('CardCallout', {show: true, cwd: tmpDir});
    expect(bare.data.template).toBe('acme-callout');
    expect(bare.data.type).toBe('block');

    const page = await template('CardCallout', {
      type: 'page',
      show: true,
      cwd: tmpDir,
    });
    expect(page.data.template).toBe('CardCallout');
    expect(page.data.type).toBe('page');

    const searched = await search('CardCallout', {
      type: 'template',
      limit: 100,
      cwd: tmpDir,
    });
    expect(searched.data.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'CardCallout',
          kind: 'page',
          command: 'astryx template CardCallout --type page',
        }),
        expect.objectContaining({
          name: 'acme-callout',
          kind: 'block',
          command: 'astryx template CardCallout --type block',
        }),
      ]),
    );

    const kit = await build('CardCallout', {
      type: 'template',
      limit: 100,
      cwd: tmpDir,
    });
    expect(kit.type).toBe('build.kit');
    if (kit.type !== 'build.kit') throw new Error('expected build.kit');
    expect(kit.data.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'CardCallout',
          command: 'astryx template CardCallout --type page',
        }),
      ]),
    );
    expect(kit.data.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'acme-callout',
          command: 'astryx template CardCallout --type block',
        }),
      ]),
    );
  });

  it('copies a block template into a directory as <id-basename>.tsx', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'marketing/hero', {kind: 'block'});

    const result = await template('marketing/hero', {
      targetPath: './dest',
      cwd: tmpDir,
    });
    expect(result.type).toBe('template.copy');
    expect(result.data.fileName).toBe('hero.tsx');
    expect(fs.existsSync(path.join(tmpDir, 'dest', 'hero.tsx'))).toBe(true);
  });
});

describe('build names a start its command selects', () => {
  it('scaffolds an integration replacement through the Core id it replaces', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'acme-app-shell', {
      kind: 'page',
      body: "export default {type: 'page', name: 'Acme App Shell', category: 'Shell - Acme Sidebar', description: 'Acme application frame with a left sidebar navigation. Shell, frame, or sidebar navigation.'};\n",
    });
    declareReplaces(pkgDir, {'acme-app-shell': 'shell-side-nav'});

    const kit = await build('acme application frame with sidebar navigation', {
      cwd: tmpDir,
    });
    expect(kit.type).toBe('build.kit');
    if (kit.type !== 'build.kit') throw new Error('expected build.kit');
    expect(kit.data.start).toMatchObject({
      name: 'acme-app-shell',
      command: 'astryx template shell-side-nav --type page <path>',
    });
    const selected = await template('shell-side-nav', {
      type: 'page',
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('acme-app-shell');
  });

  it('keeps the start command unambiguous when a block shares the id', async () => {
    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, 'contact-form', {kind: 'block'});

    const kit = await build('contact form', {cwd: tmpDir});
    expect(kit.type).toBe('build.kit');
    if (kit.type !== 'build.kit') throw new Error('expected build.kit');
    expect(kit.data.start).toMatchObject({
      name: 'contact-form',
      command: 'astryx template contact-form --type page <path>',
    });
    const selected = await template('contact-form', {
      type: 'page',
      show: true,
      cwd: tmpDir,
    });
    expect(selected.data.template).toBe('contact-form');
    // The bare id is ambiguous here, which is why the command carries --type.
    await expect(
      template('contact-form', {show: true, cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_AMBIGUOUS_TEMPLATE'});
  });

  it('resolves chained template aliases without the layout command', async () => {
    const [firstTarget, secondTarget] = (await discoverCoreTemplates()).filter(
      candidate => candidate.type === 'block',
    );
    expect(firstTarget).toBeDefined();
    expect(secondTarget).toBeDefined();

    const pkgDir = installWidgets(tmpDir);
    writeTemplate(pkgDir, secondTarget.dirName, {
      kind: 'block',
      source:
        'export default function FirstReplacement() { return <span>First chain replacement</span>; }\n',
    });
    writeTemplate(pkgDir, 'acme-final-block', {
      kind: 'block',
      source:
        'export default function FinalReplacement() { return <span>Final chain replacement</span>; }\n',
    });
    declareReplaces(pkgDir, {
      [secondTarget.dirName]: firstTarget.dirName,
      'acme-final-block': secondTarget.dirName,
    });

    const firstTemplate = await template(firstTarget.dirName, {
      show: true,
      cwd: tmpDir,
    });
    expect(firstTemplate.data.source).toContain('First chain replacement');

    const secondTemplate = await template(secondTarget.dirName, {
      show: true,
      cwd: tmpDir,
    });
    expect(secondTemplate.data.source).toContain('Final chain replacement');
  }, 30_000);

});
