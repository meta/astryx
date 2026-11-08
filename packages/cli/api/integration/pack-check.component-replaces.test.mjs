// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The pack check on a component that sets `replaces` (spec:AST-035 FR15): a
 * package without the CLI floor gets one warning and stays packable, and
 * `integration verify` still exits 0; a package with the floor gets nothing.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {integrationPackCheck} from './pack-check.mjs';
import {COMPONENT_REPLACES_CLI} from '../../foundation/integrations/cli-requirement.mjs';

const SLOW = 120_000;

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-pack-check-component-replaces-'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {Record<string, string>} [peers] */
function writePackage(peers) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({
      name: '@acme/nav',
      version: '1.0.0',
      files: ['astryx.integration.mjs', 'components'],
      exports: {'./components/AcmeSideNav': './components/AcmeSideNav.tsx'},
      ...(peers ? {peerDependencies: peers} : {}),
    }),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    "export default {components: './components'};\n",
  );
  const components = path.join(tmpDir, 'components');
  fs.mkdirSync(components, {recursive: true});
  fs.writeFileSync(
    path.join(components, 'AcmeSideNav.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'component',
      name: 'AcmeSideNav',
      displayName: 'Acme Side Nav',
      replaces: 'SideNav',
      import: '@acme/nav/components/AcmeSideNav',
      usage: {description: 'Product navigation for Acme apps.'},
      props: [],
    })};\n`,
  );
  fs.writeFileSync(
    path.join(components, 'AcmeSideNav.tsx'),
    'export function AcmeSideNav() { return null; }\n',
  );
}

/** @param {{code: string}[]} issues */
const codesOf = issues => issues.map(issue => issue.code);

describe('integrationPackCheck with a component that sets replaces', () => {
  it(
    'warns, and stays packable, when the package has no CLI floor',
    async () => {
      writePackage();
      const result = await integrationPackCheck({cwd: tmpDir});
      const issue = result.data.issues.find(
        entry => entry.code === 'component_replaces_needs_cli',
      );
      expect(issue, JSON.stringify(result.data.issues, null, 2)).toMatchObject({
        severity: 'warning',
      });
      expect(issue?.message).toContain(`>=${COMPONENT_REPLACES_CLI}`);
      expect(result.data.packable, JSON.stringify(result.data.issues)).toBe(
        true,
      );
    },
    SLOW,
  );

  it(
    'says nothing when the package declares the floor',
    async () => {
      writePackage({'@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`});
      const result = await integrationPackCheck({cwd: tmpDir});
      expect(codesOf(result.data.issues)).not.toContain(
        'component_replaces_needs_cli',
      );
      expect(result.data.packable, JSON.stringify(result.data.issues)).toBe(
        true,
      );
    },
    SLOW,
  );

  it(
    'leaves integration verify at exit 0 without the floor',
    () => {
      writePackage();
      const run = spawnSync(
        process.execPath,
        [
          path.join(process.cwd(), 'packages/cli/clients/cli/bin/astryx.mjs'),
          'integration',
          'verify',
          '--json',
        ],
        {cwd: tmpDir, encoding: 'utf-8', timeout: SLOW},
      );
      expect(run.status, run.stderr).toBe(0);
      const receipt = JSON.parse(run.stdout);
      expect(codesOf(receipt.data.issues)).toContain(
        'component_replaces_needs_cli',
      );
    },
    SLOW,
  );
});
