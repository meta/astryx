// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for how the discover adapter reads the official list and calls
 * discover sources: order, failure isolation, timeouts, and the saved copy,
 * plus what the official list adds to the installed list and the add command.
 * Sources are plain functions on a stand-in project, and the saved copies go
 * to a temp directory.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  addCommand,
  callSources,
  OFFICIAL_LIST_FILE,
  officialDeclarations,
  officialList,
  withDeclaredOfficial,
} from './_adapter.mjs';
import {parseDiscoverCatalog} from '../../authoring/discover/parse.mjs';
import {
  _resetHostedRun,
  activateHostedRun,
} from '../../foundation/runtime/package-root.mjs';

/** No official packages, so a test sees only its own sources after it. */
const NO_OFFICIAL = {packages: []};

/** How the official list reports itself among the sources. */
const OFFICIAL_STATE = ['Astryx', '@astryxdesign/cli', 'fresh'];

/**
 * @param {string} name
 * @param {object[]} packages
 */
function catalog(name, packages) {
  return {
    schemaVersion: 1,
    source: {name, generatedAt: '2026-09-30T00:00:00.000Z', complete: true},
    packages,
  };
}

/**
 * @param {string} name
 * @param {object} [extra]
 */
function pkg(name, extra = {}) {
  return {
    package: name,
    integration: name,
    aliases: [],
    latest: '1.0.0',
    versions: [
      {version: '1.0.0', publishedAt: null, prerelease: false, status: 'ok'},
    ],
    contributions: [],
    ...extra,
  };
}

/**
 * @param {{config?: object, integrations?: object[], cwd?: string}} parts
 * @returns {any}
 */
function project({config = {}, integrations = [], cwd = '/virtual/project'}) {
  return {config, loadedIntegrations: integrations, cwd};
}

/**
 * An official package as officialList() returns it.
 * @param {string} name
 * @param {object} [extra]
 */
function official(name, extra = {}) {
  return {
    ...pkg(name, {latest: '0.7.1'}),
    versions: [
      {version: '0.7.1', publishedAt: null, prerelease: false, status: 'ok'},
    ],
    contributions: [{kind: 'theme', name: name.split('-').pop()}],
    pin: '0.7.1',
    ...extra,
  };
}

let cacheDir;

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-cache-'));
});

afterEach(() => {
  fs.rmSync(cacheDir, {recursive: true, force: true});
});

