// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next.test.mjs
 * @description Verifies that `withAstryx()` routes an app's own
 *   `@astryxdesign/*` imports to the packages' `source` entries. The scoped
 *   module rule only governs requests issued from inside node_modules, so
 *   without the aliases an app resolves the library through `default` to dist
 *   and renders unstyled against source-compiled CSS.
 *
 *   Resolution is asserted through `enhanced-resolve` — the resolver webpack
 *   itself runs — because alias precedence is an ordering property of the
 *   resolver, not of the config object. Reading keys back out of
 *   `config.resolve.alias` cannot tell a winning entry from a shadowed one.
 */

import {describe, it, expect, beforeAll, afterAll, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {withAstryx} = require('./next.js');
const {ResolverFactory, CachedInputFileSystem} = require('enhanced-resolve');

let appDir;

/** Files the fixture package needs on disk for the resolver to accept them. */
const CORE_FILES = [
  'src/index.ts',
  'src/AlertDialog/index.ts',
  'dist/index.js',
  'dist/AlertDialog/index.js',
];

/**
 * A consumer app with `@astryxdesign/core` installed the way npm lays it out,
 * so the helper resolves real manifests rather than the workspace it lives in.
 */
beforeAll(() => {
  // Canonical, not the `mkdtemp` path: on macOS `os.tmpdir()` is under `/var`,
  // a symlink to `/private/var`, and the resolver reports the real path.
  appDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-next-')),
  );
  const coreDir = path.join(appDir, 'node_modules/@astryxdesign/core');
  for (const file of CORE_FILES) {
    const target = path.join(coreDir, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, '');
  }
  fs.writeFileSync(
    path.join(coreDir, 'package.json'),
    JSON.stringify({
      name: '@astryxdesign/core',
      exports: {
        '.': {
          source: './src/index.ts',
          default: './dist/index.js',
        },
        './AlertDialog': {
          source: './src/AlertDialog/index.ts',
          default: './dist/AlertDialog/index.js',
        },
        './reset.css': {default: './src/reset.css'},
        './generated/*': {source: './src/generated/*'},
      },
    }),
  );
  fs.mkdirSync(path.join(appDir, 'src'), {recursive: true});
  fs.writeFileSync(path.join(appDir, 'src/page.tsx'), '');
});

afterAll(() => {
  fs.rmSync(appDir, {recursive: true, force: true});
});

/** Run the helper's webpack hook the way Next.js does. */
function resolveConfig(nextConfig = {}, config = {resolve: {}}) {
  return withAstryx(nextConfig).webpack(config, {dir: appDir});
}

/**
 * Resolve a request from the app's own source, through the resolver webpack
 * uses, under the config `withAstryx()` produced.
 */
function resolveFromApp(request, callerResolve = {}) {
  const {resolve} = resolveConfig({}, {resolve: callerResolve});
  const resolver = ResolverFactory.createResolver({
    fileSystem: new CachedInputFileSystem(fs, 4000),
    extensions: ['.ts', '.tsx', '.js'],
    conditionNames: ['import', 'default'],
    alias: resolve.alias,
    useSyncFileSystemCalls: true,
  });
  return resolver.resolveSync({}, path.join(appDir, 'src'), request);
}

/**
 * The same, for an alias the caller contributes from its own `webpack` hook —
 * the composition path a Next config takes when it wraps `withAstryx()`.
 */
function resolveFromAppWithHook(request, hookAlias) {
  const {resolve} = withAstryx({
    webpack: cfg => {
      Object.assign(cfg.resolve.alias, hookAlias);
      return cfg;
    },
  }).webpack({resolve: {alias: {}}}, {dir: appDir});
  const resolver = ResolverFactory.createResolver({
    fileSystem: new CachedInputFileSystem(fs, 4000),
    extensions: ['.ts', '.tsx', '.js'],
    conditionNames: ['import', 'default'],
    alias: resolve.alias,
    useSyncFileSystemCalls: true,
  });
  return resolver.resolveSync({}, path.join(appDir, 'src'), request);
}

/** The installed fixture's absolute path for one of its files. */
function corePath(...segments) {
  return path.join(appDir, 'node_modules/@astryxdesign/core', ...segments);
}

