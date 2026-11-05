// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A hosted run end to end, through `@astryxdesign/cli/host` in a host
 * process (architecture:cli-surface INV30, spec AST-081 FR1, FR2, FR9): a
 * release other than this copy comes from the first package set that
 * qualifies (another release's host entry runs in this process with the same
 * inputs, discover sources included, and the call settles with its result), a
 * hosted run installs nothing, a declined project CLI never runs, the host's
 * discover sources are called and named as the host's, and the result names
 * each package the run resolved and where it came from.
 */

import {describe, it, expect, afterEach} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  cleanupFixtures,
  installCore,
  installStandInCli,
  project,
  tempDir,
  writeJson,
} from '../../test-utils/release-fixtures.mjs';

const HOST = fileURLToPath(new URL('../../host/index.mjs', import.meta.url));
const SELF_VERSION = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL('../../package.json', import.meta.url)),
    'utf-8',
  ),
).version;

afterEach(cleanupFixtures);

/** JavaScript for a host's `discoverSources`: one source with one package. */
const ACME_SOURCE = `[async () => ({
  schemaVersion: 1,
  source: {name: 'Acme catalog', generatedAt: '2026-10-20T00:00:00.000Z', complete: true},
  packages: [{
    package: 'acme-widgets',
    integration: 'acme-widgets',
    aliases: [],
    latest: '1.0.0',
    versions: [{version: '1.0.0', publishedAt: null, prerelease: false, status: 'ok'}],
    contributions: [{kind: 'component', name: 'AcmeWidget'}],
  }],
})]`;

/**
 * Start a host process that calls `runHostedCli` once and writes what it
 * returned to a file.
 * @param {Record<string, unknown>} options JSON-safe options
 * @param {{sources?: string}} [extra] JavaScript for a `discoverSources` array
 */
function host(options, extra = {}) {
  const home = tempDir('home');
  const cache = tempDir('cache');
  const out = path.join(tempDir('out'), 'result.json');
  const script = `
const {runHostedCli} = await import(${JSON.stringify(HOST)});
const options = ${JSON.stringify(options)};
${extra.sources ? `options.discoverSources = ${extra.sources};` : ''}
const result = await runHostedCli(options);
(await import('node:fs')).writeFileSync(${JSON.stringify(out)}, JSON.stringify(result));
process.exitCode = result.status;
`;
  const run = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: tempDir('host-cwd'),
      encoding: 'utf-8',
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !/^(?:npm_|CI$|NO_UPDATE_NOTIFIER$)/iu.test(key),
          ),
        ),
        HOME: home,
        USERPROFILE: home,
        XDG_CACHE_HOME: cache,
        LOCALAPPDATA: cache,
        XDG_CONFIG_HOME: path.join(home, '.config'),
        APPDATA: path.join(home, 'AppData', 'Roaming'),
        NO_COLOR: '1',
        npm_config_registry: 'http://127.0.0.1:9',
      },
      timeout: 60_000,
    },
  );
  return {
    status: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    cache,
    /** @returns {any} what runHostedCli returned, when it returned */
    result: () =>
      fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf-8')) : null,
    /** @returns {any} the last stdout line, parsed */
    report: () => JSON.parse(run.stdout.trim().split('\n').pop() ?? 'null'),
  };
}

/**
 * A package set holding a stand-in CLI and a Core of `version`; with
 * `hostEntry`, the CLI ships a stand-in host entry that reports its options,
 * with the name of the catalog each discover source returns, and settles with
 * a record of its own.
 * @param {string} version
 * @param {{hostEntry?: boolean}} [options]
 */
function packageSet(version, options = {}) {
  const root = tempDir('set');
  const cli = installStandInCli(root, version, {bin: options.bin ?? true});
  installCore(root, version);
  if (options.hostEntry === 'broken') {
    // A host entry that loads but offers no runHostedCli.
    fs.mkdirSync(path.join(cli, 'host'), {recursive: true});
    fs.writeFileSync(path.join(cli, 'host', 'index.mjs'), 'export {};\n');
  } else if (options.hostEntry) {
    fs.mkdirSync(path.join(cli, 'host'), {recursive: true});
    fs.writeFileSync(
      path.join(cli, 'host', 'index.mjs'),
      `export async function runHostedCli({discoverSources = [], ...options}) {
  const catalogs = await Promise.all(discoverSources.map(source => source({})));
  console.log(JSON.stringify({
    hostEntry: ${JSON.stringify(version)},
    options,
    discoverSources: catalogs.map(catalog => catalog.source.name),
  }));
  return {
    status: 0,
    packages: [{name: '@astryxdesign/cli', version: ${JSON.stringify(version)}, source: 'package-set'}],
  };
}
`,
    );
  }
  return root;
}

