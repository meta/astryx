// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file self-contained.kept.test.mjs
 * @input A theme folder with a TypeScript icon registry that renders JSX and
 *   imports a TypeScript helper, and an installed-looking CLI whose store
 *   keeps summaries
 * @output The JavaScript a build compiles is read back, with no Babel loaded,
 *   while the source, the rewrites, Babel's environment and Babel's own files
 *   are unchanged; it equals a fresh compile byte for byte; any change to one
 *   of those compiles again; a failed compile keeps nothing
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {performance} from 'node:perf_hooks';

const {TEMP_ROOT} = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    TEMP_ROOT: nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'astryx-kept-compile-test-'),
    ),
  };
});

vi.mock('../../../foundation/fs/paths.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  CLI_ROOT: path.join(TEMP_ROOT, 'node_modules', '@astryxdesign', 'cli'),
}));

/** Each time a compile asks for Babel. */
const babelAsked = vi.hoisted(() => ({count: 0}));

/** Whether Babel's files read as a reinstall while this process runs left them, and when. */
const reinstalled = vi.hoisted(() => ({now: false, at: 0}));

/** Whether a reinstall pointed @babel/core at another copy of @babel/generator. */
const relinked = vi.hoisted(() => ({now: false}));

vi.mock('../../../foundation/fs/read-record.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    // A reinstall rewrites Babel's files: their times are after this process
    // started.
    fileStamp: (/** @type {string} */ file) => {
      const stamp = real.fileStamp(file);
      if (!reinstalled.now || !file.includes(`${path.sep}@babel${path.sep}`))
        return stamp;
      const [size, , , ino] = stamp.split(':');
      return `${size}:${reinstalled.at}:${reinstalled.at}:${ino}`;
    },
    // The old copy stays on disk; only the folder the lookup takes points
    // elsewhere.
    resolvedNow: (/** @type {string} */ file) =>
      relinked.now &&
      file.endsWith(path.join('node_modules', '@babel', 'generator'))
        ? `real:${path.join(path.sep, 'another', '@babel', 'generator')}`
        : real.resolvedNow(file),
  };
});

vi.mock(
  '../../../foundation/runtime/lazy-dependencies.mjs',
  async importOriginal => {
    const real = /** @type {any} */ (await importOriginal());
    return {
      ...real,
      babelCore: () => {
        babelAsked.count++;
        return real.babelCore();
      },
    };
  },
);

/** @type {typeof import('./self-contained.mjs')} */
let selfContained;
/** @type {typeof import('../_adapter.mjs').localModuleFiles} */
let files;
const savedCache = process.env.XDG_CACHE_HOME;
const savedBabelEnv = process.env.BABEL_ENV;
const STORE = path.join(TEMP_ROOT, 'cache', 'astryx', 'catalogs');
const THEME = path.join(TEMP_ROOT, 'theme');

/** The time a stamp needs to settle before a summary is stored, plus margin. */
const SETTLE_WAIT_MS = 2200;

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const ICONS = [
  "import type {ReactNode} from 'react';",
  "import {label} from './helper';",
  "import {size} from './size';",
  'export const icons: Record<string, () => ReactNode> = {',
  '  check: () => <svg aria-label={label("check")} width={size} />,',
  '};',
  '',
].join('\n');

const HELPER = [
  'export function label(name: string): string {',
  '  return `icon ${name}`;',
  '}',
  '',
].join('\n');

/** The kept compiles in the store. */
const keptCompiles = () =>
  fs
    .readdirSync(STORE)
    .filter(name => name.endsWith('.json'))
    .filter(name =>
      String(
        JSON.parse(fs.readFileSync(path.join(STORE, name), 'utf8')).key,
      ).includes('theme-module-javascript'),
    );

/**
 * The modules a build of the theme writes, by file name, and how many times
 * the build asked for Babel.
 * @param {string} [modulesName]
 */
const build = (modulesName = 'theme.modules') => {
  const before = babelAsked.count;
  const {writes} = selfContained.selfContainedImports(
    [
      {
        sourceFile: path.join(THEME, 'theme.ts'),
        bindings: [
          {importPath: './icons', importedName: 'icons', localName: 'icons'},
        ],
      },
    ],
    {
      outDir: path.join(THEME, 'out'),
      modulesDir: path.join(THEME, 'out', modulesName),
      header: () => '// built\n',
      marker: '// built',
      files,
    },
  );
  return {
    modules: Object.fromEntries(
      writes.map(write => [path.basename(write.dest), write.content]),
    ),
    asked: babelAsked.count - before,
  };
};

