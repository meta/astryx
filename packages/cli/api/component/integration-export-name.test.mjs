// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every surface knows an integration component, or a family member, by
 * the name its doc documents. Fixtures live under a repo-local temp dir: Vite
 * refuses to import a module from outside the project root.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {component} from './component.mjs';
import {search} from '../search/search.mjs';
import {validateIntegration} from '../integration/validate-integration.mjs';
import {integrationComponentConflicts} from '../integration/authoring-checks.mjs';
import {swizzleCopy} from '../swizzle/copy/copy.mjs';
import {gapReport} from '../gap-report/gap-report.mjs';
import {Project} from '../../foundation/config/project.mjs';
import {collectDocInputs} from '../../foundation/doc-compiler/inputs.mjs';
import {COMPONENT_REPLACES_CLI} from '../../foundation/integrations/cli-requirement.mjs';
import {scopeIntegrationMember} from './_adapter.mjs';

const SLOW = 30_000;

/** @type {string} */
let tmpDir;
/** @type {string} */
let pkgDir;

/**
 * @param {string} file path under the package's src/, without extension
 * @param {string} name
 * @param {string} source
 * @param {string} description
 * @param {object} [extra] more doc fields
 */
function writeComponent(file, name, source, description, extra = {}) {
  const target = path.join(pkgDir, 'src', file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(`${target}.tsx`, source);
  fs.writeFileSync(
    `${target}.doc.mjs`,
    `export default ${JSON.stringify(
      {
        type: 'component',
        name,
        displayName: name,
        import: `@acme/widgets/${file}`,
        usage: {description},
        props: [],
        ...extra,
      },
      null,
      2,
    )};\n`,
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-export-name-test-'),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/widgets']};\n",
  );
  pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name: '@acme/widgets',
      version: '1.0.0',
      exports: {
        './gallery/Slides': './src/gallery/Slides.tsx',
        './gallery/Overlays': './src/gallery/Overlays.tsx',
        './AcmeBadge': './src/AcmeBadge.tsx',
        './tabs': './src/tabs/AcmeTabs.tsx',
      },
    }),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './src', issuesUrl: 'https://example.com/acme/issues'};\n",
  );
  writeComponent(
    'gallery/Slides',
    'AcmeCarousel',
    'export function AcmeCarousel() { return null; }\nexport function useSlides() { return []; }\n',
    'Cycles through a row of slides.',
  );
  writeComponent(
    'AcmeBadge',
    'AcmeBadge',
    'export function AcmeBadge() { return null; }\n',
    'A small status label.',
  );
  // A family doc whose members the module it imports exports.
  fs.mkdirSync(path.join(pkgDir, 'src', 'tabs'), {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'src', 'tabs', 'AcmeTabs.tsx'),
    'export function AcmeTabs() { return null; }\nexport function AcmeTab() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'src', 'tabs', 'AcmeTabs.doc.mjs'),
    `export default ${JSON.stringify(
      {
        type: 'component',
        name: 'AcmeTabs',
        displayName: 'Acme Tabs',
        import: '@acme/widgets/tabs',
        keywords: ['tabs', 'navigation'],
        usage: {description: 'Switches between views.'},
        components: [
          {
            name: 'AcmeTabs',
            displayName: 'Acme Tabs',
            description: 'The tab list.',
            props: [],
          },
          {
            name: 'AcmeTab',
            displayName: 'Acme Tab',
            description: 'One labelled tab in the list.',
            props: [
              {name: 'label', type: 'string', description: 'The tab label.'},
            ],
          },
        ],
      },
      null,
      2,
    )};\n`,
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {any} list @returns {string[]} the integration's listed names */
function listedNames(list) {
  return Object.values(list.data.components)
    .flat()
    .filter(entry => entry.package === '@acme/widgets')
    .map(entry => entry.name)
    .sort();
}

describe('a component doc that names another export of its file', () => {
  it(
    "leaves a name a legacy docs package documents to that package's doc",
    async () => {
      const legacy = path.join(tmpDir, 'node_modules', '@legacy', 'docs');
      fs.mkdirSync(path.join(legacy, 'docs'), {recursive: true});
      fs.writeFileSync(
        path.join(legacy, 'package.json'),
        JSON.stringify({name: '@legacy/docs', astryx: {docs: './docs'}}),
      );
      for (const name of ['AcmeCarousel', 'Slides']) {
        fs.writeFileSync(
          path.join(legacy, 'docs', `${name}.doc.mjs`),
          `export default {type: 'component', name: '${name}', usage: {description: 'Legacy.'}, props: []};\n`,
        );
      }
      const cwd = tmpDir;
      expect((await component('AcmeCarousel', {cwd})).data.package).toBe(
        '@legacy/docs',
      );
      const scoped = {cwd, package: '@acme/widgets'};
      expect((await component('AcmeCarousel', scoped)).data.package).toBe(
        '@acme/widgets',
      );
      // Slides.doc.mjs's file name still answers first, as on main.
      expect((await component('Slides', {cwd})).data.package).toBe(
        '@acme/widgets',
      );
      const report = {cwd, category: 'other', reason: 'Needs a size.'};
      for (const name of ['AcmeCarousel', 'acmecarousel']) {
        expect((await gapReport(name, report)).data.package).toBe(
          '@astryxdesign/core',
        );
      }
      const hits = (await search('AcmeCarousel', {cwd, type: 'component'})).data
        .results;
      expect(hits.find(hit => hit.package === '@acme/widgets')?.command).toBe(
        'astryx component AcmeCarousel --package @acme/widgets',
      );
    },
    SLOW,
  );

  it(
    'is listed, opened and found by the export name',
    async () => {
      expect(
        listedNames(await component(undefined, {cwd: tmpDir, list: true})),
      ).toEqual(['AcmeBadge', 'AcmeCarousel', 'AcmeTab', 'AcmeTabs']);

      const detail = await component('AcmeCarousel', {cwd: tmpDir});
      expect(detail.type).toBe('component.detail');
      expect(detail.data).toMatchObject({
        name: 'AcmeCarousel',
        package: '@acme/widgets',
        import: '@acme/widgets/gallery/Slides',
        sourceAvailable: true,
      });

      const hits = (
        await search('AcmeCarousel', {cwd: tmpDir, type: 'component'})
      ).data.results;
      expect(hits[0]).toMatchObject({
        name: 'AcmeCarousel',
        package: '@acme/widgets',
        import: '@acme/widgets/gallery/Slides',
      });

      // The file name opens the same doc, as it did before, routes a gap
      // report to the package, and search finds the component by it, a word
      // of it included.
      expect((await component('Slides', {cwd: tmpDir})).data.name).toBe(
        'AcmeCarousel',
      );
      const report = {cwd: tmpDir, category: 'other', reason: 'Needs a size.'};
      expect((await gapReport('Slides', report)).data.package).toBe(
        '@acme/widgets',
      );
      for (const query of ['Slides', 'slide']) {
        const byFileName = (
          await search(query, {cwd: tmpDir, type: 'component'})
        ).data.results;
        expect(byFileName[0]?.name).toBe('AcmeCarousel');
      }
    },
    SLOW,
  );

  it.each(['the export its doc names', 'a member its family doc lists'])(
    "leaves a Core name to Core unless --package names it, when it is %s, and passes Doctor's package checks",
    async kind => {
      // Overlays.tsx exports Dialog, a Core name, and nothing named Overlays.
      const members = [{name: 'Dialog', description: 'A dialog.', props: []}];
      const member = kind === 'a member its family doc lists';
      writeComponent(
        'gallery/Overlays',
        member ? 'AcmeOverlays' : 'Dialog',
        'export function AcmeOverlays() { return null; }\nexport function Dialog() { return null; }\n',
        'Overlays.',
        member ? {components: members} : {},
      );

      const validation = await validateIntegration(undefined, {cwd: pkgDir});
      expect(validation.data.issues).toEqual([]);

      const conflicts = await integrationComponentConflicts(undefined, {
        cwd: pkgDir,
      });
      expect(conflicts.data.conflicts.map(conflict => conflict.name)).toEqual([
        'Dialog',
      ]);

      // Lookups by the bare name still answer with Core's Dialog, as before.
      const cwd = tmpDir;
      const core = '@astryxdesign/core';
      expect((await component('Dialog', {cwd})).data.package).toBe(core);
      expect((await component('Dialog', {cwd, props: true})).package).toBe(
        core,
      );
      expect((await swizzleCopy('Dialog', {cwd})).package).toBe(core);
      const report = {cwd, category: 'other', reason: 'Needs a size.'};
      expect((await gapReport('Dialog', report)).data.package).toBe(core);
      // The list and --package reach the integration's Dialog.
      const scoped = {cwd, package: '@acme/widgets'};
      expect((await component('Dialog', scoped)).data.import).toBe(
        '@acme/widgets/gallery/Overlays',
      );
      expect(
        listedNames(await component(undefined, {cwd, list: true})),
      ).toContain('Dialog');
      // Search shows both; the package's hit names its package and follows
      // Core's.
      const hits = (await search('Dialog', {cwd, type: 'component'})).data
        .results;
      const ours = hits.findIndex(hit => hit.package === '@acme/widgets');
      expect(hits[0]).toMatchObject({name: 'Dialog', package: core});
      expect(hits[ours]).toMatchObject({
        name: 'Dialog',
        command: 'astryx component Dialog --package @acme/widgets',
      });
    },
    SLOW,
  );

  it(
    'leaves a Core name with no folder of its own unknown to swizzle, as before',
    async () => {
      // Core documents CheckboxIndicator inside Indicator's doc, with no folder.
      // BaseTable, named after its file, keeps routing reports to its package.
      writeComponent(
        'BaseTable',
        'BaseTable',
        'export function BaseTable() { return null; }\n',
        'A file-named table.',
      );
      writeComponent(
        'gallery/Indicator',
        'CheckboxIndicator',
        'export function CheckboxIndicator() { return null; }\n',
        'A header.',
      );
      const cwd = tmpDir;
      expect((await component('CheckboxIndicator', {cwd})).data.package).toBe(
        '@astryxdesign/core',
      );
      await expect(
        swizzleCopy('CheckboxIndicator', {cwd}),
      ).rejects.toMatchObject({
        code: 'ERR_UNKNOWN_COMPONENT',
      });
      const scoped = {cwd, package: '@acme/widgets'};
      expect((await swizzleCopy('CheckboxIndicator', scoped)).package).toBe(
        '@acme/widgets',
      );
      const report = {cwd, category: 'other', reason: 'Needs a size.'};
      expect((await gapReport('CheckboxIndicator', report)).data.package).toBe(
        '@astryxdesign/core',
      );
      const hit = (
        await search('CheckboxIndicator', {cwd, type: 'component'})
      ).data.results.find(result => result.package === '@acme/widgets');
      expect(hit?.command).toBe(
        'astryx component CheckboxIndicator --package @acme/widgets',
      );
      expect((await gapReport('BaseTable', report)).data.package).toBe(
        '@acme/widgets',
      );
    },
    SLOW,
  );

  it.each([
    // props must be an array: the loader rejects this doc.
    [
      'invalid',
      "export default {type: 'component', name: 'AcmeTab', props: 'x'};",
    ],
    [
      'hidden',
      "export default {\n  type: 'component',\n  name: 'AcmeTab',\n  hidden: true,\n  usage: {description: 'x'},\n  props: [],\n};",
    ],
  ])(
    "leaves a name to another package's file-named doc even when that doc is %s",
    async (kind, doc) => {
      writeComponent(
        'gallery/Strip',
        'AcmeTab',
        'export function AcmeTab() { return null; }\n',
        'A strip of tabs.',
      );
      const beta = path.join(tmpDir, 'node_modules', '@beta', 'kit');
      fs.mkdirSync(path.join(beta, 'src'), {recursive: true});
      for (const [file, text] of Object.entries({
        'package.json': '{"name": "@beta/kit", "version": "1.0.0"}',
        'astryx.integration.mjs': "export default {components: './src'};",
        'src/AcmeTab.tsx': 'export function AcmeTab() { return null; }',
        'src/AcmeTab.doc.mjs': doc,
      })) {
        fs.writeFileSync(path.join(beta, file), `${text}\n`);
      }
      fs.writeFileSync(
        path.join(tmpDir, 'astryx.config.mjs'),
        "export default {integrations: ['@acme/widgets', '@beta/kit']};\n",
      );

      const cwd = tmpDir;
      expect((await component('AcmeTab', {cwd, source: true})).package).toBe(
        '@beta/kit',
      );
      if (kind === 'invalid') {
        await expect(component('AcmeTab', {cwd})).rejects.toMatchObject({
          code: 'ERR_INVALID_DOC',
        });
      }
      const report = {cwd, category: 'other', reason: 'Needs a size.'};
      for (const name of ['AcmeTab', 'acmetab']) {
        expect((await gapReport(name, report)).data.package).toBe(
          '@astryxdesign/core',
        );
      }
      const hit = (
        await search('AcmeTab', {cwd, type: 'component'})
      ).data.results.find(result => result.package === '@acme/widgets');
      expect(hit?.command).toBe(
        'astryx component AcmeTab --package @acme/widgets',
      );
    },
    SLOW,
  );

  it(
    'leaves a file name Core also has to Core in search, as in detail',
    async () => {
      // Badge.doc.mjs documents AcmeStatusBadge; its file name is Core's.
      writeComponent(
        'status/Badge',
        'AcmeStatusBadge',
        'export function AcmeStatusBadge() { return null; }\n',
        'Shows a status.',
      );
      const cwd = tmpDir;
      const [first] = (await search('Badge', {cwd, type: 'component'})).data
        .results;
      expect(first).toMatchObject({
        name: 'Badge',
        package: '@astryxdesign/core',
      });
      expect((await component('Badge', {cwd})).data.package).toBe(
        '@astryxdesign/core',
      );
      const [own] = (await search('AcmeStatusBadge', {cwd, type: 'component'}))
        .data.results;
      expect(own).toMatchObject({
        name: 'AcmeStatusBadge',
        command: 'astryx component AcmeStatusBadge',
      });
    },
    SLOW,
  );

  it(
    'copies a replacement recorded under its export into its file name folder, as before',
    async () => {
      const manifest = path.join(pkgDir, 'package.json');
      fs.writeFileSync(
        manifest,
        JSON.stringify({
          ...JSON.parse(fs.readFileSync(manifest, 'utf-8')),
          peerDependencies: {
            '@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`,
          },
        }),
      );
      writeComponent(
        'gallery/Slides',
        'AcmeCarousel',
        'export function AcmeCarousel() { return null; }\n',
        'Cycles through a row of slides.',
        {replaces: 'Carousel'},
      );

      const copied = await swizzleCopy('Carousel', {cwd: tmpDir});
      expect(copied.data).toMatchObject({
        package: '@acme/widgets',
        outputDir: path.join('components', 'astryx', 'Slides'),
      });
    },
    SLOW,
  );

  it(
    "opens a member named like its family doc's own name as that member",
    async () => {
      // Overlays.tsx exports Overlays, so the doc keeps its file name, and
      // AcmeChip, the doc's own name, is a member.
      const label = {name: 'label', type: 'string', description: 'The label.'};
      writeComponent(
        'gallery/Overlays',
        'AcmeChip',
        'export function Overlays() { return null; }\nexport function AcmeChip() { return null; }\nexport function AcmeChipIcon() { return null; }\n',
        'Chips.',
        {
          components: [
            {name: 'AcmeChip', description: 'One chip.', props: [label]},
            {name: 'AcmeChipIcon', description: 'An icon.', props: []},
          ],
        },
      );
      // Every member names the family by the name it opens under.
      expect(
        (await component('AcmeChipIcon', {cwd: tmpDir})).data.parentDoc,
      ).toBe('Overlays');
      const detail = await component('AcmeChip', {cwd: tmpDir});
      expect(detail.data).toMatchObject({
        name: 'AcmeChip',
        description: 'One chip.',
        parentDoc: 'Overlays',
      });
      const props = await component('AcmeChip', {cwd: tmpDir, props: true});
      expect(props.data.map(prop => prop.name)).toEqual(['label']);
    },
    SLOW,
  );

  it(
    'opens, lists and finds a family member as itself, with the import its family states',
    async () => {
      const list = await component(undefined, {cwd: tmpDir, list: true});
      const entry = Object.values(list.data.components)
        .flat()
        .find(item => item.name === 'AcmeTab');
      expect(entry).toEqual({
        name: 'AcmeTab',
        package: '@acme/widgets',
        import: '@acme/widgets/tabs',
      });

      const detail = await component('AcmeTab', {cwd: tmpDir});
      expect(detail.data).toMatchObject({
        name: 'AcmeTab',
        description: 'One labelled tab in the list.',
        parentDoc: 'AcmeTabs',
        package: '@acme/widgets',
        import: '@acme/widgets/tabs',
        sourceAvailable: true,
      });
      expect(detail.data.props.map(prop => prop.name)).toEqual(['label']);
      const props = await component('AcmeTab', {cwd: tmpDir, props: true});
      expect(props.data.map(prop => prop.name)).toEqual(['label']);
      // The family's own doc is unchanged.
      expect((await component('AcmeTabs', {cwd: tmpDir})).data).toMatchObject({
        name: 'AcmeTabs',
        import: '@acme/widgets/tabs',
      });

      const hits = (await search('AcmeTab', {cwd: tmpDir, type: 'component'}))
        .data.results;
      expect(hits[0]).toMatchObject({
        name: 'AcmeTab',
        description: 'One labelled tab in the list.',
        import: '@acme/widgets/tabs',
      });
      // The member does not carry the family's keywords.
      const tabs = (
        await search('navigation', {cwd: tmpDir, type: 'component'})
      ).data.results;
      expect(tabs.map(hit => hit.name)).toContain('AcmeTabs');
      expect(tabs.map(hit => hit.name)).not.toContain('AcmeTab');
    },
    SLOW,
  );

  it(
    'leaves a member named like a Core sub-component to Core, and swizzle unknown',
    async () => {
      const tabs = path.join(pkgDir, 'src', 'tabs');
      const doc = path.join(tabs, 'AcmeTabs.doc.mjs');
      fs.writeFileSync(
        doc,
        fs
          .readFileSync(doc, 'utf-8')
          .replace(
            '"components": [',
            '"components": [{"name": "DialogHeader", "description": "x"},',
          ),
      );
      fs.appendFileSync(
        path.join(tabs, 'AcmeTabs.tsx'),
        'export function DialogHeader() { return null; }\n',
      );
      const cwd = tmpDir;
      expect(
        listedNames(await component(undefined, {cwd, list: true})),
      ).toContain('DialogHeader');
      expect((await component('DialogHeader', {cwd})).data.package).toBe(
        '@astryxdesign/core',
      );
      await expect(swizzleCopy('DialogHeader', {cwd})).rejects.toMatchObject({
        code: 'ERR_UNKNOWN_COMPONENT',
      });
    },
    SLOW,
  );

  it('fails a member its family doc, as this process loaded it, does not list', async () => {
    const owner = {
      package: '@acme/widgets',
      docPath: path.join(pkgDir, 'src', 'tabs', 'AcmeTabs.doc.mjs'),
      sourcePath: null,
    };
    // The doc this process loaded before AcmeTab was added.
    const stale = {type: 'component', name: 'AcmeTabs', components: []};
    expect(() =>
      scopeIntegrationMember(/** @type {any} */ (stale), owner, 'AcmeTab', ''),
    ).toThrow(expect.objectContaining({code: 'ERR_UNKNOWN_COMPONENT'}));
  });

  it(
    'indexes a .doc.ts family member as a member when Node cannot load the doc',
    () => {
      const fam = path.join(pkgDir, 'src', 'fam');
      fs.mkdirSync(fam, {recursive: true});
      const manifest = path.join(pkgDir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf-8'));
      pkg.exports['./fam'] = './src/fam/AcmeFamTs.tsx';
      fs.writeFileSync(manifest, JSON.stringify(pkg));
      fs.writeFileSync(
        path.join(fam, 'AcmeFamTs.doc.ts'),
        "export default {type: 'component', name: 'AcmeFamTs', import: '@acme/widgets/fam', usage: {description: 'A family.'}, components: [{name: 'AcmeFamTs', description: 'x'}, {name: 'AcmeFamItem', description: 'One item.'}]};\n",
      );
      fs.writeFileSync(
        path.join(fam, 'AcmeFamTs.tsx'),
        'export function AcmeFamTs() { return null; }\nexport function AcmeFamItem() { return null; }\n',
      );
      // The real CLI under Node, which does not strip types in node_modules.
      const run = spawnSync(
        process.execPath,
        [
          path.join(process.cwd(), 'packages/cli/clients/cli/bin/astryx.mjs'),
          'search',
          'AcmeFamTs',
          '--json',
        ],
        {cwd: tmpDir, encoding: 'utf-8'},
      );
      const hits = JSON.parse(run.stdout).data.results.filter(
        (/** @type {any} */ hit) => hit.domain === 'component',
      );
      expect(hits.map((/** @type {any} */ hit) => hit.name)).toEqual([
        'AcmeFamTs',
      ]);
    },
    SLOW,
  );

  it(
    'reads a family doc once when the docs compile',
    async () => {
      const {inputs, problems} = await collectDocInputs(
        await Project.load(tmpDir),
      );
      expect(problems).toEqual([]);
      const tabsDoc = path.join(pkgDir, 'src', 'tabs', 'AcmeTabs.doc.mjs');
      expect(
        inputs.filter(input => input.file === tabsDoc).map(input => input.name),
      ).toEqual(['AcmeTabs']);
    },
    SLOW,
  );
});