/** Whether the run installed any release into the per-user cache. */
function installedARelease(cache) {
  return fs.existsSync(path.join(cache, 'astryx', 'releases'));
}

describe('a project whose own CLI cannot start, in a hosted run', () => {
  /** A project on Core 0.7.0 whose CLI 0.6.8 has no command. */
  function brokenProject() {
    const root = project(tempDir(), {'@astryxdesign/core': '0.7.0'});
    installCore(root, '0.7.0');
    installStandInCli(root, '0.6.8', {bin: false});
    return root;
  }

  it("is answered from the first package set whose CLI and Core match the project's Core", () => {
    const root = brokenProject();
    const run = host({
      argv: ['docs', '--json'],
      cwd: root,
      roots: [packageSet('0.6.8'), packageSet('0.7.0'), packageSet('0.7.0')],
    });
    expect(run.status).toBe(0);
    expect(run.report()).toMatchObject({
      version: '0.7.0',
      args: ['docs', '--json'],
    });
    expect(installedARelease(run.cache)).toBe(false);
  });

  it("runs a matching package set's own host entry with the same inputs, and settles with its result", () => {
    const root = brokenProject();
    const set = packageSet('0.7.0', {hostEntry: true});
    const run = host(
      {
        argv: ['component', 'Button'],
        cwd: root,
        roots: [set],
        cliCommand: 'acme astryx',
        integrations: ['acme-widgets'],
      },
      {sources: ACME_SOURCE},
    );
    expect(run.status).toBe(0);
    expect(run.report()).toEqual({
      hostEntry: '0.7.0',
      options: {
        argv: ['component', 'Button'],
        cwd: root,
        roots: [set],
        integrations: ['acme-widgets'],
        cliCommand: 'acme astryx',
      },
      discoverSources: ['Acme catalog'],
    });
    expect(run.result()).toEqual({
      status: 0,
      packages: [
        {name: '@astryxdesign/cli', version: '0.7.0', source: 'package-set'},
      ],
    });
  });

  it('installs nothing when no package set matches: this copy answers, announced', () => {
    const root = brokenProject();
    const roots = [packageSet('0.6.8')];
    const text = host({argv: ['--version'], cwd: root, roots});
    expect(text.status).toBe(0);
    expect(text.stdout.trim()).toBe(SELF_VERSION);
    expect(text.stderr).toContain(
      "astryx: could not get Astryx 0.7.0 to match this project's Core (no package set the host passed holds CLI 0.7.0 with this project's packages); answering with CLI",
    );
    expect(installedARelease(text.cache)).toBe(false);
    const json = host({argv: ['docs', '--json'], cwd: root, roots});
    expect(JSON.parse(json.stdout).meta.answeredBy.copy).toBe('fallback');
    expect(installedARelease(json.cache)).toBe(false);
  });

  it("installs nothing when the matching set's CLI starts through neither its host entry nor a bin: this copy answers, announced", () => {
    const root = brokenProject();
    const set = packageSet('0.7.0', {hostEntry: 'broken', bin: false});
    const run = host({argv: ['--version'], cwd: root, roots: [set]});
    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe(SELF_VERSION);
    expect(run.stderr).toMatch(
      /astryx: could not get Astryx 0\.7\.0 to match this project's Core \(the CLI 0\.7\.0 in the package set at .+ could not be started\); answering with CLI/,
    );
    expect(run.stderr).not.toContain('installing CLI release');
    expect(installedARelease(run.cache)).toBe(false);
  });
});