describe('withAstryx', () => {
  // Every case in this block is a config that resolves successfully, so none of
  // them may warn. Asserting it here rather than per-test means a future
  // coverage check that misreads a working alias — as one did for wildcards —
  // fails the suite instead of quietly logging into it.
  let warned;
  beforeEach(() => {
    warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    expect(warned).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('resolves the package root to its source entry', () => {
    expect(resolveFromApp('@astryxdesign/core')).toBe(corePath('src/index.ts'));
  });

  it('resolves documented subpath entry points, not just the root', () => {
    expect(resolveFromApp('@astryxdesign/core/AlertDialog')).toBe(
      corePath('src/AlertDialog/index.ts'),
    );
  });

  it('lets a caller prefix alias win over the generated entries', () => {
    const custom = path.join(appDir, 'custom');
    fs.mkdirSync(custom, {recursive: true});
    fs.writeFileSync(path.join(custom, 'index.js'), '');

    expect(
      resolveFromApp('@astryxdesign/core', {
        alias: {'@astryxdesign/core': custom},
      }),
    ).toBe(path.join(custom, 'index.js'));
  });

  it('lets a caller prefix alias win for subpaths too', () => {
    const custom = path.join(appDir, 'custom');
    fs.mkdirSync(path.join(custom, 'AlertDialog'), {recursive: true});
    fs.writeFileSync(path.join(custom, 'AlertDialog/index.js'), '');

    expect(
      resolveFromApp('@astryxdesign/core/AlertDialog', {
        alias: {'@astryxdesign/core': custom},
      }),
    ).toBe(path.join(custom, 'AlertDialog/index.js'));
  });

  it('lets a caller wildcard alias win over the generated entries', () => {
    const custom = path.join(appDir, 'custom');
    fs.mkdirSync(custom, {recursive: true});
    fs.writeFileSync(path.join(custom, 'index.js'), '');

    expect(
      resolveFromApp('@astryxdesign/core', {
        alias: {'@astryxdesign/*': custom},
      }),
    ).toBe(path.join(custom, 'index.js'));
  });

  it('lets a caller wildcard alias win for subpaths too', () => {
    const custom = path.join(appDir, 'custom');
    fs.mkdirSync(path.join(custom, 'core/AlertDialog'), {recursive: true});
    fs.writeFileSync(path.join(custom, 'core/AlertDialog/index.js'), '');

    // A wildcard target substitutes the matched part, so the subpath survives;
    // a plain target collapses every request onto the one directory.
    expect(
      resolveFromApp('@astryxdesign/core/AlertDialog', {
        alias: {'@astryxdesign/*': path.join(custom, '*')},
      }),
    ).toBe(path.join(custom, 'core/AlertDialog/index.js'));
  });

  it('resolves through a symlinked app root', () => {
    const link = path.join(
      path.dirname(appDir),
      `${path.basename(appDir)}-link`,
    );
    try {
      fs.symlinkSync(appDir, link, 'dir');
    } catch {
      return;
    }
    const {resolve} = withAstryx({}).webpack({resolve: {}}, {dir: link});
    const resolver = ResolverFactory.createResolver({
      fileSystem: new CachedInputFileSystem(fs, 4000),
      extensions: ['.ts', '.tsx', '.js'],
      conditionNames: ['import', 'default'],
      alias: resolve.alias,
      useSyncFileSystemCalls: true,
    });

    expect(
      resolver.resolveSync({}, path.join(link, 'src'), '@astryxdesign/core'),
    ).toBe(corePath('src/index.ts'));

    fs.unlinkSync(link);
  });

  it('lets a caller exact alias win for the bare specifier', () => {
    const pinned = corePath('dist/index.js');

    expect(
      resolveFromApp('@astryxdesign/core', {
        alias: {'@astryxdesign/core$': pinned},
      }),
    ).toBe(pinned);
  });

  it('keeps the generated subpaths when the caller pins only the root', () => {
    expect(
      resolveFromApp('@astryxdesign/core/AlertDialog', {
        alias: {'@astryxdesign/core$': corePath('dist/index.js')},
      }),
    ).toBe(corePath('src/AlertDialog/index.ts'));
  });

  it('preserves an array-shaped caller alias', () => {
    const pinned = corePath('dist/index.js');
    const {resolve} = resolveConfig(
      {},
      {resolve: {alias: [{name: '@astryxdesign/core', alias: pinned}]}},
    );

    expect(Array.isArray(resolve.alias)).toBe(true);
    expect(resolve.alias[0]).toEqual({
      name: '@astryxdesign/core',
      alias: pinned,
    });
    expect(
      resolve.alias.some(
        entry => entry.name === '@astryxdesign/core/AlertDialog',
      ),
    ).toBe(false);
  });

  it('skips export keys that ship no source condition', () => {
    const {resolve} = resolveConfig();

    expect(resolve.alias).not.toHaveProperty('@astryxdesign/core/reset.css$');
  });

  it('skips wildcard subpaths, which an exact alias cannot express', () => {
    const {resolve} = resolveConfig();

    const wildcards = Object.keys(resolve.alias).filter(request =>
      request.includes('*'),
    );
    expect(wildcards).toEqual([]);
  });

  it('leaves non-astryx requests to their normal resolution', () => {
    const {resolve} = resolveConfig();

    const foreign = Object.keys(resolve.alias).filter(
      request => !request.startsWith('@astryxdesign/'),
    );
    expect(foreign).toEqual([]);
  });

  it('keeps the global conditions as Next resolved them', () => {
    const {resolve} = resolveConfig(
      {},
      {resolve: {conditionNames: ['import']}},
    );

    expect(resolve.conditionNames).toEqual(['import']);
  });

  it('still scopes the source condition to astryx modules', () => {
    const {module: mod} = resolveConfig();

    expect(mod.rules[0].resolve.conditionNames).toEqual(['source', '...']);
    expect('@astryxdesign/core'.match(mod.rules[0].test)).toBeNull();
    expect(
      '/app/node_modules/@astryxdesign/core/src/index.ts'.match(
        mod.rules[0].test,
      ),
    ).not.toBeNull();
  });

  it('lets a prefix alias from the caller webpack hook win', () => {
    const custom = path.join(appDir, 'custom');
    fs.mkdirSync(path.join(custom, 'AlertDialog'), {recursive: true});
    fs.writeFileSync(path.join(custom, 'index.js'), '');
    fs.writeFileSync(path.join(custom, 'AlertDialog/index.js'), '');

    expect(
      resolveFromAppWithHook('@astryxdesign/core', {
        '@astryxdesign/core': custom,
      }),
    ).toBe(path.join(custom, 'index.js'));
    expect(
      resolveFromAppWithHook('@astryxdesign/core/AlertDialog', {
        '@astryxdesign/core': custom,
      }),
    ).toBe(path.join(custom, 'AlertDialog/index.js'));
  });

  it('lets a wildcard alias from the caller webpack hook win', () => {
    const custom = path.join(appDir, 'custom');
    fs.mkdirSync(path.join(custom, 'core/AlertDialog'), {recursive: true});
    fs.writeFileSync(path.join(custom, 'core/index.js'), '');
    fs.writeFileSync(path.join(custom, 'core/AlertDialog/index.js'), '');

    expect(
      resolveFromAppWithHook('@astryxdesign/core', {
        '@astryxdesign/*': path.join(custom, '*'),
      }),
    ).toBe(path.join(custom, 'core/index.js'));
    expect(
      resolveFromAppWithHook('@astryxdesign/core/AlertDialog', {
        '@astryxdesign/*': path.join(custom, '*'),
      }),
    ).toBe(path.join(custom, 'core/AlertDialog/index.js'));
  });

  it('lets an exact alias from the caller webpack hook win', () => {
    const pinned = corePath('dist/index.js');

    expect(
      resolveFromAppWithHook('@astryxdesign/core', {
        '@astryxdesign/core$': pinned,
      }),
    ).toBe(pinned);
  });

  it('still applies the generated entries the hook did not claim', () => {
    expect(
      resolveFromAppWithHook('@astryxdesign/core', {'other-pkg': '/elsewhere'}),
    ).toBe(corePath('src/index.ts'));
  });

  it('tolerates a caller webpack hook that returns nothing', () => {
    const config = withAstryx({webpack: () => {}}).webpack(
      {resolve: {alias: {}}},
      {dir: appDir},
    );

    expect(config.resolve.alias['@astryxdesign/core$']).toBe(
      corePath('src/index.ts'),
    );
  });

  it('runs the caller webpack hook last', () => {
    const config = resolveConfig({
      webpack: cfg => ({...cfg, marker: true}),
    });

    expect(config.marker).toBe(true);
    expect(config.resolve.alias['@astryxdesign/core$']).toBeDefined();
  });
});

describe('withAstryx bundler guard', () => {
  afterEach(() => {
    delete process.env.TURBOPACK;
    vi.restoreAllMocks();
  });

  it('refuses to build a config under Turbopack', () => {
    process.env.TURBOPACK = '1';
    expect(() => withAstryx()).toThrow(/requires the webpack bundler/);
  });

  it('names both ways out in the message', () => {
    process.env.TURBOPACK = '1';
    // The two supported routes: keep the source build and pick webpack, or drop
    // the source build entirely and consume the pre-built package.
    expect(() => withAstryx()).toThrow(/--webpack/);
    expect(() => withAstryx()).toThrow(/astryx\.css/);
  });

  it('refuses before touching the caller config', () => {
    process.env.TURBOPACK = '1';
    const webpack = vi.fn();
    expect(() => withAstryx({webpack})).toThrow();
    expect(webpack).not.toHaveBeenCalled();
  });

  it('builds normally when Turbopack is not in play', () => {
    expect(() => withAstryx()).not.toThrow();
  });
});

describe('withAstryx alias coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when nothing routes the packages at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Nothing installed and no caller alias, so the merged map claims none of
    // the packages — the pre-0.5.3 config, rather than a partial one.
    const empty = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-none-')),
    );
    try {
      withAstryx().webpack({resolve: {}}, {dir: empty});
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toMatch(/no alias routes/);
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });

  it('stays quiet when at least one package resolves', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Only @astryxdesign/core is installed in the fixture; theme-neutral and
    // lab are absent and skipped. A partial map is the normal case, not a fault.
    resolveConfig();
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet when a caller alias already routes the packages', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Nothing installed, so this helper generates nothing — but the caller has
    // routed the packages itself, which is a working config with nothing to
    // warn about. The check is on the merged alias map, not on what we
    // generated.
    const empty = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-caller-')),
    );
    try {
      withAstryx().webpack(
        {
          resolve: {
            alias: {'@astryxdesign/core': path.join(empty, 'vendored')},
          },
        },
        {dir: empty},
      );
      expect(warn).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });

  it('stays quiet for an array-shaped caller alias too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const empty = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-caller-arr-')),
    );
    try {
      withAstryx().webpack(
        {
          resolve: {
            alias: [
              {
                name: '@astryxdesign/core',
                onlyModule: false,
                alias: path.join(empty, 'vendored'),
              },
            ],
          },
        },
        {dir: empty},
      );
      expect(warn).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });

  // A scope-level key matches no package name as a string, but webpack resolves
  // `@astryxdesign/core` through it — the key is an ancestor of the request.
  // An exact key restricted to the bare scope matches only `@astryxdesign`,
  // which nothing imports, so it routes no package and must not buy silence.
  // These need an app with nothing installed: with a package present the
  // generated entries route it and there is correctly nothing to report.
  const ineffective = (label, build) =>
    it(`warns for an exact scope-only alias ${label}`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-exact-')),
      );
      try {
        build(dir, path.join(dir, 'customRoot'));
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0][0]).toMatch(/no alias routes/);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });

  ineffective('in the config', (dir, target) =>
    withAstryx().webpack({resolve: {alias: {'@astryxdesign$': target}}}, {dir}),
  );

  ineffective('in array form', (dir, target) =>
    withAstryx().webpack(
      {
        resolve: {
          alias: [{name: '@astryxdesign', onlyModule: true, alias: target}],
        },
      },
      {dir},
    ),
  );

  ineffective('from the caller webpack hook', (dir, target) =>
    withAstryx({
      webpack: cfg => {
        cfg.resolve.alias['@astryxdesign$'] = target;
        return cfg;
      },
    }).webpack({resolve: {alias: {}}}, {dir}),
  );

  // The boundary: exactness removes the ancestor case and only that one, so an
  // exact key at or below a package still routes a real request.
  const effectiveExact = (label, build) =>
    it(`stays quiet for an exact alias ${label}`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-exact-ok-')),
      );
      try {
        build(dir, path.join(dir, 'customRoot'));
        expect(warn).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });

  effectiveExact('on the package itself', (dir, target) =>
    withAstryx().webpack(
      {resolve: {alias: {'@astryxdesign/core$': target}}},
      {dir},
    ),
  );

  effectiveExact('on the package, array form', (dir, target) =>
    withAstryx().webpack(
      {
        resolve: {
          alias: [
            {name: '@astryxdesign/core', onlyModule: true, alias: target},
          ],
        },
      },
      {dir},
    ),
  );

  effectiveExact('on a subpath under the package', (dir, target) =>
    withAstryx().webpack(
      {resolve: {alias: {'@astryxdesign/core/Badge$': target}}},
      {dir},
    ),
  );

  const scoped = (label, build) =>
    it(`stays quiet for a scope-prefix alias ${label}`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-scope-')),
      );
      try {
        build(dir, path.join(dir, 'customRoot'));
        expect(warn).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });

  scoped('in the config', (dir, target) =>
    withAstryx().webpack({resolve: {alias: {'@astryxdesign': target}}}, {dir}),
  );

  scoped('in array form', (dir, target) =>
    withAstryx().webpack(
      {
        resolve: {
          alias: [{name: '@astryxdesign', onlyModule: false, alias: target}],
        },
      },
      {dir},
    ),
  );

  scoped('from the caller webpack hook', (dir, target) =>
    withAstryx({
      webpack: cfg => {
        cfg.resolve.alias['@astryxdesign'] = target;
        return cfg;
      },
    }).webpack({resolve: {alias: {}}}, {dir}),
  );

  it('stays quiet when the caller routes them from its webpack hook', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const empty = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-caller-hook-')),
    );
    try {
      withAstryx({
        webpack: cfg => {
          cfg.resolve.alias['@astryxdesign/core'] = path.join(
            empty,
            'vendored',
          );
          return cfg;
        },
      }).webpack({resolve: {alias: {}}}, {dir: empty});
      expect(warn).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });
});

