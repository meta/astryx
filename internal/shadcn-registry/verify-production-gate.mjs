#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file verify-production-gate.mjs
 * @description Proves the production target emits an unlinked ShadCN registry
 *   with exact released dependencies, replacing stale output deterministically.
 * @input The target-aware registry generator used by generate-data.mjs.
 * @output A network-free assertion for the hidden production registry contract.
 * @position Required CI guard for the staged compatibility soak.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {generateShadcnRegistryForTarget} from '../../apps/docsite/scripts/generate-shadcn-registry.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-shadcn-gate-'));
const outDir = path.join(root, 'shadcn');

try {
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(path.join(outDir, 'stale.json'), '{}\n');

  const result = generateShadcnRegistryForTarget({
    target: 'latest',
    outDir,
    packages: [
      {name: '@astryxdesign/cli', version: '0.6.0'},
      {name: '@astryxdesign/core', version: '0.5.2'},
    ],
    allComponents: {
      '@astryxdesign/core': [
        {
          name: 'Button',
          displayName: 'Button',
          description: 'Runs an action.',
          importPath: '@astryxdesign/core/Button',
          hidden: false,
          params: null,
        },
      ],
    },
    blocks: [],
    templates: [],
    externalDependencySpecs: {
      '@stylexjs/stylex': '@stylexjs/stylex@0.19.0',
    },
  });

  assert.equal(result.total, 1);
  assert.equal(fs.existsSync(path.join(outDir, 'stale.json')), false);
  assert.equal(fs.existsSync(path.join(outDir, 'registry.json')), true);
  const item = JSON.parse(
    fs.readFileSync(path.join(outDir, 'components', 'button.json'), 'utf8'),
  );
  assert.deepEqual(item.dependencies, [
    '@astryxdesign/core@0.5.2',
    '@stylexjs/stylex@0.19.0',
  ]);
  assert.equal(
    item.dependencies.some(dependency => dependency.includes('@canary')),
    false,
  );
  console.log(
    'Verified production emits hidden ShadCN routes with exact release dependencies.',
  );
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
