// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the CLI peer version warning.
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {cliPeerVersionProblem, cliVersion} from './cli-peer-version.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

/** @type {string} */
let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cli-peer-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * @param {string} name
 * @param {Record<string, unknown>} pkgJson
 */
function makeIntegration(name, pkgJson) {
  const dir = path.join(tmpDir, name.replace(/[/@]/g, '_'));
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkgJson));
  return {name, version: String(pkgJson.version ?? '1.0.0'), __packageDir: dir};
}

describe('cliPeerVersionProblem', () => {
  it('returns null when no @astryxdesign/cli peer is declared', () => {
    const integration = makeIntegration('@test/no-peer', {
      name: '@test/no-peer',
      version: '1.0.0',
    });
    expect(cliPeerVersionProblem(integration, '0.6.5', tmpDir)).toBeNull();
  });

  it('returns null when the CLI satisfies the peer range', () => {
    const integration = makeIntegration('@test/satisfied', {
      name: '@test/satisfied',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '>=0.6.0'},
    });
    expect(cliPeerVersionProblem(integration, '0.6.5', tmpDir)).toBeNull();
  });

  it('warns when the CLI is below the peer range', () => {
    const integration = makeIntegration('@test/needs-newer', {
      name: '@test/needs-newer',
      version: '2.0.0',
      peerDependencies: {'@astryxdesign/cli': '>=0.8.0'},
    });
    const project = path.join(tmpDir, 'npm-project');
    fs.mkdirSync(project, {recursive: true});
    fs.writeFileSync(path.join(project, 'package-lock.json'), '{}\n');
    expect(cliPeerVersionProblem(integration, '0.6.5', project)).toBe(
      '@test/needs-newer needs @astryxdesign/cli >=0.8.0, but this CLI is 0.6.5, so some of what it ships may not load. Upgrade Core and the CLI together: `npm install @astryxdesign/core@latest @astryxdesign/cli@latest`, then `npx astryx upgrade --from 0.6.5 --apply`.',
    );
  });

  it("names the project's own package manager in the upgrade command", () => {
    const project = path.join(tmpDir, 'pnpm-project');
    fs.mkdirSync(project, {recursive: true});
    fs.writeFileSync(path.join(project, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
    const integration = makeIntegration('@test/pnpm', {
      name: '@test/pnpm',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '>=0.8.0'},
    });
    expect(cliPeerVersionProblem(integration, '0.6.5', project)).toContain(
      '`pnpm add @astryxdesign/core@latest @astryxdesign/cli@latest`, then `pnpm exec astryx upgrade --from 0.6.5 --apply`',
    );
  });

  it('starts the upgrade from the version it is given, such as a Core-only project\'s Core', () => {
    const project = path.join(tmpDir, 'from-npm-project');
    fs.mkdirSync(project, {recursive: true});
    fs.writeFileSync(path.join(project, 'package-lock.json'), '{}\n');
    const integration = makeIntegration('@test/from', {
      name: '@test/from',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '>=0.8.0'},
    });
    expect(
      cliPeerVersionProblem(integration, '0.7.3', project, {from: '0.6.0'}),
    ).toContain('upgrade --from 0.6.0 --apply');
  });

  it('installs them as dev dependencies in the package being authored', () => {
    const project = path.join(tmpDir, 'own-npm-project');
    fs.mkdirSync(project, {recursive: true});
    fs.writeFileSync(path.join(project, 'package-lock.json'), '{}\n');
    const integration = makeIntegration('@test/own-below', {
      name: '@test/own-below',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '>=0.8.0'},
    });
    expect(
      cliPeerVersionProblem(integration, '0.6.5', project, {own: true}),
    ).toContain(
      '`npm install -D @astryxdesign/core@latest @astryxdesign/cli@latest`, then `npx astryx upgrade --from 0.6.5 --apply`',
    );
  });

  it('does not ask for an upgrade when the CLI is newer than the range', () => {
    const integration = makeIntegration('@test/older', {
      name: '@test/older',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '^0.6.0'},
    });
    expect(cliPeerVersionProblem(integration, '0.7.3', tmpDir)).toBe(
      '@test/older supports @astryxdesign/cli ^0.6.0, but this CLI is 0.7.3, outside that range, so some of what it ships may not work as its author tested. Look for a release of @test/older that supports 0.7.3.',
    );
  });

  it('handles a caret range that excludes the running CLI', () => {
    const integration = makeIntegration('@test/caret', {
      name: '@test/caret',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '^1.0.0'},
    });
    expect(cliPeerVersionProblem(integration, '0.6.5', tmpDir)).toContain(
      '^1.0.0',
    );
  });

  it('returns null for a caret range the CLI satisfies', () => {
    const integration = makeIntegration('@test/caret-ok', {
      name: '@test/caret-ok',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '^0.6.0'},
    });
    expect(cliPeerVersionProblem(integration, '0.6.5', tmpDir)).toBeNull();
  });

  it('tells the author to test and widen the range when the package is their own', () => {
    const integration = makeIntegration('@test/own', {
      name: '@test/own',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '^0.6.0'},
    });
    expect(cliPeerVersionProblem(integration, '0.7.3', tmpDir, {own: true})).toBe(
      '@test/own declares @astryxdesign/cli ^0.6.0, but this CLI is 0.7.3, outside that range. Test the package with this CLI, and if it works, widen the @astryxdesign/cli range in its peerDependencies.',
    );
  });

  it('warns for an optional peer the CLI does not satisfy', () => {
    // Optional peers are still peers: the integration needs a newer CLI to
    // work fully. The warning is about the CLI version, not about whether
    // the peer is required for install.
    const integration = makeIntegration('@test/optional', {
      name: '@test/optional',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '>=0.9.0'},
      peerDependenciesMeta: {'@astryxdesign/cli': {optional: true}},
    });
    expect(cliPeerVersionProblem(integration, '0.6.5', tmpDir)).not.toBeNull();
  });

  it('handles a prerelease CLI version gracefully', () => {
    const integration = makeIntegration('@test/prerelease', {
      name: '@test/prerelease',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '>=0.7.0'},
    });
    // A canary like 0.7.0-canary.abc123 should satisfy >=0.7.0
    expect(cliPeerVersionProblem(integration, '0.7.0-canary.abc123', tmpDir)).toBeNull();
    // A canary below the floor should warn
    expect(
      cliPeerVersionProblem(integration, '0.6.5-canary.xyz', tmpDir),
    ).not.toBeNull();
  });

  it('returns null when __packageDir is missing', () => {
    const integration = {name: '@test/no-dir', version: '1.0.0'};
    expect(cliPeerVersionProblem(integration, '0.6.5', tmpDir)).toBeNull();
  });

  it('returns null when package.json cannot be read', () => {
    const integration = {
      name: '@test/bad-dir',
      version: '1.0.0',
      __packageDir: path.join(tmpDir, 'nonexistent'),
    };
    expect(cliPeerVersionProblem(integration, '0.6.5', tmpDir)).toBeNull();
  });
});

