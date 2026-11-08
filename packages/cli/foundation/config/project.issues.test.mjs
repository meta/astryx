// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file project.issues.test.mjs
 * @input Consumer projects under a repo-local temp dir: one with no
 *   integration, one whose integration has no templates, and ones whose
 *   integration's templates are broken or replace a missing Core template
 * @output Proves that Project.issues() reads no template doc unless an
 *   integration has templates, and still finds that integration's issues
 * @position Beside project.test.mjs, in its own file because it replaces
 *   the doc compiler's import module to count template doc imports
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const templateImports = vi.hoisted(() => ({count: 0}));

vi.mock('../doc-compiler/import.mjs', async importOriginal => {
  /** @type {typeof import('../doc-compiler/import.mjs')} */
  const original = await importOriginal();
  return {
    ...original,
    importTemplateModule: (/** @type {string} */ file) => {
      templateImports.count += 1;
      return original.importTemplateModule(file);
    },
  };
});

/** @type {typeof import('./project.mjs').Project} */
let Project;
/** @type {string} */
let tmpDir;
/** @type {string} */
let originalCwd;

beforeEach(async () => {
  // Fresh modules for each case, so no template discovery that an earlier
  // case ran can answer from memory and hide the imports.
  vi.resetModules();
  ({Project} = await import('./project.mjs'));
  originalCwd = process.cwd();
  // Repo-local, because Vite blocks the dynamic import of modules under /tmp.
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-project-issues-test-'),
  );
  process.chdir(tmpDir);
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  templateImports.count = 0;
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Installs `@acme/widgets` with `manifest` and names it in the config.
 * @param {object} manifest
 * @returns {string} the package folder
 */
function installIntegration(manifest) {
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default ${JSON.stringify({integrations: ['@acme/widgets']})};\n`,
  );
  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default ${JSON.stringify(manifest)};\n`,
  );
  return pkgDir;
}

describe('Project.issues()', () => {
  it('reads no template doc for a project with no integration', async () => {
    const project = await Project.load(tmpDir);
    expect(project.loadedIntegrations).toEqual([]);
    expect(await project.issues()).toEqual([]);
    expect(templateImports.count).toBe(0);
  });

  it('reads no template doc when no loaded integration has templates', async () => {
    const pkgDir = installIntegration({themes: './themes'});
    fs.mkdirSync(path.join(pkgDir, 'themes'));
    const project = await Project.load(tmpDir);
    expect(project.loadedIntegrations).toHaveLength(1);
    expect(await project.issues()).toEqual([]);
    expect(templateImports.count).toBe(0);
  });

  it("still finds an integration's replacement of a missing Core template", async () => {
    const pkgDir = installIntegration({templates: './templates'});
    fs.mkdirSync(path.join(pkgDir, 'templates', 'pages', 'acme-shell'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'pages', 'acme-shell', 'template.doc.mjs'),
      `export default {type: 'page', name: 'Acme shell', description: 'A shell', replaces: 'no-such-core-page'};\n`,
    );
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'pages', 'acme-shell', 'template.tsx'),
      'export default function Template() { return null; }\n',
    );
    const project = await Project.load(tmpDir);
    expect(await project.issues()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          package: '@acme/widgets',
          code: 'missing_template_replacement_target',
        }),
      ]),
    );
    expect(templateImports.count).toBeGreaterThan(0);
  });

  it("still finds an integration's template issue when nothing discovered templates first", async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default ${JSON.stringify({integrations: ['@acme/widgets']})};\n`,
    );
    const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
    fs.mkdirSync(path.join(pkgDir, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      `export default ${JSON.stringify({templates: './templates'})};\n`,
    );
    // A template doc with no source file beside it.
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'broken.template.mjs'),
      `export default {type: 'block', name: 'Broken', description: 'Missing source'};\n`,
    );
    const project = await Project.load(tmpDir);
    expect(await project.issues()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          package: '@acme/widgets',
          code: 'invalid_template',
        }),
      ]),
    );
    expect(templateImports.count).toBeGreaterThan(0);
  });
});
