// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Validates that every CLI-discoverable component produces a correct
 * import hint that matches an actual package.json export subpath.
 *
 * This guards against:
 * - Import paths pointing to non-existent exports
 * - Case mismatches (Theme vs theme)
 * - Group names leaking as import paths
 * - resolveImportPath regressions
 *
 * Runs against the real packages/core source, not mocks.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  resolveImportPath,
  discoverComponents,
  findComponentSource,
} from './component.mjs';
import {findCoreDir} from '../../../foundation/fs/paths.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

describe('import hint correctness', () => {
  const coreDir = findCoreDir();
  const pkg = JSON.parse(
    fs.readFileSync(path.join(coreDir, 'package.json'), 'utf-8'),
  );
  const validExports = new Set(
    Object.keys(pkg.exports || {})
      .filter(k => k !== '.' && k !== './package.json')
      .map(k => k.replace('./', '')),
  );

  const componentMap = discoverComponents(coreDir);
  const groupNames = Object.keys(componentMap);

  // Collect all individual component names (non-group)
  const individualComponents = [];
  for (const [group, members] of Object.entries(componentMap)) {
    for (const member of members) {
      individualComponents.push(member);
    }
  }

  describe('every component resolves to a tree-shakeable subpath (not bare @astryxdesign/core)', () => {
    for (const name of individualComponents) {
      it(`${name} resolves to @astryxdesign/core/<subpath>, not bare @astryxdesign/core`, () => {
        const importPath = resolveImportPath(coreDir, name);

        // Must never be empty
        expect(importPath).toBeTruthy();

        // Must resolve to a specific subpath — bare @astryxdesign/core is not tree-shakeable
        expect(importPath).not.toBe('@astryxdesign/core');

        // The subpath must exist in package.json exports
        const subpath = importPath.replace('@astryxdesign/core/', '');
        expect(validExports.has(subpath)).toBe(true);
      });
    }
  });

  describe('import hint case matches package.json exports exactly', () => {
    for (const name of individualComponents) {
      it(`${name} import path has correct casing`, () => {
        const importPath = resolveImportPath(coreDir, name);
        if (importPath === '@astryxdesign/core') return; // skip bare fallback

        const subpath = importPath.replace('@astryxdesign/core/', '');

        // Must be an exact (case-sensitive) match to an export key
        const exportKeys = Object.keys(pkg.exports || {}).map(k =>
          k.replace('./', ''),
        );
        expect(exportKeys).toContain(subpath);
      });
    }
  });

  describe('CLI --detail compact shows correct import path', () => {
    // Test a representative set across different patterns
    const representative = [
      {name: 'Button', expected: '@astryxdesign/core/Button'},
      {name: 'Theme', expected: '@astryxdesign/core/theme'},
      {name: 'CheckboxInput', expected: '@astryxdesign/core/CheckboxInput'},
      {name: 'Table', expected: '@astryxdesign/core/Table'},
      {name: 'TextInput', expected: '@astryxdesign/core/TextInput'},
      {name: 'Layout', expected: '@astryxdesign/core/Layout'},
      {name: 'AppShell', expected: '@astryxdesign/core/AppShell'},
      {name: 'Card', expected: '@astryxdesign/core/Card'},
      {name: 'Dialog', expected: '@astryxdesign/core/Dialog'},
      {name: 'TabList', expected: '@astryxdesign/core/TabList'},
    ];

    for (const {name, expected} of representative) {
      it(`npx astryx component ${name} --detail compact shows ${expected}`, async () => {
        const result = await runCli(['component', name, '--detail', 'compact'], REPO_ROOT);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain(expected);
      });
    }
  });

  describe('CLI --detail full shows import hint', () => {
    const representative = ['Button', 'Theme', 'Table', 'CheckboxInput'];

    for (const name of representative) {
      it(`npx astryx component ${name} (full) includes import statement`, async () => {
        const result = await runCli(['component', name], REPO_ROOT);
        expect(result.code).toBe(0);
        // The PR adds: **Import:** `import {XDS...} from '...';`
        expect(result.stdout).toMatch(/import\s*\{/);
        expect(result.stdout).toContain('@astryxdesign/core');
      });
    }
  });

  describe('integration-owned components show their own package as the import hint', () => {
    /**
     * @param {{exports?: Record<string, string>}} [opts]
     * @returns {string} the fixture's project root (pass as runCli's cwd)
     */
    function createIntegrationFixture({exports: pkgExports} = {}) {
      // Outside the source tree: a scan of the repo's docs (docs-drift)
      // running at the same time must never find this fixture's doc.
      const fixtureDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-import-hint-integration-'),
      );

      fs.mkdirSync(path.join(fixtureDir, 'packages'), {recursive: true});
      fs.symlinkSync(coreDir, path.join(fixtureDir, 'packages', 'core'));
      fs.writeFileSync(
        path.join(fixtureDir, 'package.json'),
        JSON.stringify({name: 'fixture-app', version: '1.0.0'}),
      );
      fs.writeFileSync(
        path.join(fixtureDir, 'astryx.config.mjs'),
        "export default { integrations: ['@test/widgets'] };",
      );

      const intDir = path.join(fixtureDir, 'node_modules', '@test', 'widgets');
      const compDir = path.join(intDir, 'components', 'Widget');
      fs.mkdirSync(compDir, {recursive: true});
      fs.writeFileSync(
        path.join(intDir, 'package.json'),
        JSON.stringify({
          name: '@test/widgets',
          version: '1.0.0',
          ...(pkgExports ? {exports: pkgExports} : {}),
        }),
      );
      fs.writeFileSync(
        path.join(intDir, 'astryx.integration.mjs'),
        "export default { components: './components' };",
      );
      fs.writeFileSync(
        path.join(compDir, 'Widget.doc.mjs'),
        "export const docs = {\n  name: 'Widget',\n  usage: { description: 'A test widget.' },\n  props: [{ name: 'label', type: 'string', description: 'Label text' }],\n};\n",
      );

      return fixtureDir;
    }

    it('component <Name> (full) shows the integration package, not @astryxdesign/core', async () => {
      const fixtureDir = createIntegrationFixture();
      try {
        const result = await runCli(['component', 'Widget'], fixtureDir);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain("from '@test/widgets';");
        expect(result.stdout).not.toContain('@astryxdesign/core');
      } finally {
        fs.rmSync(fixtureDir, {recursive: true, force: true});
      }
    });

    it('component <Name> --detail compact also shows the integration package', async () => {
      const fixtureDir = createIntegrationFixture();
      try {
        const result = await runCli(
          ['component', 'Widget', '--detail', 'compact'],
          fixtureDir,
        );
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('@test/widgets');
        expect(result.stdout).not.toContain('@astryxdesign/core');
      } finally {
        fs.rmSync(fixtureDir, {recursive: true, force: true});
      }
    });

    it('resolves to a subpath when the integration exports one for the component', async () => {
      const fixtureDir = createIntegrationFixture({
        exports: {
          '.': './index.js',
          './Widget': './components/Widget/index.js',
        },
      });
      try {
        const result = await runCli(['component', 'Widget'], fixtureDir);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain("from '@test/widgets/Widget';");
      } finally {
        fs.rmSync(fixtureDir, {recursive: true, force: true});
      }
    });

    it('builds its fixture where a scan of the repo\u2019s docs running at the same time never finds it', async () => {
      // The docs-drift scan walks packages/cli/clients/cli/commands for
      // .doc.mjs files. A fixture built there handed it this test's Widget
      // doc, which could vanish before the scan imported it.
      const fixtureDir = createIntegrationFixture();
      try {
        const {collectDocs} = await import('../../../test/drift/docs-drift.mjs');
        const found = (await collectDocs())
          .map(({file}) => path.resolve(REPO_ROOT, file))
          .filter(file => file.startsWith(fixtureDir + path.sep));
        expect(found).toEqual([]);
      } finally {
        fs.rmSync(fixtureDir, {recursive: true, force: true});
      }
    });
  });

  describe('group names do NOT resolve to incorrect import paths', () => {
    const groups = ['Checkbox', 'Radio', 'Chat', 'Tabs', 'Resizable', 'Utilities'];

    for (const group of groups) {
      it(`group "${group}" does not produce a subpath import`, () => {
        // Groups should either fail to find a source file (returning bare @astryxdesign/core)
        // or correctly return the group-level export if one exists
        const importPath = resolveImportPath(coreDir, group);
        if (importPath !== '@astryxdesign/core') {
          // If it does resolve, it must be a valid export
          const subpath = importPath.replace('@astryxdesign/core/', '');
          expect(validExports.has(subpath)).toBe(true);
        }
      });
    }
  });

  describe('import path matches actual source file location', () => {
    for (const name of individualComponents) {
      it(`${name} import path leads to its source directory`, () => {
        const source = findComponentSource(coreDir, name);
        if (!source) return; // some sub-components don't have direct source

        const importPath = resolveImportPath(coreDir, name);
        if (importPath === '@astryxdesign/core') return;

        const subpath = importPath.replace('@astryxdesign/core/', '');
        const srcDir = path.join(coreDir, 'src');
        const relToSrc = path.relative(srcDir, source);
        const topDir = relToSrc.split(path.sep)[0];

        // The import subpath should match the top-level src directory
        // (case-insensitive check since theme/Theme is valid)
        expect(subpath.toLowerCase()).toBe(topDir.toLowerCase());
      });
    }
  });

  describe('CLI --detail brief text output for a single component', () => {
    it('brief text output names the component and its package', async () => {
      const result = await runCli(['component', 'Button', '--detail', 'brief'], REPO_ROOT);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Button');
      expect(result.stdout).toContain('@astryxdesign/core');
    });

    it('brief text is shorter than compact text', async () => {
      const brief = await runCli(['component', 'Button', '--detail', 'brief'], REPO_ROOT);
      const compact = await runCli(['component', 'Button', '--detail', 'compact'], REPO_ROOT);
      expect(brief.code).toBe(0);
      expect(compact.code).toBe(0);
      expect(brief.stdout.length).toBeLessThan(compact.stdout.length);
    });

    it('brief text shows the import path in the signature line', async () => {
      const result = await runCli(['component', 'Button', '--detail', 'brief'], REPO_ROOT);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('@astryxdesign/core/Button');
    });
  });
});