describe('callSources', () => {
  it('asks the project source first, then each integration in load order, once per function', async () => {
    /** @type {string[]} */
    const calls = [];
    const shared = vi.fn(async () => {
      calls.push('shared');
      return catalog('Shared', [pkg('@a/one')]);
    });
    const own = vi.fn(async () => {
      calls.push('own');
      return catalog('Own', [pkg('@a/one', {latest: '9.9.9'}), pkg('@a/two')]);
    });

    const result = await callSources(
      project({
        config: {discover: own},
        integrations: [
          {name: '@x/first', __discover: shared},
          {name: '@x/second', __discover: shared},
        ],
      }),
      {},
      {cacheDir, official: NO_OFFICIAL},
    );

    expect(calls).toEqual(['own', 'shared']);
    expect(result.sources.map(s => [s.name, s.from, s.status])).toEqual([
      ['Own', 'astryx.config', 'fresh'],
      ['Shared', '@x/first', 'fresh'],
      OFFICIAL_STATE,
    ]);
    expect(result.packages.map(p => [p.package, p.latest, p.source])).toEqual([
      ['@a/one', '9.9.9', 'Own'],
      ['@a/two', '1.0.0', 'Own'],
    ]);
  });

  it('passes the package and version it wants, with an abort signal', async () => {
    const source = vi.fn(async () => catalog('S', []));

    await callSources(
      project({integrations: [{name: '@x/src', __discover: source}]}),
      {package: '@a/one', version: '1.0.0'},
      {cacheDir, official: NO_OFFICIAL},
    );

    expect(source).toHaveBeenCalledWith({
      signal: expect.any(globalThis.AbortSignal),
      package: '@a/one',
      version: '1.0.0',
    });
  });

  it('keeps every other source when one throws, returns bad data, or is not a function', async () => {
    const result = await callSources(
      project({
        integrations: [
          {
            name: '@x/throws',
            __discover: async () => {
              throw new Error('offline');
            },
          },
          {name: '@x/bad', __discover: async () => ({schemaVersion: 2})},
          {
            name: '@x/broken',
            __discoverError: 'named export "discover" must be a function',
          },
          {
            name: '@x/good',
            __discover: async () => catalog('Good', [pkg('@a/one')]),
          },
        ],
      }),
      {},
      {cacheDir, official: NO_OFFICIAL},
    );

    expect(result.sources.map(s => [s.from, s.status])).toEqual([
      ['@x/throws', 'failed'],
      ['@x/bad', 'failed'],
      ['@x/broken', 'failed'],
      ['@x/good', 'fresh'],
      ['@astryxdesign/cli', 'fresh'],
    ]);
    expect(result.sources[0].error).toContain('offline');
    expect(result.sources[1].error).toContain('schemaVersion 2');
    expect(result.sources[2].error).toContain('must be a function');
    expect(result.packages.map(p => p.package)).toEqual(['@a/one']);
  });

  it('gives up on a source after the timeout and aborts its signal', async () => {
    /** @type {AbortSignal | undefined} */
    let seen;
    const slow = ({signal}) => {
      seen = signal;
      return new Promise(() => {});
    };

    const result = await callSources(
      project({integrations: [{name: '@x/slow', __discover: slow}]}),
      {},
      {cacheDir, timeoutMs: 20, official: NO_OFFICIAL},
    );

    expect(result.sources[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('did not answer'),
    });
    expect(seen?.aborted).toBe(true);
  });

  it('uses the copy saved for the same request when a source fails, and says when it was saved', async () => {
    let online = true;
    const source = async () => {
      if (!online) throw new Error('offline');
      return catalog('S', [pkg('@a/one')]);
    };
    const p = project({integrations: [{name: '@x/src', __discover: source}]});
    const options = {cacheDir, official: NO_OFFICIAL};

    await callSources(p, {}, options);
    online = false;
    const offline = await callSources(p, {}, options);

    expect(offline.sources[0]).toMatchObject({
      name: 'S',
      status: 'saved',
      error: 'offline',
      savedAt: expect.any(String),
    });
    expect(offline.packages.map(x => x.package)).toEqual(['@a/one']);

    const otherRequest = await callSources(p, {package: '@a/one'}, options);
    expect(otherRequest.sources[0].status).toBe('failed');
  });

  it("keeps a host's saved copies per host, so one tool never answers with another's", async () => {
    let online = true;
    const source = async () => {
      if (!online) throw new Error('offline');
      return catalog('Acme catalog', [pkg('@acme/one')]);
    };
    const options = {cacheDir, official: NO_OFFICIAL};
    try {
      activateHostedRun({
        discoverSources: [source],
        startingRoot: '/tools/acme',
      });
      await callSources(undefined, {}, options);
      online = false;
      const sameHost = await callSources(undefined, {}, options);
      expect(sameHost.sources[0]).toMatchObject({
        name: 'Acme catalog',
        from: 'the host',
        status: 'saved',
      });

      _resetHostedRun();
      activateHostedRun({
        discoverSources: [source],
        startingRoot: '/tools/other',
      });
      const otherHost = await callSources(undefined, {}, options);
      expect(otherHost.sources[0]).toMatchObject({
        from: 'the host',
        status: 'failed',
        error: 'offline',
      });
      expect(otherHost.packages).toEqual([]);
    } finally {
      _resetHostedRun();
    }
  });

  it('keeps the saved copy in the cache directory, not in the project', async () => {
    await callSources(
      project({
        integrations: [
          {name: '@x/src', __discover: async () => catalog('S', [])},
        ],
      }),
      {},
      {cacheDir, official: NO_OFFICIAL},
    );

    expect(fs.readdirSync(path.join(cacheDir, 'discover'))).toHaveLength(1);
    expect(fs.existsSync('/virtual/project')).toBe(false);
  });

  it('returns only the official list when there is no project', async () => {
    const result = await callSources(
      undefined,
      {},
      {official: {packages: [official('@astryxdesign/theme-gothic')]}},
    );
    expect(result.sources.map(s => [s.name, s.from, s.status])).toEqual([
      OFFICIAL_STATE,
    ]);
    expect(result.packages.map(p => [p.package, p.source])).toEqual([
      ['@astryxdesign/theme-gothic', 'Astryx'],
    ]);
  });

  it('reads the official list last, so another source keeps its entry', async () => {
    const own = async () =>
      catalog('Own', [
        pkg('@a/two'),
        pkg('@astryxdesign/theme-matcha', {latest: '0.6.8'}),
      ]);
    const result = await callSources(
      project({config: {discover: own}}),
      {},
      {
        cacheDir,
        official: {
          packages: [
            official('@astryxdesign/theme-gothic'),
            official('@astryxdesign/theme-matcha'),
          ],
        },
      },
    );

    expect(result.sources.map(s => [s.name, s.from, s.status])).toEqual([
      ['Own', 'astryx.config', 'fresh'],
      OFFICIAL_STATE,
    ]);
    // The add command's pin stays with the list; a catalog entry never
    // carries it.
    for (const entry of result.packages)
      expect(entry).not.toHaveProperty('pin');
    // Source order: discover puts official packages first only where it
    // shows them.
    expect(
      result.packages.map(p => [p.package, p.latest, p.source, !!p.official]),
    ).toEqual([
      ['@a/two', '1.0.0', 'Own', false],
      ['@astryxdesign/theme-matcha', '0.6.8', 'Own', false],
      ['@astryxdesign/theme-gothic', '0.7.1', 'Astryx', true],
    ]);
  });

  it('keeps a source’s package for an official integration it publishes under another name', async () => {
    const own = async () =>
      catalog('Own', [
        pkg('@acme/gothic-fork', {
          integration: '@astryxdesign/theme-gothic',
          contributions: [{kind: 'theme', name: 'gothic'}],
        }),
        pkg('@acme/stone-mirror', {aliases: ['@astryxdesign/theme-stone']}),
      ]);
    const result = await callSources(
      project({config: {discover: own}}),
      {},
      {
        cacheDir,
        official: {
          packages: [
            official('@astryxdesign/theme-gothic'),
            official('@astryxdesign/theme-stone'),
            official('@astryxdesign/theme-matcha'),
          ],
        },
      },
    );
    expect(result.packages.map(p => [p.package, p.source])).toEqual([
      ['@acme/gothic-fork', 'Own'],
      ['@acme/stone-mirror', 'Own'],
      ['@astryxdesign/theme-matcha', 'Astryx'],
    ]);
  });

  it('answers a package request with only that official package', async () => {
    const result = await callSources(
      project({}),
      {package: '@astryxdesign/theme-matcha'},
      {
        cacheDir,
        official: {
          packages: [
            official('@astryxdesign/theme-gothic'),
            official('@astryxdesign/theme-matcha'),
          ],
        },
      },
    );
    expect(result.packages.map(p => p.package)).toEqual([
      '@astryxdesign/theme-matcha',
    ]);
  });

  it('reports an official list it could not read like a failed source', async () => {
    const result = await callSources(
      project({}),
      {},
      {cacheDir, official: {packages: [], error: 'the list is missing'}},
    );
    expect(result.sources.slice(-1)).toEqual([
      {
        name: 'Astryx',
        from: '@astryxdesign/cli',
        status: 'failed',
        error: 'the list is missing',
      },
    ]);
    expect(result.packages).toEqual([]);
  });
});

