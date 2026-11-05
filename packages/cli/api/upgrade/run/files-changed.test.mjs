// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The upgrade receipt counts a file once when a core codemod AND an
 * integration codemod both change it: `filesChanged` is the union of the two
 * runners' files, while `transformsApplied` adds their changes.
 *
 * Uses a real consumer under a repo-local temp dir (Vite blocks dynamic import
 * of config and integration modules from /tmp), the real core registry, and an
 * installed integration whose code codemod stamps the same file.
 */

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {upgrade} from '../upgrade.mjs';
import {
  latestVersion,
  versions,
  getTransformsBetween,
} from '../../../assets/codemods/registry.mjs';

const SLOW = 60_000;

/** The registry version whose manifest ships the authoring migration. */
async function authoringTier() {
  const all = await getTransformsBetween('0.0.0', latestVersion);
  const tier = all.find(({transforms}) =>
    transforms.some(t => t.name === 'migrate-authoring-imports'),
  );
  if (!tier) throw new Error('no registry version ships the authoring migration');
  return tier.version;
}

/**
 * A consumer with installed core at the registry's latest version and one
 * old-surface file that the core authoring codemods rewrite.
 * @param {string} dir
 * @param {{integrationCodemod: boolean}} options
 */
function seed(dir, {integrationCodemod}) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0'}),
  );
  const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(core, {recursive: true});
  fs.writeFileSync(
    path.join(core, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core', version: latestVersion}),
  );
  fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'src', 'Button.doc.mjs'),
    [
      "import {createComponentDoc} from '@astryxdesign/core/authoring';",
      "export default createComponentDoc({name: 'Button', props: []});",
      '',
    ].join('\n'),
  );
  if (!integrationCodemod) return;
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/widgets']};\n",
  );
  const pkg = path.join(dir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(path.join(pkg, 'codemods', latestVersion), {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkg, 'astryx.integration.mjs'),
    "export default {codemods: './codemods'};\n",
  );
  fs.writeFileSync(
    path.join(pkg, 'codemods', latestVersion, 'acme-stamp.mjs'),
    "export default {type: 'code', title: 'Stamp', transform: file => (file.source.includes('// acme') ? null : `${file.source}// acme\\n`)};\n",
  );
}

describe('upgrade receipt — filesChanged across core and integration codemods', () => {
  /** @type {string[]} */
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true});
  });

  /** @param {{integrationCodemod: boolean}} options */
  async function run(options) {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-files-changed-'));
    dirs.push(dir);
    seed(dir, options);
    const tier = await authoringTier();
    const from = versions[versions.indexOf(tier) - 1];
    const res = await upgrade({from, path: 'src'}, {cwd: dir});
    expect(res.type).toBe('upgrade.run');
    return res.data;
  }

  it('counts a file changed by both a core and an integration codemod once', async () => {
    const coreOnly = await run({integrationCodemod: false});
    expect(coreOnly.filesChanged).toBe(1);
    expect(coreOnly.transformsApplied).toBeGreaterThan(0);

    const both = await run({integrationCodemod: true});
    expect(both.integrations).toEqual(['@acme/widgets']);
    expect(both.filesChanged).toBe(1);
    expect(both.transformsApplied).toBe(coreOnly.transformsApplied + 1);
  }, SLOW);
});