describe('withAstryx under symlinked installs', () => {
  let root;

  /** Write files under `dir`, creating directories as needed. */
  function writeFiles(dir, files) {
    for (const [file, contents] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
      fs.writeFileSync(path.join(dir, file), contents);
    }
  }

  /** A minimal `@astryxdesign/core` whose source imports a dependency. */
  const coreFiles = {
    'package.json': JSON.stringify({
      name: '@astryxdesign/core',
      exports: {'.': {source: './src/index.ts', default: './dist/index.js'}},
    }),
    'src/index.ts': "import 'intl-messageformat';\n",
    'dist/index.js': '',
  };

  /** Link `target` at `link`, the way pnpm links a package. */
  function link(target, linkPath) {
    fs.mkdirSync(path.dirname(linkPath), {recursive: true});
    fs.symlinkSync(target, linkPath, 'junction');
  }

  /** Resolve `request` from `dir` with the resolver options webpack gets. */
  function resolveWith(resolve, dir, request) {
    const resolver = ResolverFactory.createResolver({
      fileSystem: new CachedInputFileSystem(fs, 4000),
      extensions: ['.ts', '.tsx', '.js'],
      conditionNames: ['import', 'default'],
      alias: resolve.alias,
      ...('symlinks' in resolve ? {symlinks: resolve.symlinks} : {}),
      useSyncFileSystemCalls: true,
    });
    return resolver.resolveSync({}, dir, request);
  }

  beforeAll(() => {
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-next-links-')),
    );
  });

  afterAll(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it("resolves a package's own dependencies under pnpm's isolated layout", () => {
    // pnpm keeps each package and its dependencies side by side in its store,
    // and links only the app's direct dependencies into `node_modules`.
    const app = path.join(root, 'isolated');
    const store = path.join(
      app,
      'node_modules/.pnpm/@astryxdesign+core@1.0.0/node_modules',
    );
    writeFiles(path.join(store, '@astryxdesign/core'), coreFiles);
    writeFiles(path.join(store, 'intl-messageformat'), {
      'package.json': JSON.stringify({name: 'intl-messageformat'}),
      'index.js': '',
    });
    link(
      path.join(store, '@astryxdesign/core'),
      path.join(app, 'node_modules/@astryxdesign/core'),
    );
    fs.mkdirSync(path.join(app, 'src'));

    const {resolve} = withAstryx({}).webpack({resolve: {}}, {dir: app});
    const entry = resolveWith(
      resolve,
      path.join(app, 'src'),
      '@astryxdesign/core',
    );

    expect(
      resolveWith(resolve, path.dirname(entry), 'intl-messageformat'),
    ).toBe(path.join(store, 'intl-messageformat/index.js'));
  });

  it("scopes the source condition to a workspace link's real path", () => {
    // A workspace package links from outside any `node_modules`, so its real
    // path has no `node_modules/@astryxdesign/` segment.
    const workspace = path.join(root, 'workspace');
    const app = path.join(workspace, 'apps/site');
    writeFiles(path.join(workspace, 'packages/core'), coreFiles);
    link(
      path.join(workspace, 'packages/core'),
      path.join(app, 'node_modules/@astryxdesign/core'),
    );

    const config = withAstryx({}).webpack({resolve: {}}, {dir: app});
    const [rule] = config.module.rules;
    // Webpack's condition semantics: a RegExp tests the path, a string
    // matches it as a prefix.
    const matches = file =>
      [rule.test]
        .flat()
        .some(condition =>
          typeof condition === 'string'
            ? file.startsWith(condition)
            : condition.test(file),
        );

    expect(rule.resolve.conditionNames).toEqual(['source', '...']);
    expect(matches(path.join(workspace, 'packages/core/src/index.ts'))).toBe(
      true,
    );
    expect(matches(path.join(workspace, 'packages/core-x/src/index.ts'))).toBe(
      false,
    );
    expect(matches(path.join(app, 'src/page.tsx'))).toBe(false);
  });
});