/**
 * A stand-in project folder whose installed Core is `version`.
 * @param {string} dir
 * @param {string} version
 */
function withCore(dir, version) {
  const at = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(at, {recursive: true});
  fs.writeFileSync(
    path.join(at, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core', version}),
  );
  return project({cwd: dir});
}

/** The version an entry lists, with its latest. */
const versionsOf = (
  /** @type {{latest: string | null, versions: {version: string, prerelease: boolean}[]} | undefined} */ entry,
) =>
  entry && {
    latest: entry.latest,
    versions: entry.versions.map(v => [v.version, v.prerelease]),
  };

/** @param {{package: string}[]} packages @param {string} name */
const find = (packages, name) => packages.find(p => p.package === name);

const NEUTRAL = '@astryxdesign/theme-neutral';

/** The canary-only package names in the committed list. */
function canaryOnlyNames() {
  return JSON.parse(fs.readFileSync(OFFICIAL_LIST_FILE, 'utf8'))
    .packages.filter((/** @type {{canaryOnly?: boolean}} */ p) => p.canaryOnly)
    .map((/** @type {{package: string}} */ p) => p.package);
}

describe('officialList', () => {
  it('gives every official package the release CLI’s version when the project has no Core', () => {
    const {packages, error} = officialList({version: '0.7.1'});
    expect(error).toBeUndefined();
    expect(packages.length).toBeGreaterThan(0);
    for (const entry of packages) {
      expect(entry.package.startsWith('@astryxdesign/')).toBe(true);
      expect(versionsOf(entry)).toEqual({
        latest: '0.7.1',
        versions: [['0.7.1', false]],
      });
      expect(entry.contributions.length).toBeGreaterThan(0);
    }
    expect(packages.map(p => p.package)).toContain(NEUTRAL);
    for (const name of canaryOnlyNames()) {
      expect(find(packages, name)).toBeUndefined();
    }
  });

  it('lists the latest release and the project’s Core version, and pins the Core version', () => {
    for (const [core, latest, versions] of [
      [
        '0.6.8',
        '0.7.1',
        [
          ['0.7.1', false],
          ['0.6.8', false],
        ],
      ],
      [
        '0.8.0',
        '0.8.0',
        [
          ['0.8.0', false],
          ['0.7.1', false],
        ],
      ],
      ['0.7.1', '0.7.1', [['0.7.1', false]]],
      [
        '0.7.1-canary.def5678',
        '0.7.1',
        [
          ['0.7.1', false],
          ['0.7.1-canary.def5678', true],
        ],
      ],
      [
        '0.7.2-canary.def5678',
        '0.7.1',
        [
          ['0.7.2-canary.def5678', true],
          ['0.7.1', false],
        ],
      ],
    ]) {
      const dir = fs.mkdtempSync(path.join(cacheDir, 'core-'));
      const entry = find(
        officialList({version: '0.7.1', project: withCore(dir, core)}).packages,
        NEUTRAL,
      );
      expect(versionsOf(entry), core).toEqual({latest, versions});
      expect(entry.pin, core).toBe(core);
    }
  });

  it('pins the Core version or range a fresh clone declares, and nothing for another spec', () => {
    const p = project({cwd: path.join(cacheDir, 'src')});
    for (const [spec, pin, versions] of [
      [
        '0.6.8',
        '0.6.8',
        [
          ['0.7.1', false],
          ['0.6.8', false],
        ],
      ],
      [
        '=0.6.8',
        '0.6.8',
        [
          ['0.7.1', false],
          ['0.6.8', false],
        ],
      ],
      ['^0.6.8', '^0.6.8', [['0.7.1', false]]],
      ['>=0.6.8 <0.8.0', '>=0.6.8 <0.8.0', [['0.7.1', false]]],
      ['0.6.x || ^0.7.0', '0.6.x || ^0.7.0', [['0.7.1', false]]],
      // A space after an operator: node-semver reads both as >=0.6.8 <0.7.0.
      ['~ 0.6.8', '~0.6.8', [['0.7.1', false]]],
      ['>= 0.6.8 < 0.7.0', '>=0.6.8 <0.7.0', [['0.7.1', false]]],
      ['workspace:*', '0.7.1', [['0.7.1', false]]],
      ['file:../core', '0.7.1', [['0.7.1', false]]],
      ['latest', '0.7.1', [['0.7.1', false]]],
    ]) {
      fs.writeFileSync(
        path.join(cacheDir, 'package.json'),
        JSON.stringify({devDependencies: {'@astryxdesign/core': spec}}),
      );
      const entry = find(
        officialList({version: '0.7.1', project: p}).packages,
        NEUTRAL,
      );
      expect(versionsOf(entry), spec).toEqual({latest: '0.7.1', versions});
      expect(entry.pin, spec).toBe(pin);
    }
  });

  it('on a canary CLI with no Core, pins only the canary-only packages', () => {
    const canary = officialList({
      version: '0.7.2-canary.abc1234',
      project: project({cwd: cacheDir}),
    }).packages;
    expect(versionsOf(find(canary, NEUTRAL))).toEqual({
      latest: null,
      versions: [],
    });
    expect(find(canary, NEUTRAL).pin).toBeUndefined();
    const names = canaryOnlyNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(versionsOf(find(canary, name)), name).toEqual({
        latest: null,
        versions: [['0.7.2-canary.abc1234', true]],
      });
      expect(find(canary, name).pin, name).toBe('0.7.2-canary.abc1234');
    }
  });

  it('lists the canary-only packages beside a canary Core, never beside a released one', () => {
    const released = officialList({
      version: '0.7.2-canary.abc1234',
      project: withCore(cacheDir, '0.7.1'),
    }).packages;
    expect(versionsOf(find(released, NEUTRAL))).toEqual({
      latest: '0.7.1',
      versions: [['0.7.1', false]],
    });
    for (const name of canaryOnlyNames()) {
      expect(find(released, name), name).toBeUndefined();
    }

    fs.writeFileSync(
      path.join(cacheDir, 'package.json'),
      JSON.stringify({dependencies: {'@astryxdesign/core': '^0.7.0'}}),
    );
    const declared = officialList({
      version: '0.7.2-canary.abc1234',
      project: project({cwd: cacheDir}),
    }).packages;
    for (const name of canaryOnlyNames()) {
      expect(find(declared, name), name).toBeUndefined();
    }

    const beside = officialList({
      version: '0.7.2-canary.abc1234',
      project: withCore(cacheDir, '0.7.2-canary.def5678'),
    }).packages;
    for (const name of canaryOnlyNames()) {
      expect(versionsOf(find(beside, name)), name).toEqual({
        latest: null,
        versions: [['0.7.2-canary.def5678', true]],
      });
    }
  });

  it('reads back as a valid discover catalog on a release and a canary CLI', () => {
    for (const version of ['0.7.1', '0.7.2-canary.abc1234']) {
      const packages = officialList({version}).packages.map(
        ({pin: _pin, ...entry}) => entry,
      );
      const parsed = parseDiscoverCatalog(
        catalog('Astryx', packages),
        'the official list',
      );
      expect(parsed.packages).toEqual(packages);
    }
  });

  it('reports a list it cannot read instead of throwing', () => {
    const result = officialList({
      file: path.join(cacheDir, 'missing.json'),
      version: '0.7.1',
    });
    expect(result.packages).toEqual([]);
    expect(result.error).toContain('the official list could not be read');
  });

  it('pins what each entry names, quoting a range, and the pin is a version it lists', () => {
    for (const [cli, core, declared] of [
      ['0.7.1', '0.6.8', undefined],
      ['0.7.1', '0.8.0', undefined],
      ['0.7.1', undefined, '^0.6.8'],
      ['0.7.1', undefined, '>=0.6.8 <0.8.0'],
      ['0.7.2-canary.abc1234', undefined, undefined],
      ['0.7.2-canary.abc1234', '0.7.2-canary.def5678', undefined],
    ]) {
      const dir = fs.mkdtempSync(path.join(cacheDir, 'pin-'));
      if (declared) {
        fs.writeFileSync(
          path.join(dir, 'package.json'),
          JSON.stringify({dependencies: {'@astryxdesign/core': declared}}),
        );
      }
      const p = core ? withCore(dir, core) : project({cwd: dir});
      const {packages} = officialList({version: cli, project: p});
      const add = addCommand(p, {official: packages});
      for (const entry of packages) {
        const label = `${cli} ${core ?? declared} ${entry.package}`;
        const command = add(entry.package);
        if (entry.pin == null) {
          expect(command.endsWith(` ${entry.package}`), label).toBe(true);
        } else if (entry.versions.some(v => v.version === entry.pin)) {
          expect(
            command.endsWith(` ${entry.package}@${entry.pin}`),
            label,
          ).toBe(true);
        } else {
          // Only a declared range is pinned without being a listed version.
          expect(entry.pin, label).toBe(declared);
          expect(
            command.endsWith(` "${entry.package}@${declared}"`),
            label,
          ).toBe(true);
        }
      }
    }
  });
});

