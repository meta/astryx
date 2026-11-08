// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx upgrade` documents how its flags interact and when it exits 1,
 * and behaves as documented. Option text is read from the generated manifest
 * (the same strings `--help` prints); exit codes from the CommandDoc.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {doc as upgradeDoc} from './upgrade.doc.mjs';

const SLOW = 30_000;

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-upgrade-flags-'));
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({name: 'consumer'}));
  fs.mkdirSync(path.join(tmpDir, 'src'));
  fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'const foo = 1;\n');
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {string} name @param {string} version */
function installPackage(name, version) {
  const dir = path.join(tmpDir, 'node_modules', ...name.split('/'));
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name, version}));
}

/** @param {string} rel @param {string} body */
function write(rel, body) {
  fs.mkdirSync(path.dirname(path.join(tmpDir, rel)), {recursive: true});
  fs.writeFileSync(path.join(tmpDir, rel), body);
}

/**
 * upgrade's option descriptions from the manifest, keyed by long flag.
 * @returns {Promise<Record<string, string>>}
 */
async function upgradeOptions() {
  const {stdout} = await runCli(['--json', 'manifest'], tmpDir);
  const upgrade = JSON.parse(stdout).data.commands.find(
    (/** @type {{name: string}} */ c) => c.name === 'upgrade',
  );
  return Object.fromEntries(
    upgrade.options.map((/** @type {{flag: string, description: string}} */ o) => [
      o.flag.match(/--[a-z-]+/)?.[0],
      o.description,
    ]),
  );
}

/** @param {string[]} args */
async function upgradeJson(args) {
  const result = await runCli(['--json', 'upgrade', ...args], tmpDir);
  return {status: result.status, envelope: JSON.parse(result.stdout)};
}

const exit1 = () => upgradeDoc.exitCodes?.find(e => e.code === 1)?.when ?? '';

const MIGRATION_FLAGS = [
  ['--from', '0.5.0'],
  ['--force'],
  ['--codemod', 'x'],
  ['--skip-codemod', 'x'],
  ['--integration', 'x'],
  ['--install-deps'],
];

describe('astryx upgrade flag interactions', () => {
  it('--list: help says it ignores every other flag but --registry, and it does', async () => {
    const options = await upgradeOptions();
    expect(options['--list']).toMatch(/Every other flag is refused, as is --registry/);

    installPackage('@astryxdesign/core', '0.6.0');

    const listed = await upgradeJson(['--list']);
    expect(listed.status).toBe(0);
    expect(listed.envelope.type).toBe('upgrade.list');

    const withFlags = await upgradeJson(['--list', '--from', 'bogus']);
    expect(withFlags.status).toBe(1);
    expect(withFlags.envelope.code).toBe('ERR_INVALID_ARGUMENT');

    const refused = await upgradeJson(['--list', '--registry']);
    expect(refused.status).toBe(1);
    expect(refused.envelope.code).toBe('ERR_INVALID_ARGUMENT');
  }, SLOW);

  it('--registry: help names every flag it refuses, and each exits 1', async () => {
    const options = await upgradeOptions();
    for (const [flag] of MIGRATION_FLAGS) expect(options['--registry']).toContain(flag);
    expect(options['--registry']).toContain('--list');
    expect(options['--registry']).toContain('ERR_INVALID_ARGUMENT');

    for (const flag of MIGRATION_FLAGS) {
      const {status, envelope} = await upgradeJson(['--registry', ...flag]);
      expect(status, flag[0]).toBe(1);
      expect(envelope.code, flag[0]).toBe('ERR_INVALID_ARGUMENT');
    }
  }, SLOW);

  it('--codemod: help says it runs optional codemods and skips the composition check, and it does', async () => {
    const options = await upgradeOptions();
    expect(options['--codemod']).toMatch(/Optional codemods run only when named here/);
    expect(options['--codemod']).toMatch(/skips the check of ShadCN-copied compositions/);

    installPackage('@astryxdesign/core', '0.0.15');
    // An unreadable receipt leaves a registry item unresolved.
    write('src/components/.astryx/broken.json', '{}');

    const normal = await upgradeJson(['--from', '0.0.14']);
    expect(normal.status).toBe(1);
    expect(normal.envelope.data.registryCompositions.invalid).toBe(1);

    // 0.0.15 ships one optional codemod, which only runs when named.
    const named = await upgradeJson(['--from', '0.0.14', '--codemod', 'migrate-theme-selectors-to-data-attrs']);
    expect(named.status).toBe(0);
    expect(named.envelope.data.codemods).toBe(1);
    expect(named.envelope.data.registryCompositions).toBeUndefined();
    expect(normal.envelope.data.codemods).toBe(6);
  }, SLOW);

  it('--from: help names the legacy @xds/core target, which upgrade falls back to', async () => {
    const options = await upgradeOptions();
    expect(options['--from']).toMatch(/legacy @xds\/core/);

    installPackage('@xds/core', '0.0.20');
    const {status, envelope} = await upgradeJson(['--from', '0.0.19']);
    expect(status).toBe(0);
    expect(envelope.data.to).toBe('0.0.20');
  }, SLOW);
});

