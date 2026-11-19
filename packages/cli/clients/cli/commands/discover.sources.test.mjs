// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx discover` with a discover source: the list, a package page, a
 * search, and the refused option pair, driven through the real CLI against a
 * hermetic project whose astryx.config sets `discover`. Saved copies go to a
 * temp cache directory, never the project.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';

const CONFIG = `
const packages = [
  {
    package: '@test/kit',
    integration: 'test-kit',
    aliases: [],
    latest: '3.2.0',
    versions: [
      {version: '3.2.0', publishedAt: '2026-09-29T00:00:00.000Z', prerelease: false, status: 'ok'},
      {version: '3.1.4', publishedAt: '2026-09-01T00:00:00.000Z', prerelease: false, status: 'ok'},
    ],
    contributions: [{kind: 'component', name: 'Dial'}],
  },
  {
    package: '@test/charts',
    integration: 'test-charts',
    aliases: [],
    latest: '2.0.0',
    versions: [
      {version: '2.1.0-beta.1', publishedAt: '2026-09-25T00:00:00.000Z', prerelease: true, status: 'ok'},
      {version: '2.0.0', publishedAt: '2026-09-20T00:00:00.000Z', prerelease: false, status: 'ok'},
    ],
    contributions: [
      {kind: 'component', name: 'Chart'},
      {kind: 'template', name: 'pages/Report'},
    ],
  },
  {
    package: '@test/boards',
    integration: 'test-boards',
    aliases: [],
    latest: '1.0.0',
    versions: [
      {version: '1.0.0', publishedAt: '2026-09-10T00:00:00.000Z', prerelease: false, status: 'ok'},
    ],
    contributions: [{kind: 'template', name: 'pages/DialBoard'}],
  },
];

export default {
  integrations: ['@test/kit'],
  async discover({package: name}) {
    return {
      schemaVersion: 1,
      source: {name: 'Test catalog', generatedAt: '2026-09-30T00:00:00.000Z', complete: true},
      packages: packages.filter(p => name == null || p.package === name),
    };
  },
};
`;

let tmpDir;
let project;
/** @type {Record<string, string | undefined>} */
let savedEnv;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-discover-sources-'));
  project = path.join(tmpDir, 'project');
  const pkgDir = path.join(project, 'node_modules', '@test', 'kit');
  fs.mkdirSync(path.join(pkgDir, 'components'), {recursive: true});
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({
      name: 'proj',
      version: '1.0.0',
      dependencies: {'@test/kit': '3.1.4'},
    }),
  );
  fs.writeFileSync(path.join(project, 'astryx.config.mjs'), CONFIG);
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@test/kit', version: '3.1.4'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default {components: './components'};\n`,
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'Dial.doc.mjs'),
    `export const docs = {name: 'Dial', usage: {description: 'A dial.'}};\n`,
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'Dial.tsx'),
    `export function Dial() { return null; }\n`,
  );
  // The saved copy lives in the per-user cache; point it at the temp dir.
  savedEnv = {
    HOME: process.env.HOME,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
  };
  process.env.HOME = path.join(tmpDir, 'home');
  process.env.XDG_CACHE_HOME = path.join(tmpDir, 'cache');
  process.env.LOCALAPPDATA = path.join(tmpDir, 'localappdata');
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** The per-user cache directory this platform uses under the redirected env. */
function userCacheDir() {
  if (process.platform === 'win32') {
    return path.join(tmpDir, 'localappdata', 'astryx', 'Cache');
  }
  if (process.platform === 'darwin') {
    return path.join(tmpDir, 'home', 'Library', 'Caches', 'astryx');
  }
  return path.join(tmpDir, 'cache', 'astryx');
}

