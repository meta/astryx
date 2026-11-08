// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {integrationAdd, integrationAddComponent} from './add-contribution.mjs';
import {discoverIntegrationComponents} from '../../foundation/discovery/component-discovery.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-add-component-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify({name: '@acme/widgets', version: '1.0.0', files: ['dist']}, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    "export default {\n  components: './components',\n};\n",
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {string} relativeDoc */
function writeAuthoredComponent(relativeDoc) {
  const doc = path.join(tmpDir, relativeDoc);
  fs.mkdirSync(path.dirname(doc), {recursive: true});
  fs.writeFileSync(
    doc,
    "export default {\n  type: 'component',\n  name: 'AcmeWidget',\n  description: 'The authored AcmeWidget.',\n  props: [],\n};\n",
  );
  fs.writeFileSync(
    doc.replace(/\.doc\.(?:ts|mjs|js)$/u, '.tsx'),
    'export function AcmeWidget() {\n  return <div>Authored</div>;\n}\n',
  );
}

/** Every file under the package, with its bytes. */
function snapshot() {
  /** @type {Record<string, string>} */
  const files = {};
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[path.relative(tmpDir, full)] = fs.readFileSync(full, 'utf-8');
    }
  };
  walk(tmpDir);
  return files;
}

describe('integrationAddComponent name collisions', () => {
  it('refuses a name a nested component doc already defines', async () => {
    writeAuthoredComponent('components/AcmeWidget/AcmeWidget.doc.mjs');
    const before = snapshot();

    await expect(
      integrationAddComponent('AcmeWidget', {cwd: tmpDir}),
    ).rejects.toMatchObject({
      code: 'ERR_FILE_EXISTS',
      message: expect.stringContaining(
        'components/AcmeWidget/AcmeWidget.doc.mjs',
      ),
    });
    expect(snapshot()).toEqual(before);
    expect(
      discoverIntegrationComponents({
        name: '@acme/widgets',
        components: path.join(tmpDir, 'components'),
      }).map(component => path.relative(tmpDir, component.docPath)),
    ).toEqual([path.join('components', 'AcmeWidget', 'AcmeWidget.doc.mjs')]);
  });

  it('refuses the same collision under --dry-run', async () => {
    writeAuthoredComponent('components/widgets/AcmeWidget.doc.mjs');

    await expect(
      integrationAdd('component', 'AcmeWidget', {cwd: tmpDir, dryRun: true}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
  });

  it('refuses a same-stem doc with another extension in the root', async () => {
    fs.mkdirSync(path.join(tmpDir, 'components'));
    fs.writeFileSync(
      path.join(tmpDir, 'components', 'AcmeWidget.doc.ts'),
      "export default {type: 'component', name: 'AcmeWidget', props: []};\n",
    );
    const before = snapshot();

    await expect(
      integrationAddComponent('AcmeWidget', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(snapshot()).toEqual(before);
  });

  it('adds a name a family doc lists but the module it imports does not export', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      `${JSON.stringify({name: '@acme/widgets', version: '1.0.0', files: ['dist'], exports: {'./tabs': './components/tabs/index.ts'}}, null, 2)}\n`,
    );
    const tabs = path.join(tmpDir, 'components', 'tabs');
    fs.mkdirSync(tabs, {recursive: true});
    fs.writeFileSync(
      path.join(tabs, 'AcmeTabs.doc.mjs'),
      "export default {type: 'component', name: 'AcmeTabs', import: '@acme/widgets/tabs', description: 'x', components: [{name: 'AcmeTabExtra', description: 'x'}]};\n",
    );
    fs.writeFileSync(
      path.join(tabs, 'AcmeTabs.tsx'),
      'export function AcmeTabs() { return null; }\nexport function AcmeTabExtra() { return null; }\n',
    );
    fs.writeFileSync(
      path.join(tabs, 'index.ts'),
      "export {AcmeTabs} from './AcmeTabs';\n",
    );

    const result = await integrationAdd('component', 'AcmeTabExtra', {
      cwd: tmpDir,
      dryRun: true,
    });
    expect(result.data.files).toContain('components/AcmeTabExtra.doc.mjs');
  });

  it('refuses a member a family exports through built output', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      `${JSON.stringify({name: '@acme/widgets', version: '1.0.0', files: ['dist'], exports: {'./tabs': './dist/tabs/index.js'}}, null, 2)}\n`,
    );
    const tabs = path.join(tmpDir, 'components', 'tabs');
    fs.mkdirSync(tabs, {recursive: true});
    fs.writeFileSync(
      path.join(tabs, 'AcmeTabs.doc.mjs'),
      "export default {type: 'component', name: 'AcmeTabs', import: '@acme/widgets/tabs', description: 'x', components: [{name: 'AcmeTab', description: 'x'}]};\n",
    );
    fs.writeFileSync(
      path.join(tabs, 'AcmeTabs.tsx'),
      'export function AcmeTabs() { return null; }\n',
    );
    fs.writeFileSync(
      path.join(tabs, 'AcmeTab.tsx'),
      'export function AcmeTab() { return null; }\n',
    );
    const dist = path.join(tmpDir, 'dist', 'tabs');
    fs.mkdirSync(dist, {recursive: true});
    fs.writeFileSync(
      path.join(dist, 'index.js'),
      "export {AcmeTabs} from './tabs.js';\nexport {AcmeTab} from './tab.js';\n",
    );
    fs.writeFileSync(
      path.join(dist, 'tabs.js'),
      'export function AcmeTabs() { return null; }\n',
    );
    fs.writeFileSync(
      path.join(dist, 'tab.js'),
      'export function AcmeTab() { return null; }\n',
    );

    await expect(
      integrationAdd('component', 'AcmeTab', {cwd: tmpDir, dryRun: true}),
    ).rejects.toThrow('Refusing to add component "AcmeTab"');
  });

  it('still adds a component whose name is free', async () => {
    writeAuthoredComponent('components/AcmeWidget/AcmeWidget.doc.mjs');

    const result = await integrationAddComponent('AcmeBadge', {cwd: tmpDir});

    expect(result.data.files).toEqual([
      'components/AcmeBadge.doc.mjs',
      'components/AcmeBadge.tsx',
      'package.json',
    ]);
    expect(
      discoverIntegrationComponents({
        name: '@acme/widgets',
        components: path.join(tmpDir, 'components'),
      })
        .map(component => component.name)
        .sort(),
    ).toEqual(['AcmeBadge', 'AcmeWidget']);
  });
});