describe('astryx upgrade exit codes', () => {
  it('lists a missing core, which exits 1 in both modes', async () => {
    expect(exit1()).toMatch(/no installed @astryxdesign\/core/);
    const text = await runCli(['upgrade', '--from', '0.5.0'], tmpDir);
    const json = await upgradeJson(['--from', '0.5.0']);
    expect(text.status).toBe(1);
    expect(json.status).toBe(1);
    expect(json.envelope.code).toBe('ERR_VERSION_DETECT');
  }, SLOW);

  it('lists an astryx.config no codemod repairs, which exits 1', async () => {
    expect(exit1()).toMatch(/astryx\.config that fails validation/);
    installPackage('@astryxdesign/core', '0.6.0');
    write('astryx.config.mjs', "export default {theme: 'neutral'};\n");
    const {status, envelope} = await upgradeJson(['--from', '0.5.0']);
    expect(status).toBe(1);
    expect(envelope.code).toBe('ERR_INVALID_ARGUMENT');
  }, SLOW);

  it('lists a post-codemod hook failure, which exits 1', async () => {
    expect(exit1()).toMatch(/post-codemod hook failure/);
    installPackage('@astryxdesign/core', '0.6.0');
    write(
      'src/panel.tsx',
      "import {useResizable} from '@astryxdesign/core';\nexport const r = () => useResizable({minSizePx: 200});\n",
    );
    write(
      'astryx.config.mjs',
      "export default {hooks: {postCodemod: [{buildCommand: () => { throw new Error('formatter crashed'); }}]}};\n",
    );
    const {status, envelope} = await upgradeJson(['--from', '0.5.0']);
    expect(status).toBe(1);
    expect(envelope.code).toBe('ERR_CODEMOD_FAILED');
    expect(envelope.error).toMatch(/Post-codemod hook failed/);
    // Additive: the receipt names what the run had already changed.
    expect(envelope).toMatchObject({
      receipt: {
        complete: false,
        errorCode: 'ERR_CODEMOD_FAILED',
        modifiedFiles: ['src/panel.tsx'],
        errors: [
          expect.objectContaining({
            codemod: 'post-codemod-hook',
            error: expect.stringMatching(/Post-codemod hook failed/),
          }),
        ],
      },
    });
  }, SLOW);

  it('reports what core codemods wrote when astryx.config then fails validation', async () => {
    installPackage('@astryxdesign/core', '0.6.0');
    write(
      'src/panel.tsx',
      "import {useResizable} from '@astryxdesign/core';\nexport const r = () => useResizable({minSizePx: 200});\n",
    );
    write('astryx.config.mjs', "export default {theme: 'neutral'};\n");
    const {status, envelope} = await upgradeJson(['--from', '0.5.0', '--apply']);
    expect(status).toBe(1);
    expect(envelope).toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      receipt: {
        complete: false,
        errorCode: 'ERR_INVALID_ARGUMENT',
        modifiedFiles: ['src/panel.tsx'],
        errors: [expect.objectContaining({codemod: 'config'})],
      },
    });
    expect(fs.readFileSync(path.join(tmpDir, 'src/panel.tsx'), 'utf8')).toContain(
      'minSize: 200',
    );
  }, SLOW);

  it('lists a missing jscodeshift and the refused flag combinations', () => {
    expect(exit1()).toMatch(/jscodeshift missing and not installed/);
    expect(exit1()).toMatch(/--registry with --list or a migration flag/);
  });
});