describe('astryx discover with a discover source', () => {
  it('lists what the project has and what it could add, in --json', async () => {
    const {status, stdout} = await runCli(['discover', '--json'], {
      cwd: project,
    });

    expect(status).toBe(0);
    const {data, meta} = JSON.parse(stdout);
    expect(data).toEqual([
      expect.objectContaining({
        name: '@test/kit',
        components: ['Dial'],
        version: '3.1.4',
        latest: '3.2.0',
      }),
    ]);
    // The official packages come first, then what the project's source adds.
    const official = meta.available.filter(entry => entry.source === 'Astryx');
    expect(official.length).toBeGreaterThan(0);
    expect(meta.available.slice(0, official.length)).toEqual(official);
    // Each entry carries the command that adds it; a source's entry is not
    // pinned, as on its package page.
    expect(meta.available.slice(official.length)).toEqual([
      {
        name: '@test/charts',
        package: '@test/charts',
        components: ['Chart'],
        version: '2.0.0',
        templates: ['pages/Report'],
        source: 'Test catalog',
        install: expect.stringMatching(/ @test\/charts$/),
      },
      {
        name: '@test/boards',
        package: '@test/boards',
        components: [],
        version: '1.0.0',
        templates: ['pages/DialBoard'],
        source: 'Test catalog',
        install: expect.stringMatching(/ @test\/boards$/),
      },
    ]);
    for (const entry of official) {
      expect(entry.install).toMatch(
        new RegExp(` ${entry.name}@${entry.version.replaceAll('.', '\\.')}$`),
      );
    }
    expect(meta.sources).toEqual([
      expect.objectContaining({
        name: 'Test catalog',
        from: 'astryx.config',
        status: 'fresh',
      }),
      {
        name: 'Astryx',
        from: '@astryxdesign/cli',
        status: 'fresh',
        complete: true,
      },
    ]);
  });

  it('prints both sides as records', async () => {
    const {status, stdout} = await runCli(['discover'], {cwd: project});

    expect(status).toBe(0);
    expect(stdout).toMatch(/^Installed$/m);
    expect(stdout).toMatch(/^Available$/m);
    expect(stdout).toMatch(/^name:\s+@test\/charts$/m);
    expect(stdout).toMatch(/^latest:\s+3\.2\.0$/m);
  });

  it('shows a package it does not have with its releases and the command that adds it, and never runs it', async () => {
    const {status, stdout} = await runCli(['discover', '@test/charts'], {
      cwd: project,
    });

    expect(status).toBe(0);
    expect(stdout).toMatch(/^installed:\s+false$/m);
    expect(stdout).toContain('- 2.0.0  2026-09-20  latest');
    expect(stdout).not.toContain('2.1.0-beta.1  ');
    expect(stdout).toContain('1 prerelease is not listed.');
    // The verb follows the detected package manager.
    expect(stdout).toMatch(
      /^(npm install|pnpm add|yarn add|bun add) @test\/charts$/m,
    );
    expect(
      fs.existsSync(path.join(project, 'node_modules', '@test', 'charts')),
    ).toBe(false);
  });

  it('says which item is missing from a package only a source lists', async () => {
    const {status, stdout} = await runCli(
      ['discover', '@test/charts/Nope', '--json'],
      {cwd: project},
    );

    expect(status).toBe(1);
    const {code, error} = JSON.parse(stdout);
    expect(code).toBe('ERR_UNKNOWN_COMPONENT');
    expect(error).toBe('"Nope" not found in @test/charts');
  });

  it('searches every kind in every source', async () => {
    const {status, stdout} = await runCli(['discover', 'report', '--json'], {
      cwd: project,
    });

    expect(status).toBe(0);
    expect(JSON.parse(stdout).data.matches).toEqual([
      {
        package: '@test/charts',
        component: 'pages/Report',
        kind: 'template',
        installed: false,
      },
    ]);
  });

  it('refuses --installed with --available', async () => {
    const {status, stdout} = await runCli(
      ['discover', '--installed', '--available', '--json'],
      {cwd: project},
    );

    expect(status).toBe(1);
    expect(JSON.parse(stdout).code).toBe('ERR_INVALID_OPTION');
  });

  it('lists every match for a free-text query, even an exact component name, and opens one by its package path', async () => {
    const exact = await runCli(['discover', 'Dial', '--json'], {cwd: project});
    const {type, data} = JSON.parse(exact.stdout);
    expect(type).toBe('discover.search');
    expect(data.matches.map(m => [m.component, m.installed])).toEqual([
      ['Dial', true],
      ['pages/DialBoard', false],
    ]);

    const opened = await runCli(['discover', '@test/kit/Dial', '--json'], {
      cwd: project,
    });
    expect(JSON.parse(opened.stdout).type).toBe('discover.detail.doc');

    // Text mode names the package on stdout, so a pipe keeps it.
    const text = await runCli(['discover', '@test/kit/Dial'], {cwd: project});
    expect(text.stdout).toMatch(/package: @test\/kit/);
  });

  it('saves the answer in the user cache and writes nothing into the project', async () => {
    const before = fs.readdirSync(project).sort();
    await runCli(['discover', '--json'], {cwd: project});

    expect(fs.readdirSync(project).sort()).toEqual(before);
    expect(fs.existsSync(path.join(project, 'node_modules', '.cache'))).toBe(
      false,
    );
    expect(fs.readdirSync(path.join(userCacheDir(), 'discover'))).toHaveLength(
      1,
    );
  });
});