describe('officialDeclarations', () => {
  const list = [
    official('@astryxdesign/theme-gothic'),
    official('@astryxdesign/theme-matcha'),
    official('@astryxdesign/theme-stone'),
  ];

  it('reads the project’s own package.json from a subfolder, aliases included, and keeps peers apart', () => {
    fs.writeFileSync(
      path.join(cacheDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          'my-gothic': 'npm:@astryxdesign/theme-gothic@0.7.0',
          react: '19.0.0',
        },
        devDependencies: {'@astryxdesign/theme-matcha': '0.7.0'},
        peerDependencies: {'@astryxdesign/theme-stone': '>=0.7.0'},
      }),
    );
    const declared = officialDeclarations(
      project({cwd: path.join(cacheDir, 'src', 'components')}),
      list,
    );
    expect([...declared.dependency]).toEqual([
      ['@astryxdesign/theme-gothic', 'my-gothic'],
      ['@astryxdesign/theme-matcha', '@astryxdesign/theme-matcha'],
    ]);
    expect([...declared.any].sort()).toEqual([
      '@astryxdesign/theme-gothic',
      '@astryxdesign/theme-matcha',
      '@astryxdesign/theme-stone',
    ]);
  });
});

describe('withDeclaredOfficial', () => {
  /** @param {string} dir @param {string} name @param {string} version */
  function install(dir, name, version) {
    const at = path.join(dir, 'node_modules', ...name.split('/'));
    fs.mkdirSync(at, {recursive: true});
    fs.writeFileSync(
      path.join(at, 'package.json'),
      JSON.stringify({name, version}),
    );
  }

  /** @param {object[]} packages */
  const result = packages => ({sources: [], packages});
  /** @param {Array<[string, string]>} entries */
  const declares = entries => ({
    dependency: new Map(entries),
    any: new Set(entries.map(([name]) => name)),
  });
  const gothic = {
    ...official('@astryxdesign/theme-gothic', {description: 'Dark.'}),
    source: 'Astryx',
    official: true,
  };

  it('counts a declared official package as installed, first, with its installed version', () => {
    install(cacheDir, '@astryxdesign/theme-gothic', '0.7.0');
    const installed = withDeclaredOfficial(
      project({cwd: cacheDir}),
      [{name: '@acme/ui', category: '@acme/ui', components: []}],
      result([gothic]),
      declares([['@astryxdesign/theme-gothic', '@astryxdesign/theme-gothic']]),
      [gothic],
    );
    expect(installed).toEqual([
      {
        name: '@astryxdesign/theme-gothic',
        category: '@astryxdesign/theme-gothic',
        version: '0.7.0',
        description: 'Dark.',
        components: [],
        themes: ['gothic'],
        declaredOfficial: true,
      },
      {name: '@acme/ui', category: '@acme/ui', components: []},
    ]);
  });

  it('reads the version of a package installed under an npm alias', () => {
    install(cacheDir, 'my-gothic', '0.6.8');
    const [entry] = withDeclaredOfficial(
      project({cwd: cacheDir}),
      [],
      result([gothic]),
      declares([['@astryxdesign/theme-gothic', 'my-gothic']]),
      [gothic],
    );
    expect(entry).toMatchObject({
      name: '@astryxdesign/theme-gothic',
      version: '0.6.8',
    });
  });

  it('leaves a declared official package alone when another source supplied its entry', () => {
    const fromOwn = {...gothic, source: 'Own', official: undefined};
    expect(
      withDeclaredOfficial(
        project({cwd: cacheDir}),
        [],
        result([fromOwn]),
        declares([
          ['@astryxdesign/theme-gothic', '@astryxdesign/theme-gothic'],
        ]),
        [gothic],
      ),
    ).toEqual([]);
  });

  it('leaves out an official integration that failed to load, even when declared', () => {
    expect(
      withDeclaredOfficial(
        project({
          cwd: cacheDir,
          integrations: [
            {name: '@astryxdesign/theme-gothic', __loadError: 'x'},
          ],
        }),
        [],
        result([gothic]),
        declares([
          ['@astryxdesign/theme-gothic', '@astryxdesign/theme-gothic'],
        ]),
        [gothic],
      ),
    ).toEqual([]);
  });
});