describe('a project CLI the host declined, in a hosted run', () => {
  /** A project on Core and CLI 0.7.0, the CLI a stand-in that reports when it runs. */
  function projectWithCli() {
    const root = project(tempDir(), {
      '@astryxdesign/core': '0.7.0',
      '@astryxdesign/cli': '0.7.0',
    });
    installCore(root, '0.7.0');
    installStandInCli(root, '0.7.0');
    return root;
  }

  it("is answered by a package set of that CLI's release, through its host entry, with the reason", () => {
    const root = projectWithCli();
    const set = packageSet('0.7.0', {hostEntry: true});
    const run = host(
      {
        argv: ['docs'],
        cwd: root,
        roots: [packageSet('0.7.0'), set],
        declinedProjectCli: 'untrusted',
      },
      {sources: ACME_SOURCE},
    );
    expect(run.status).toBe(0);
    expect(run.stderr).not.toContain('stand-in');
    expect(run.report()).toEqual({
      hostEntry: '0.7.0',
      options: {
        argv: ['docs'],
        cwd: root,
        roots: [set],
        integrations: [],
        declinedProjectCli: 'untrusted',
      },
      discoverSources: ['Acme catalog'],
    });
    expect(run.result().packages).toEqual([
      {name: '@astryxdesign/cli', version: '0.7.0', source: 'package-set'},
    ]);
  });

  it('never runs it through a package set without a host entry: this copy answers, announced', () => {
    const root = projectWithCli();
    const run = host({
      argv: ['--version'],
      cwd: root,
      roots: [packageSet('0.7.0')],
      declinedProjectCli: 'untrusted',
    });
    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe(SELF_VERSION);
    expect(run.stderr).not.toContain('stand-in');
    expect(run.stderr).toContain('(project CLI skipped: untrusted)');
  });
});

describe("the host's discover sources", () => {
  it("are called after every other source, and reported as the host's", () => {
    const empty = tempDir('empty');
    const run = host(
      {argv: ['discover', '--json'], cwd: empty},
      {sources: ACME_SOURCE},
    );
    expect(run.status).toBe(0);
    const out = JSON.parse(run.stdout);
    // The host's source comes after every other source and before the
    // official list, which is always last.
    expect(out.meta.sources).toEqual([
      expect.objectContaining({
        name: 'Acme catalog',
        from: 'the host',
        status: 'fresh',
      }),
      expect.objectContaining({name: 'Astryx'}),
    ]);
    expect(JSON.stringify(out.meta.available)).toContain('acme-widgets');
  });
});

describe("the host's discover sources in a project", () => {
  /**
   * JavaScript for a discover source whose catalog is named `name`.
   * @param {string} name
   */
  const source = name =>
    `async () => ({schemaVersion: 1, source: {name: ${JSON.stringify(name)}, generatedAt: '2026-10-20T00:00:00.000Z', complete: true}, packages: []})`;

  it("come after the project's own source and its integrations' sources, and before the official list", () => {
    const root = project(tempDir(), {
      '@astryxdesign/core': SELF_VERSION,
      'acme-widgets': '1.0.0',
    });
    fs.writeFileSync(
      path.join(root, 'astryx.config.mjs'),
      `export default {discover: ${source('Project catalog')}};\n`,
    );
    const pkgDir = path.join(root, 'node_modules', 'acme-widgets');
    writeJson(path.join(pkgDir, 'package.json'), {
      name: 'acme-widgets',
      version: '1.0.0',
    });
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      `export const discover = ${source('Widgets catalog')};\nexport default {};\n`,
    );
    const run = host(
      {argv: ['discover', '--json'], cwd: root},
      {sources: ACME_SOURCE},
    );
    expect(run.status).toBe(0);
    expect(
      JSON.parse(run.stdout).meta.sources.map(s => [s.name, s.from]),
    ).toEqual([
      ['Project catalog', 'astryx.config'],
      ['Widgets catalog', 'acme-widgets'],
      ['Acme catalog', 'the host'],
      ['Astryx', '@astryxdesign/cli'],
    ]);
  });
});

describe('what a hosted run resolved', () => {
  it('names the CLI and its Core from the package set outside a project', () => {
    const run = host({
      argv: ['component', '--list', '--json'],
      cwd: tempDir('empty'),
    });
    expect(run.status).toBe(0);
    expect(run.result().packages).toEqual(
      expect.arrayContaining([
        {
          name: '@astryxdesign/cli',
          version: SELF_VERSION,
          source: 'package-set',
        },
        {
          name: '@astryxdesign/core',
          version: SELF_VERSION,
          source: 'package-set',
        },
      ]),
    );
  });

  it("names a project's own integration as the project's", () => {
    const root = project(tempDir(), {
      '@astryxdesign/core': SELF_VERSION,
      'acme-widgets': '1.0.0',
    });
    const pkgDir = path.join(root, 'node_modules', 'acme-widgets');
    writeJson(path.join(pkgDir, 'package.json'), {
      name: 'acme-widgets',
      version: '1.0.0',
    });
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      'export default {};\n',
    );
    const run = host({argv: ['discover', '--json'], cwd: root});
    expect(run.status).toBe(0);
    expect(run.result().packages).toContainEqual({
      name: 'acme-widgets',
      version: '1.0.0',
      source: 'project',
    });
  });
});
