// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx discover` and the official list the CLI carries
 * (spec:AST-051 FR11), in projects with no discover source of their own.
 *
 * A fresh app sees the official Astryx packages it could add, and a declared
 * official theme counts as installed. In a project that loads no integration
 * and has no source of its own, every query still answers with the list (FR1);
 * a project that loads an integration gets package pages and search, where an
 * official theme is added at a pinned version and then with `theme add`.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';

const CLI_VERSION = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../package.json',
    ),
    'utf8',
  ),
).version;

let tmpDir;
let project;

/** @param {object} [fields] */
function writeProject(fields = {}) {
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'my-app', version: '1.0.0', ...fields}),
  );
}

/** @param {string} name @param {string} version */
function install(name, version) {
  const dir = path.join(project, 'node_modules', ...name.split('/'));
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name, version}),
  );
}

/** A configured integration, so discover answers queries. */
function addIntegration() {
  const pkg = path.join(project, 'node_modules', '@acme', 'ui');
  fs.mkdirSync(path.join(pkg, 'components'), {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    '{"name":"@acme/ui","version":"1.0.0","type":"module"}',
  );
  fs.writeFileSync(
    path.join(pkg, 'astryx.integration.mjs'),
    "export default {components: './components'};\n",
  );
  fs.writeFileSync(
    path.join(pkg, 'components', 'Widget.doc.mjs'),
    'export const doc = {type: "component", name: "Widget", description: "A widget"};\n',
  );
  fs.writeFileSync(
    path.join(pkg, 'components', 'Widget.tsx'),
    'export function Widget() { return null; }\n',
  );
  writeProject({type: 'module'});
  fs.writeFileSync(
    path.join(project, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/ui']};\n",
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-discover-nosource-'));
  project = path.join(tmpDir, 'project');
  fs.mkdirSync(project, {recursive: true});
  writeProject();
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('astryx discover in a project with nothing of its own', () => {
  it('lists the official packages it could add, each with its add command, and no query hints', async () => {
    const {status, stdout} = await runCli(['discover'], {cwd: project});

    expect(status).toBe(0);
    expect(stdout).toMatch(/^Available$/m);
    expect(stdout).toMatch(/^from Astryx$/m);
    expect(stdout).toMatch(/^name:\s+@astryxdesign\/theme-neutral$/m);
    expect(stdout).toMatch(/^source:\s+Astryx$/m);
    expect(stdout).toMatch(
      new RegExp(
        `^install:\\s+.* @astryxdesign/theme-neutral@${CLI_VERSION}$`,
        'm',
      ),
    );
    expect(stdout).toContain('To add a package, run its install command.');
    expect(stdout).toMatch(/theme add <theme>, for example .*theme add \w+/);
    // Every query here returns this list, so the list must not suggest one.
    expect(stdout).not.toContain('Usage:');
    expect(stdout).not.toMatch(/discover <(package|search)>/);
  });

  it('keeps the list with meta.configured=false, and reports the official list in meta.sources', async () => {
    const {status, stdout} = await runCli(['discover', '--json'], {
      cwd: project,
    });

    expect(status).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.type).toBe('discover.list');
    expect(result.data).toEqual([]);
    expect(result.meta.configured).toBe(false);
    expect(result.meta.sources).toEqual([
      {
        name: 'Astryx',
        from: '@astryxdesign/cli',
        status: 'fresh',
        complete: true,
      },
    ]);
    expect(result.meta.available.length).toBeGreaterThan(0);
    for (const entry of result.meta.available) {
      expect(entry.source).toBe('Astryx');
      expect(entry.name.startsWith('@astryxdesign/')).toBe(true);
    }
    expect(result.meta.available).toContainEqual(
      expect.objectContaining({
        name: '@astryxdesign/theme-neutral',
        version: CLI_VERSION,
        themes: ['neutral'],
      }),
    );
    expect(result.meta.answeredBy).toEqual(expect.any(Object));
  });

  it('answers every query with the list, and says why in text', async () => {
    for (const query of ['gothic', '@astryxdesign/theme-gothic', '   ']) {
      const asJson = await runCli(['discover', query, '--json'], {
        cwd: project,
      });
      expect(asJson.status, query).toBe(0);
      expect(JSON.parse(asJson.stdout).type, query).toBe('discover.list');
    }

    const {stdout} = await runCli(['discover', 'gothic'], {cwd: project});
    expect(stdout).toContain(
      'This project loads no integration and has no discover source of its own, so discover lists everything instead of answering "gothic".',
    );
    expect(stdout).not.toContain('Usage:');
  });

  it('counts a declared official theme as installed, keeps meta.configured, and does not offer it again', async () => {
    writeProject({dependencies: {'@astryxdesign/theme-butter': CLI_VERSION}});
    install('@astryxdesign/theme-butter', '0.7.0');

    const {status, stdout} = await runCli(['discover', '--json'], {
      cwd: project,
    });

    expect(status).toBe(0);
    const {data, meta} = JSON.parse(stdout);
    expect(data).toEqual([
      expect.objectContaining({
        name: '@astryxdesign/theme-butter',
        version: '0.7.0',
        themes: ['butter'],
        latest: CLI_VERSION,
      }),
    ]);
    expect(meta.configured).toBe(false);
    expect(meta.available.map(entry => entry.name)).not.toContain(
      '@astryxdesign/theme-butter',
    );
  });
});

describe('astryx discover and the project’s own package.json', () => {
  it('counts a declared official theme as installed from a subfolder', async () => {
    writeProject({dependencies: {'@astryxdesign/theme-butter': CLI_VERSION}});
    install('@astryxdesign/theme-butter', '0.7.0');
    const src = path.join(project, 'src', 'components');
    fs.mkdirSync(src, {recursive: true});

    const {status, stdout} = await runCli(['discover', '--json'], {cwd: src});

    expect(status).toBe(0);
    const {data, meta} = JSON.parse(stdout);
    expect(data.map(entry => entry.name)).toEqual([
      '@astryxdesign/theme-butter',
    ]);
    expect(meta.available.map(entry => entry.name)).not.toContain(
      '@astryxdesign/theme-butter',
    );
  });

  it('pins the exact Core version a fresh clone declares, before install', async () => {
    writeProject({dependencies: {'@astryxdesign/core': '0.6.8'}});

    const {status, stdout} = await runCli(['discover', '--json'], {
      cwd: project,
    });

    expect(status).toBe(0);
    const neutral = JSON.parse(stdout).meta.available.find(
      entry => entry.name === '@astryxdesign/theme-neutral',
    );
    // The entry shows the latest release and installs the declared Core's.
    expect(neutral.version).toBe(CLI_VERSION);
    expect(neutral.install).toMatch(/ @astryxdesign\/theme-neutral@0\.6\.8$/);
  });

  it('pins the Core range a fresh clone declares, quoted for the shell', async () => {
    writeProject({dependencies: {'@astryxdesign/core': '^0.6.8'}});

    const {status, stdout} = await runCli(['discover', '--json'], {
      cwd: project,
    });

    expect(status).toBe(0);
    const neutral = JSON.parse(stdout).meta.available.find(
      entry => entry.name === '@astryxdesign/theme-neutral',
    );
    expect(neutral.version).toBe(CLI_VERSION);
    expect(neutral.install).toMatch(
      / "@astryxdesign\/theme-neutral@\^0\.6\.8"$/,
    );
  });

  it('neither installs nor offers an official theme the project only peer-depends on', async () => {
    writeProject({
      peerDependencies: {'@astryxdesign/theme-butter': '>=0.7.0'},
    });

    const {stdout} = await runCli(['discover', '--json'], {cwd: project});
    const {data, meta} = JSON.parse(stdout);
    expect(data).toEqual([]);
    expect(meta.available.map(entry => entry.name)).not.toContain(
      '@astryxdesign/theme-butter',
    );
  });

  it('recognizes an official theme installed under an npm alias', async () => {
    writeProject({
      dependencies: {'my-butter': 'npm:@astryxdesign/theme-butter@0.7.0'},
    });
    install('my-butter', '0.7.0');

    const {stdout} = await runCli(['discover', '--json'], {cwd: project});
    expect(JSON.parse(stdout).data).toEqual([
      expect.objectContaining({
        name: '@astryxdesign/theme-butter',
        version: '0.7.0',
      }),
    ]);
  });
});

describe('astryx discover with a source that publishes an official integration under another name', () => {
  beforeEach(() => {
    writeProject({type: 'module'});
    fs.writeFileSync(
      path.join(project, 'astryx.config.mjs'),
      `export default {
  discover: async () => ({
    schemaVersion: 1,
    source: {name: 'Fork catalog', generatedAt: '2026-10-01T00:00:00Z', complete: true},
    packages: [{
      package: '@acme/gothic-fork',
      integration: '@astryxdesign/theme-gothic',
      aliases: [],
      latest: '1.0.0',
      versions: [{version: '1.0.0', publishedAt: null, prerelease: false, status: 'ok'}],
      contributions: [{kind: 'theme', name: 'gothic-fork'}],
    }],
  }),
};
`,
    );
  });

  it('keeps the source’s package in the list and in search', async () => {
    const list = await runCli(['discover', '--available', '--json'], {
      cwd: project,
    });
    const names = JSON.parse(list.stdout).meta.available.map(e => e.name);
    expect(names).toContain('@acme/gothic-fork');
    expect(names).not.toContain('@astryxdesign/theme-gothic');

    const search = await runCli(['discover', 'fork', '--json'], {
      cwd: project,
    });
    expect(search.status).toBe(0);
    expect(JSON.parse(search.stdout).data.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({package: '@acme/gothic-fork'}),
      ]),
    );
  });
});

describe('astryx discover in a project that loads an integration', () => {
  beforeEach(addIntegration);

  it('lists official packages first among what it could add', async () => {
    const {status, stdout} = await runCli(['discover', '--json'], {
      cwd: project,
    });
    expect(status).toBe(0);
    const {data, meta} = JSON.parse(stdout);
    expect(data.map(entry => entry.name)).toEqual(['@acme/ui']);
    expect(meta.available[0].source).toBe('Astryx');
  });

  it('adds a theme package at the version shown, then points to theme add', async () => {
    const {status, stdout} = await runCli(
      ['discover', '@astryxdesign/theme-gothic'],
      {cwd: project},
    );

    expect(status).toBe(0);
    expect(stdout).toMatch(/^installed:\s+false$/m);
    expect(stdout).toContain(`@astryxdesign/theme-gothic@${CLI_VERSION}`);
    expect(stdout).toContain('Then use its theme:');
    expect(stdout).toMatch(/theme add gothic$/m);
    expect(stdout).not.toContain('Astryx loads an integration');
  });

  it("lists the latest release and the project's Core version, pins the Core version, and finds both", async () => {
    for (const [core, latest] of [
      ['0.6.8', CLI_VERSION],
      ['99.0.0', '99.0.0'],
    ]) {
      install('@astryxdesign/core', core);

      const page = await runCli(
        ['discover', '@astryxdesign/theme-gothic', '--json'],
        {cwd: project},
      );
      expect(page.status, core).toBe(0);
      const {data} = JSON.parse(page.stdout);
      expect(data.latest, core).toBe(latest);
      expect(data.version, core).toBe(latest);
      expect(data.versions.map(v => v.version).sort(), core).toEqual(
        [...new Set([CLI_VERSION, core])].sort(),
      );
      expect(data.install, core).toMatch(
        new RegExp(
          ` @astryxdesign/theme-gothic@${core.replaceAll('.', '\\.')}$`,
        ),
      );

      for (const wanted of new Set([core, CLI_VERSION])) {
        const lookup = await runCli(
          ['discover', `@astryxdesign/theme-gothic@${wanted}`, '--json'],
          {cwd: project},
        );
        expect(lookup.status, `${core} ${wanted}`).toBe(0);
        expect(JSON.parse(lookup.stdout).data.version, wanted).toBe(wanted);
      }

      const list = await runCli(['discover', '--json'], {cwd: project});
      expect(
        JSON.parse(list.stdout).meta.available.find(
          entry => entry.name === '@astryxdesign/theme-gothic',
        ).version,
        core,
      ).toBe(latest);
    }
  });

  it('says which version its add command installs when the page shows the latest release', async () => {
    install('@astryxdesign/core', '0.6.8');

    const {status, stdout} = await runCli(
      ['discover', '@astryxdesign/theme-gothic'],
      {cwd: project},
    );

    expect(status).toBe(0);
    expect(stdout).toMatch(
      new RegExp(`^latest:\\s+${CLI_VERSION.replaceAll('.', '\\.')}$`, 'm'),
    );
    expect(stdout).toMatch(/^- 0\.6\.8 {2}date unknown$/m);
    // The verb follows the detected package manager.
    expect(stdout).toMatch(/^\S+ \S+ @astryxdesign\/theme-gothic@0\.6\.8$/m);
    expect(stdout).toContain(
      "This installs 0.6.8, the version that matches this project's Core.",
    );
  });

  it('pins the declared Core range on the page and says so', async () => {
    writeProject({
      type: 'module',
      dependencies: {'@astryxdesign/core': '>=0.6.8 <0.8.0'},
    });

    const {status, stdout} = await runCli(
      ['discover', '@astryxdesign/theme-gothic'],
      {cwd: project},
    );

    expect(status).toBe(0);
    expect(stdout).toMatch(
      /^\S+ \S+ "@astryxdesign\/theme-gothic@>=0\.6\.8 <0\.8\.0"$/m,
    );
    expect(stdout).toContain(
      'This installs the newest release in >=0.6.8 <0.8.0, the Core range this project declares.',
    );
  });

  it('keeps latest at the newest release for an installed official theme', async () => {
    install('@astryxdesign/core', '0.6.8');
    writeProject({
      type: 'module',
      dependencies: {'@astryxdesign/theme-butter': '0.6.8'},
    });
    install('@astryxdesign/theme-butter', '0.6.8');

    const list = await runCli(['discover', '--json'], {cwd: project});
    expect(
      JSON.parse(list.stdout).data.find(
        entry => entry.name === '@astryxdesign/theme-butter',
      ),
    ).toMatchObject({version: '0.6.8', latest: CLI_VERSION});

    const page = await runCli(['discover', '@astryxdesign/theme-butter'], {
      cwd: project,
    });
    expect(page.stdout).toMatch(
      new RegExp(
        `^- ${CLI_VERSION.replaceAll('.', '\\.')} {2}date unknown {2}latest$`,
        'm',
      ),
    );
    expect(page.stdout).toMatch(/^- 0\.6\.8 {2}date unknown {2}installed$/m);
  });

  it('keeps the error code for a version or item of an official package it does not show', async () => {
    for (const query of [
      '@astryxdesign/theme-gothic@0.6.8',
      '@astryxdesign/theme-gothic@latest',
      '@astryxdesign/theme-gothic/nope',
    ]) {
      const {status, stdout} = await runCli(['discover', query, '--json'], {
        cwd: project,
      });
      expect(status, query).toBe(1);
      expect(JSON.parse(stdout).code, query).toBe('ERR_UNKNOWN_PACKAGE');
    }
  });

  it('points an installed theme’s page at its items, not at components', async () => {
    writeProject({
      type: 'module',
      dependencies: {'@astryxdesign/theme-butter': CLI_VERSION},
    });
    install('@astryxdesign/theme-butter', CLI_VERSION);

    const {stdout} = await runCli(['discover', '@astryxdesign/theme-butter'], {
      cwd: project,
    });
    expect(stdout).toContain('discover @astryxdesign/theme-butter/<item>');
    expect(stdout).not.toContain('<ComponentName>');
  });

  it('finds an official theme by name', async () => {
    const {status, stdout} = await runCli(['discover', 'gothic', '--json'], {
      cwd: project,
    });

    expect(status).toBe(0);
    expect(JSON.parse(stdout).data.matches).toContainEqual(
      expect.objectContaining({
        package: '@astryxdesign/theme-gothic',
        component: 'gothic',
        kind: 'theme',
        installed: false,
      }),
    );
  });
});