describe('cliVersion', () => {
  it('returns a valid semver string', () => {
    const ver = cliVersion();
    expect(ver).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('as a note that fails nothing', () => {
  /**
   * An integration package at `dir` whose CLI peer range is `range`.
   * @param {string} dir
   * @param {string} range
   */
  function writeIntegration(dir, range) {
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: '@acme/widgets',
        version: '1.0.0',
        peerDependencies: {'@astryxdesign/cli': range},
      }),
    );
    fs.writeFileSync(path.join(dir, 'astryx.integration.mjs'), 'export default {};\n');
  }

  /**
   * A project with a lockfile that installs @acme/widgets.
   * @param {string} range
   */
  function project(range) {
    const root = fs.mkdtempSync(path.join(tmpDir, 'project-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: {'@acme/widgets': '^1.0.0'},
      }),
    );
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
    writeIntegration(path.join(root, 'node_modules', '@acme', 'widgets'), range);
    return root;
  }

  /** @param {string} [dev] */
  const below = (dev = '') =>
    `@acme/widgets needs @astryxdesign/cli >=99.0.0, but this CLI is ${cliVersion()}, so some of what it ships may not load. Upgrade Core and the CLI together: \`npm install${dev} @astryxdesign/core@latest @astryxdesign/cli@latest\`, then \`npx astryx upgrade --from ${cliVersion()} --apply\`.`;

  it('doctor integration validate lists it in data.notes, never in data.issues, and exits 0', async () => {
    const cwd = project('>=99.0.0');
    const {status, stdout} = await runCli(
      ['doctor', 'integration', 'validate', '@acme/widgets', '--json'],
      {cwd},
    );
    const {data} = JSON.parse(stdout);
    expect(status).toBe(0);
    expect(data.notes).toContainEqual({code: 'cli_peer_version', message: below()});
    expect(data.issues.map((/** @type {{code: string}} */ i) => i.code)).not.toContain(
      'cli_peer_version',
    );
  });

  it('integration check --strict carries the note and still exits 0', async () => {
    const pkg = fs.mkdtempSync(path.join(tmpDir, 'package-'));
    writeIntegration(pkg, '>=99.0.0');
    fs.writeFileSync(path.join(pkg, 'package-lock.json'), '{}\n');
    const {status, stdout} = await runCli(
      ['--json', 'integration', 'check', '--strict'],
      {cwd: pkg},
    );
    const envelope = JSON.parse(stdout);
    const validate = envelope.data.checks[0].response.data;
    expect(validate.notes).toContainEqual({
      code: 'cli_peer_version',
      message: below(' -D'),
    });
    expect(validate.issues.map((/** @type {{code: string}} */ i) => i.code)).not.toContain(
      'cli_peer_version',
    );
    expect(envelope.data.failed).toBe(false);
    expect(status).toBe(0);
  });

  it('starts the upgrade from the Core of a project with no CLI of its own', async () => {
    const cwd = project('>=99.0.0');
    const pkgJson = path.join(cwd, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
    pkg.dependencies['@astryxdesign/core'] = '0.6.0';
    fs.writeFileSync(pkgJson, JSON.stringify(pkg));
    const core = path.join(cwd, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(
      path.join(core, 'package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: '0.6.0'}),
    );
    const {status, stdout} = await runCli(
      ['doctor', 'integration', 'validate', '@acme/widgets', '--json'],
      {cwd},
    );
    expect(status).toBe(0);
    const note = JSON.parse(stdout).data.notes.find(
      (/** @type {{code: string}} */ n) => n.code === 'cli_peer_version',
    );
    expect(note.message).toContain('upgrade --from 0.6.0 --apply');
    expect(note.message).not.toContain(`--from ${cliVersion()}`);
  });

  it('asks for a release of an installed package that supports a CLI above its range', async () => {
    const cwd = project('^0.6.0');
    const {stdout} = await runCli(
      ['doctor', 'integration', 'validate', '@acme/widgets', '--json'],
      {cwd},
    );
    expect(JSON.parse(stdout).data.notes).toContainEqual({
      code: 'cli_peer_version',
      message: `@acme/widgets supports @astryxdesign/cli ^0.6.0, but this CLI is ${cliVersion()}, outside that range, so some of what it ships may not work as its author tested. Look for a release of @acme/widgets that supports ${cliVersion()}.`,
    });
  });

  it('tells the author of the package in the current folder to test and widen a range below this CLI', async () => {
    const pkg = fs.mkdtempSync(path.join(tmpDir, 'package-'));
    writeIntegration(pkg, '^0.6.0');
    const {status, stdout} = await runCli(
      ['--json', 'integration', 'check', '--strict'],
      {cwd: pkg},
    );
    const envelope = JSON.parse(stdout);
    expect(envelope.data.checks[0].response.data.notes).toContainEqual({
      code: 'cli_peer_version',
      message: `@acme/widgets declares @astryxdesign/cli ^0.6.0, but this CLI is ${cliVersion()}, outside that range. Test the package with this CLI, and if it works, widen the @astryxdesign/cli range in its peerDependencies.`,
    });
    expect(envelope.data.failed).toBe(false);
    expect(status).toBe(0);
  });

  it('leaves integration verify as it was: no warning, no issue', async () => {
    const pkg = fs.mkdtempSync(path.join(tmpDir, 'package-'));
    writeIntegration(pkg, '>=99.0.0');
    const {stdout} = await runCli(['--json', 'integration', 'verify'], {
      cwd: pkg,
    });
    expect(stdout).not.toContain('cli_peer_version');
    const text = await runCli(['integration', 'verify'], {cwd: pkg});
    expect(text.stdout + text.stderr).not.toContain('needs @astryxdesign/cli');
  }, 120_000);

  it('says nothing when the CLI is in the range', async () => {
    const cwd = project(`>=${cliVersion()}`);
    const {stdout} = await runCli(
      ['doctor', 'integration', 'validate', '@acme/widgets', '--json'],
      {cwd},
    );
    const {data} = JSON.parse(stdout);
    expect(
      (data.notes ?? []).map((/** @type {{code: string}} */ n) => n.code),
    ).not.toContain('cli_peer_version');
  });
});