/**
 * What a build writes with no store to keep anything in.
 * @param {string} [modulesName]
 */
const fresh = (modulesName = 'theme.modules') => {
  const saved = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'no-store');
  try {
    return build(modulesName).modules;
  } finally {
    process.env.XDG_CACHE_HOME = saved;
  }
};

beforeAll(async () => {
  const cli = path.join(TEMP_ROOT, 'node_modules', '@astryxdesign', 'cli');
  fs.mkdirSync(path.join(cli, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(cli, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'kept-compile-test'}),
  );
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'cache');
  fs.mkdirSync(STORE, {recursive: true, mode: 0o700});
  fs.chmodSync(path.join(TEMP_ROOT, 'cache', 'astryx'), 0o700);
  selfContained = await import('./self-contained.mjs');
  ({localModuleFiles: files} = await import('../_adapter.mjs'));
});

beforeEach(() => {
  fs.rmSync(THEME, {recursive: true, force: true});
  fs.mkdirSync(THEME, {recursive: true});
  fs.writeFileSync(path.join(THEME, 'theme.ts'), 'export default {};\n');
  fs.writeFileSync(path.join(THEME, 'icons.tsx'), ICONS);
  fs.writeFileSync(path.join(THEME, 'helper.ts'), HELPER);
  // A plain module, imported as it is: its path from the compiled registry
  // depends on where the compiled modules go.
  fs.writeFileSync(path.join(THEME, 'size.js'), 'export const size = 16;\n');
  for (const name of fs.readdirSync(STORE)) fs.rmSync(path.join(STORE, name));
  if (savedBabelEnv === undefined) delete process.env.BABEL_ENV;
  else process.env.BABEL_ENV = savedBabelEnv;
  reinstalled.now = false;
  relinked.now = false;
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  if (savedBabelEnv === undefined) delete process.env.BABEL_ENV;
  else process.env.BABEL_ENV = savedBabelEnv;
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

describe('the JavaScript a theme build compiles', () => {
  it('is read back without Babel, the same bytes as a fresh compile', async () => {
    await sleep(SETTLE_WAIT_MS);
    const first = build();
    expect(first.asked).toBe(2);
    // The plain module is imported where it is, not compiled.
    expect(Object.keys(first.modules).sort()).toEqual([
      'helper.ts.js',
      'icons.tsx.js',
    ]);
    expect(keptCompiles()).toHaveLength(2);
    const again = build();
    expect(again.asked).toBe(0);
    expect(again.modules).toEqual(first.modules);
    expect(again.modules).toEqual(fresh());
  }, 60_000);

  it("is read back the same with a project's own Babel config beside it", async () => {
    // Never read: the compile passes no config file and no .babelrc.
    fs.writeFileSync(
      path.join(THEME, 'babel.config.json'),
      JSON.stringify({plugins: ['@babel/plugin-transform-arrow-functions']}),
    );
    fs.writeFileSync(path.join(THEME, '.babelrc'), '{"comments": false}');
    await sleep(SETTLE_WAIT_MS);
    const first = build();
    const again = build();
    expect(again.asked).toBe(0);
    expect(again.modules).toEqual(first.modules);
    expect(again.modules).toEqual(fresh());
  }, 60_000);

  it('compiles again after a change to the source, the rewrites, the kind of file, Babel’s environment or one of Babel’s files', async () => {
    await sleep(SETTLE_WAIT_MS);
    build();

    /** @type {Array<[string, () => void, string, number]>} */
    const changes = [
      [
        'an edit to the source of one module',
        () =>
          fs.writeFileSync(
            path.join(THEME, 'helper.ts'),
            HELPER.replace('icon ', 'glyph '),
          ),
        'theme.modules',
        1,
      ],
      [
        "other rewrites of the registry's imports",
        () => {},
        path.join('nested', 'theme.modules'),
        1,
      ],
      [
        "Babel's environment",
        () => {
          process.env.BABEL_ENV = 'production';
        },
        path.join('nested', 'theme.modules'),
        2,
      ],
      [
        "one of Babel's files",
        () => {
          for (const name of keptCompiles()) {
            const file = path.join(STORE, name);
            const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
            // As a reinstall that changed one file of Babel's leaves it.
            stored.stamps[0][1] = 'changed';
            fs.writeFileSync(file, JSON.stringify(stored));
          }
        },
        path.join('nested', 'theme.modules'),
        2,
      ],
      [
        'a module of another kind, with other plugins',
        () =>
          fs.renameSync(
            path.join(THEME, 'helper.ts'),
            path.join(THEME, 'helper.tsx'),
          ),
        path.join('nested', 'theme.modules'),
        2,
      ],
    ];
    for (const [what, change, modulesName, compiles] of changes) {
      change();
      const after = build(modulesName);
      expect({what, asked: after.asked}).toEqual({what, asked: compiles});
      expect(after.modules).toEqual(fresh(modulesName));
      // And read back on the next build.
      expect({what, again: build(modulesName).asked}).toEqual({what, again: 0});
    }
  }, 60_000);

  it('keeps nothing for a module that does not compile', async () => {
    fs.writeFileSync(path.join(THEME, 'helper.ts'), 'export const = ;\n');
    await sleep(SETTLE_WAIT_MS);
    expect(() => build()).toThrow();
    // Only the registry, which compiled, is kept.
    expect(keptCompiles()).toHaveLength(1);
    // The next build compiles the broken module again, and fails again.
    const before = babelAsked.count;
    expect(() => build()).toThrow();
    expect(babelAsked.count - before).toBe(1);
    expect(keptCompiles()).toHaveLength(1);
  }, 60_000);

  it("stamps every file of Babel's code that compiled a module", async () => {
    await sleep(SETTLE_WAIT_MS);
    build();
    const [name] = keptCompiles();
    const {stamps} = JSON.parse(
      fs.readFileSync(path.join(STORE, name), 'utf8'),
    );
    const files = stamps.map((/** @type {[string, string]} */ [file]) => file);
    for (const part of [
      '@babel/core',
      '@babel/generator',
      '@babel/traverse',
      '@babel/parser',
      '@babel/plugin-transform-typescript',
    ]) {
      const stamped = files.some((/** @type {string} */ file) =>
        file.includes(path.join(...part.split('/'))),
      );
      expect({part, stamped}).toEqual({part, stamped: true});
    }
  }, 60_000);

  it('compiles again after a reinstall points @babel/core at another copy of one of its packages', async () => {
    await sleep(SETTLE_WAIT_MS);
    build();
    const [name] = keptCompiles();
    const {stamps} = JSON.parse(
      fs.readFileSync(path.join(STORE, name), 'utf8'),
    );
    // The folder @babel/core's lookup took for @babel/generator is stamped
    // by the real path it resolves to.
    expect(
      stamps.some(
        (/** @type {[string, string]} */ [file, stamp]) =>
          file.endsWith(path.join('node_modules', '@babel', 'generator')) &&
          stamp.startsWith('real:'),
      ),
    ).toBe(true);
    expect(build().asked).toBe(0);
    relinked.now = true;
    expect(build().asked).toBe(2);
  }, 60_000);

  it('keeps nothing compiled by the Babel this process loaded once a reinstall changes its files', async () => {
    await sleep(SETTLE_WAIT_MS);
    build();
    // Babel is loaded; a reinstall writes new files under it.
    reinstalled.now = true;
    // A second before this process started: settled, but within a coarse
    // file system's time step of the start.
    reinstalled.at = performance.timeOrigin - 1000;
    fs.writeFileSync(
      path.join(THEME, 'helper.ts'),
      HELPER.replace('icon ', 'glyph '),
    );
    const after = build();
    // The kept registry no longer matches Babel's files, and the edited
    // helper compiles: both with the Babel loaded before the reinstall.
    expect(after.asked).toBe(2);
    // Neither is kept under the new files' stamps, so the next build in this
    // process compiles them again.
    expect(build().asked).toBe(2);
  }, 60_000);

  it('keeps nothing from a first compile by a Babel loaded another way before a reinstall', async () => {
    // Babel loaded by another part of the build, before any compile.
    createRequire(import.meta.url)('@babel/core');
    reinstalled.now = true;
    // A second before this process started: settled, but within a coarse
    // file system's time step of the start.
    reinstalled.at = performance.timeOrigin - 1000;
    await sleep(SETTLE_WAIT_MS);
    const first = build();
    expect(first.asked).toBe(2);
    expect(keptCompiles()).toHaveLength(0);
    expect(build().asked).toBe(2);
  }, 60_000);
});