describe('addCommand with the official list', () => {
  const list = [
    official('@astryxdesign/theme-gothic', {pin: '0.6.8'}),
    official('@astryxdesign/theme-matcha', {pin: '^0.6.8'}),
    official('@astryxdesign/theme-stone', {pin: undefined}),
    official('@astryxdesign/charts', {pin: '0.7.2-canary.abc1234'}),
  ];
  const add = () => addCommand(project({cwd: cacheDir}), {official: list});

  it('pins what an official entry names, quoting a range', () => {
    const command = add();
    expect(command('@astryxdesign/theme-gothic')).toMatch(
      / @astryxdesign\/theme-gothic@0\.6\.8$/,
    );
    expect(command('@astryxdesign/theme-matcha')).toMatch(
      / "@astryxdesign\/theme-matcha@\^0\.6\.8"$/,
    );
    expect(command('@astryxdesign/theme-stone')).toMatch(
      / @astryxdesign\/theme-stone$/,
    );
    expect(command('@astryxdesign/charts')).toMatch(
      / @astryxdesign\/charts@0\.7\.2-canary\.abc1234$/,
    );
  });

  it('adds a version that was asked for, and leaves other packages alone', () => {
    const command = add();
    expect(command('@acme/ui')).toMatch(/ @acme\/ui$/);
    expect(command('@astryxdesign/theme-matcha', '0.7.1')).toMatch(
      / @astryxdesign\/theme-matcha@0\.7\.1$/,
    );
  });
});
