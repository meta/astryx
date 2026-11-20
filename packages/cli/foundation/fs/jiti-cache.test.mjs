// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file jiti-cache.test.mjs
 * @input A per-user cache folder under a temporary XDG_CACHE_HOME
 * @output The copies of transpiled code the CLI keeps: the user's own 0700
 *   folder, or nothing on disk; one copy per source text and settings, and
 *   per file for text with "meta"; errors that name the real file; each
 *   write trimming only its subfolder; the old single folder never touched
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const posix = process.platform !== 'win32';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {string} */
let home;
/** @type {Record<string, string | undefined>} */
let saved;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-jiti-cache-'));
  saved = {
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    JITI_FS_CACHE: process.env.JITI_FS_CACHE,
  };
  process.env.XDG_CACHE_HOME = home;
  delete process.env.JITI_FS_CACHE;
  vi.resetModules();
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  fs.rmSync(home, {recursive: true, force: true});
});

/** @returns {Promise<typeof import('./jiti-cache.mjs')>} */
const load = () => import('./jiti-cache.mjs');

/** jiti's own transform, which a loader uses when it is given none. */
const jitiTransform = require('jiti').createJiti(import.meta.url, {
  fsCache: false,
  moduleCache: false,
}).options.transform;

/**
 * The settings jiti hands a transform for a TypeScript module.
 * @param {string} source
 * @param {string} filename
 */
const settings = (source, filename) => ({
  babel: {},
  interopDefault: true,
  source,
  filename,
  ts: true,
  async: true,
  jsx: false,
});

/**
 * Every copy under the folder, by its path relative to the folder.
 * @param {string} dir
 * @returns {string[]}
 */
const copiesIn = dir =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, {recursive: true})
        .map(String)
        .filter(name => name.endsWith('.js'))
        .sort()
    : [];

/**
 * Write `bytes` bytes at `file`, made `age` seconds ago.
 * @param {string} file
 * @param {number} bytes
 * @param {number} age
 */
const writeAged = (file, bytes, age) => {
  fs.writeFileSync(file, 'x'.repeat(bytes));
  const time = new Date(Date.now() - age * 1000);
  fs.utimesSync(file, time, time);
};

/** A copy's name in its subfolder: 62 hex digits. */
const copyFile = (/** @type {string} */ c) => `${c.repeat(62)}.js`;

/**
 * Note every path passed to the named `node:fs` functions while `fn` runs,
 * as module imports of `node:fs` see them.
 * @param {string[]} names
 * @param {() => Promise<void> | void} fn
 * @returns {Promise<{name: string, at: string}[]>}
 */
async function fsCalls(names, fn) {
  const real = require('node:fs');
  /** @type {{name: string, at: string}[]} */
  const calls = [];
  const originals = names.map(name => [name, real[name]]);
  for (const [name, original] of originals) {
    real[name] = (/** @type {any[]} */ ...args) => {
      if (typeof args[0] === 'string') calls.push({name, at: args[0]});
      return original.apply(real, args);
    };
  }
  syncBuiltinESMExports();
  try {
    await fn();
  } finally {
    for (const [name, original] of originals) real[name] = original;
    syncBuiltinESMExports();
  }
  return calls;
}

describe.skipIf(!posix || process.platform === 'darwin')('jiti cache', () => {
  it("makes the user's own 0700 folder on first use and uses it at once", async () => {
    const {jitiCacheOptions} = await load();
    const {transpiledCacheDir} = await import('../env/user-dirs.mjs');
    const dir = path.join(home, 'astryx', 'transpiled');
    expect(transpiledCacheDir()).toBe(dir);
    const options = jitiCacheOptions();
    expect(options.fsCache).toBe(false);
    expect(typeof options.transform).toBe('function');
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('keeps nothing on disk when the folder is open to others', async () => {
    const dir = path.join(home, 'astryx', 'transpiled');
    fs.mkdirSync(dir, {recursive: true});
    fs.chmodSync(dir, 0o755);
    const {jitiCacheOptions} = await load();
    expect(jitiCacheOptions()).toEqual({fsCache: false});
  });

  it('keeps nothing on disk when the folder is a link', async () => {
    const real = path.join(home, 'elsewhere');
    fs.mkdirSync(real, {mode: 0o700});
    fs.mkdirSync(path.join(home, 'astryx'), {recursive: true});
    fs.symlinkSync(real, path.join(home, 'astryx', 'transpiled'));
    const {jitiCacheOptions} = await load();
    expect(jitiCacheOptions()).toEqual({fsCache: false});
  });

  it('keeps nothing on disk when the folder cannot be made', async () => {
    fs.writeFileSync(path.join(home, 'astryx'), 'not a folder');
    const {jitiCacheOptions} = await load();
    expect(jitiCacheOptions()).toEqual({fsCache: false});
  });

  it('leaves a set JITI_FS_CACHE to jiti', async () => {
    process.env.JITI_FS_CACHE = path.join(home, 'mine');
    const {jitiCacheOptions} = await load();
    expect(jitiCacheOptions()).toEqual({});
    expect(fs.existsSync(path.join(home, 'astryx'))).toBe(false);
  });

  it('keeps the copy of a TypeScript module the CLI loads, in one subfolder', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-jiti-ts-'));
    try {
      const file = path.join(project, 'manifest.ts');
      fs.writeFileSync(file, 'const n: number = 41;\nexport default n + 1;\n');
      const {importUserModule} = await import('./module-loader.mjs');
      expect((await importUserModule(file)).default).toBe(42);
      const copies = copiesIn(path.join(home, 'astryx', 'transpiled'));
      expect(copies).toHaveLength(1);
      expect(copies[0]).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{62}\.js$/);
    } finally {
      fs.rmSync(project, {recursive: true, force: true});
    }
  });

  it('reads a kept copy instead of transpiling, and gives the same code', async () => {
    const {keptTransform} = await load();
    const dir = path.join(home, 'kept');
    const transform = keptTransform(dir);
    const opts = settings('export const n: number = 1;\n', '/a/n.ts');
    const made = transform(opts);
    expect(made.code).toBe(jitiTransform(opts).code);
    const [copy] = copiesIn(dir);
    const before = fs.statSync(path.join(dir, copy));
    const read = transform(opts);
    expect(read).toEqual({code: made.code});
    const after = fs.statSync(path.join(dir, copy));
    expect([after.ino, after.mtimeMs]).toEqual([before.ino, before.mtimeMs]);
  });

  it('shares one copy for the same file in many folders', async () => {
    const roots = [1, 2, 3].map(() =>
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-jiti-same-')),
    );
    try {
      const {importUserModule} = await import('./module-loader.mjs');
      for (const root of roots) {
        const file = path.join(root, 't', 't.theme.ts');
        fs.mkdirSync(path.dirname(file));
        fs.writeFileSync(file, "export const name: string = 't';\n");
        expect((await importUserModule(file)).name).toBe('t');
      }
      expect(copiesIn(path.join(home, 'astryx', 'transpiled'))).toHaveLength(1);
    } finally {
      for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('keeps a copy per file for text with "meta", each holding its own path', async () => {
    const roots = [1, 2].map(() =>
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-jiti-meta-')),
    );
    try {
      const {importUserModule} = await import('./module-loader.mjs');
      for (const root of roots) {
        const file = path.join(root, 'where.ts');
        fs.writeFileSync(
          file,
          'export const url: string = import.meta.url;\nexport const dir: string = import . meta.dirname;\n',
        );
        const mod = await importUserModule(file);
        expect(mod.url).toBe(pathToFileURL(file).href);
        expect(mod.dir).toBe(root);
      }
      expect(copiesIn(path.join(home, 'astryx', 'transpiled'))).toHaveLength(2);
    } finally {
      for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('names the real file in an error from a copy another folder made', async () => {
    const roots = [1, 2].map(() =>
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-jiti-throw-')),
    );
    try {
      const {importUserModule} = await import('./module-loader.mjs');
      const files = roots.map(root => path.join(root, 'boom.ts'));
      for (const file of files) {
        fs.writeFileSync(
          file,
          "export function boom(): never {\n  throw new Error('boom');\n}\n",
        );
      }
      await importUserModule(files[0]);
      const {boom} = await importUserModule(files[1]);
      expect(copiesIn(path.join(home, 'astryx', 'transpiled'))).toHaveLength(1);
      let stack = '';
      try {
        boom();
      } catch (error) {
        stack = String(/** @type {Error} */ (error).stack);
      }
      expect(stack).toContain(`${files[1]}:2`);
      expect(stack).not.toContain(files[0]);
    } finally {
      for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('makes a copy again when the kept one cannot be read whole', async () => {
    const {keptTransform} = await load();
    const dir = path.join(home, 'kept');
    const transform = keptTransform(dir);
    const opts = settings('export const n: number = 2;\n', '/a/n.ts');
    const made = transform(opts);
    const file = path.join(dir, copiesIn(dir)[0]);
    // Cut short, as a write that stopped would leave it.
    const whole = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, whole.slice(0, 20));
    expect(transform(opts).code).toBe(made.code);
    expect(fs.readFileSync(file, 'utf8')).toBe(whole);
    // Gone, as another run's trim would leave it.
    fs.rmSync(file);
    expect(transform(opts).code).toBe(made.code);
    expect(fs.readFileSync(file, 'utf8')).toBe(whole);
  });

  it('uses a copy larger than its subfolder share for the run but never keeps it', async () => {
    const {keptTransform} = await load();
    const dir = path.join(home, 'kept');
    const transform = keptTransform(dir, {limit: 300});
    const big = settings(
      `export const text: string = '${'y'.repeat(400)}';\n`,
      '/a/big.ts',
    );
    expect(transform(big).code).toBe(jitiTransform(big).code);
    expect(copiesIn(dir)).toEqual([]);
    const small = settings('export const n: number = 3;\n', '/a/small.ts');
    transform(small);
    expect(copiesIn(dir)).toHaveLength(1);
  });

  it('keeps nothing for settings that are not plain data, or a failed transpile', async () => {
    const {keptTransform} = await load();
    const dir = path.join(home, 'kept');
    const transform = keptTransform(dir);
    const withPlugin = {
      ...settings('export const n: number = 4;\n', '/a/p.ts'),
      babel: {plugins: [() => ({visitor: {}})]},
    };
    expect(transform(withPlugin).code).toBe(jitiTransform(withPlugin).code);
    const broken = settings('export const = ;\n', '/a/broken.ts');
    const failed = transform(broken);
    expect(failed.error).toBeDefined();
    expect(failed.code).toContain('/a/broken.ts');
    expect(copiesIn(dir)).toEqual([]);
  });

  it('names a copy for the source text, every setting, and the file only for text with "meta"', async () => {
    const {copyName} = await load();
    const base = settings('export const n: number = 5;\n', '/a/n.ts');
    const name = copyName(base);
    expect(copyName({...base, filename: '/b/elsewhere/n.ts'})).toBe(name);
    expect(
      copyName({...base, source: 'export const n: number = 6;\n'}),
    ).not.toBe(name);
    for (const change of [
      {ts: false},
      {async: false},
      {jsx: true},
      {interopDefault: false},
      {babel: {compact: true}},
      {filename: '/a/n.tsx'},
    ]) {
      expect(copyName({...base, ...change})).not.toBe(name);
    }
    const meta = settings(
      'export const u: string = import.meta.url;\n',
      '/a/u.ts',
    );
    expect(copyName({...meta, filename: '/b/u.ts'})).not.toBe(copyName(meta));
    expect(copyName({...base, babel: {plugins: [() => ({})]}})).toBeNull();
    expect(copyName({...base, babel: {compact: -0}})).toBeNull();
    // A setting left undefined names its own copy.
    const unset = copyName({...base, babel: {compact: undefined}});
    expect(unset).toMatch(/^[0-9a-f]{64}$/);
    expect(unset).not.toBe(name);
  });

  it('trims only the subfolder it writes, the copies made longest ago first, never the new one', async () => {
    const {trimSubfolder} = await load();
    const dir = path.join(home, 'kept');
    const [mine, other] = ['aa', 'bb'].map(sub => path.join(dir, sub));
    for (const folder of [mine, other]) fs.mkdirSync(folder, {recursive: true});
    const kept = path.join(mine, copyFile('0'));
    writeAged(kept, 100, 500);
    writeAged(path.join(mine, copyFile('1')), 100, 300);
    writeAged(path.join(mine, copyFile('2')), 100, 200);
    writeAged(path.join(mine, copyFile('3')), 100, 100);
    writeAged(path.join(other, copyFile('4')), 400, 900);
    trimSubfolder(mine, kept, 250);
    expect(fs.readdirSync(mine).sort()).toEqual([copyFile('0'), copyFile('3')]);
    expect(fs.readdirSync(other)).toEqual([copyFile('4')]);
  });

  it('reads only the subfolder it writes, and none it makes, never the whole folder', async () => {
    const {copyName, keptTransform} = await load();
    const dir = path.join(home, 'kept');
    const transform = keptTransform(dir);
    // Three sources whose copies share one subfolder, and one in another.
    /** @type {string[]} */
    const same = [];
    let other = '';
    for (let i = 0; same.length < 3 || !other; i++) {
      const source = `export const v: number = ${i};\n`;
      const sub = copyName(settings(source, '/a/v.ts'))?.slice(0, 2);
      if (sub === 'cd' && same.length < 3) same.push(source);
      else if (sub !== 'cd' && !other) other = source;
    }
    transform(settings(other, '/a/v.ts'));
    const write = (/** @type {string} */ source) =>
      fsCalls(['readdirSync'], () => {
        transform(settings(source, '/a/v.ts'));
      });
    // The write that makes the subfolder reads nothing.
    expect(await write(same[0])).toEqual([]);
    for (const source of same.slice(1)) {
      const listed = (await write(source)).map(call => call.at);
      expect(listed.length).toBeGreaterThan(0);
      expect(new Set(listed)).toEqual(new Set([path.join(dir, 'cd')]));
    }
    expect(copiesIn(dir)).toHaveLength(4);
  });

  it('removes only copies and old unfinished writes: never another file, a link or a folder', async () => {
    const {trimSubfolder} = await load();
    const folder = path.join(home, 'kept', 'cc');
    fs.mkdirSync(folder, {recursive: true});
    const kept = path.join(folder, copyFile('5'));
    writeAged(kept, 10, 10);
    const outside = path.join(home, 'outside.txt');
    fs.writeFileSync(outside, 'outside');
    fs.symlinkSync(outside, path.join(folder, copyFile('6')));
    fs.mkdirSync(path.join(folder, copyFile('7')));
    writeAged(path.join(folder, 'notes.txt'), 500, 9000);
    const oldWrite = `${copyFile('8')}.123.7.tmp`;
    const newWrite = `${copyFile('9')}.456.8.tmp`;
    writeAged(path.join(folder, oldWrite), 10, 3600);
    writeAged(path.join(folder, newWrite), 10, 5);
    trimSubfolder(folder, kept, 1);
    expect(fs.readdirSync(folder).sort()).toEqual(
      [
        copyFile('5'),
        copyFile('6'),
        copyFile('7'),
        newWrite,
        'notes.txt',
      ].sort(),
    );
    expect(fs.readFileSync(outside, 'utf8')).toBe('outside');
  });

  it('never reads, lists or writes the folder earlier CLIs used', async () => {
    const old = path.join(home, 'astryx', 'jiti');
    fs.mkdirSync(old, {recursive: true, mode: 0o700});
    fs.writeFileSync(path.join(old, 'app-manifest.0000000a.mjs'), 'old copy');
    fs.writeFileSync(path.join(old, '.checked'), '1 2');
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-jiti-old-'));
    try {
      const file = path.join(project, 'manifest.ts');
      fs.writeFileSync(file, 'export default 7 as number;\n');
      const calls = await fsCalls(
        [
          'readdirSync',
          'readFileSync',
          'statSync',
          'lstatSync',
          'existsSync',
          'openSync',
          'writeFileSync',
          'unlinkSync',
          'mkdirSync',
          'renameSync',
          'opendirSync',
        ],
        async () => {
          const {importUserModule} = await import('./module-loader.mjs');
          expect((await importUserModule(file)).default).toBe(7);
        },
      );
      expect(calls.filter(call => call.at.startsWith(old))).toEqual([]);
      expect(fs.readdirSync(old).sort()).toEqual([
        '.checked',
        'app-manifest.0000000a.mjs',
      ]);
    } finally {
      fs.rmSync(project, {recursive: true, force: true});
    }
  });

  it('gives every process a whole copy while several write and trim one subfolder', async () => {
    const {copyName} = await load();
    const dir = path.join(home, 'kept');
    // Sources whose copies all land in one subfolder, so every write trims it.
    /** @type {string[]} */
    const sources = [];
    for (let i = 0; sources.length < 24; i++) {
      const source = `export const v: number = ${i};\n`;
      if (copyName(settings(source, '/a/v.ts'))?.startsWith('ab')) {
        sources.push(source);
      }
    }
    const child = `
      const {keptTransform} = await import(${JSON.stringify(pathToFileURL(path.join(here, 'jiti-cache.mjs')).href)});
      const {createRequire} = await import('node:module');
      const require = createRequire(${JSON.stringify(path.join(here, 'jiti-cache.mjs'))});
      const fresh = require('jiti').createJiti(import.meta.url, {fsCache: false, moduleCache: false}).options.transform;
      const sources = ${JSON.stringify(sources)};
      const transform = keptTransform(${JSON.stringify(dir)}, {limit: 1200});
      const opts = source => ({babel: {}, interopDefault: true, source, filename: '/a/v.ts', ts: true, async: true, jsx: false});
      const expected = sources.map(source => fresh(opts(source)).code);
      for (let round = 0; round < 40; round++) {
        sources.forEach((source, i) => {
          if (transform(opts(source)).code !== expected[i]) {
            console.error('partial or wrong copy');
            process.exit(1);
          }
        });
      }
    `;
    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6].map(
        () =>
          new Promise(resolve => {
            const proc = spawn(
              process.execPath,
              ['--input-type=module', '-e', child],
              {
                stdio: ['ignore', 'ignore', 'pipe'],
              },
            );
            let stderr = '';
            proc.stderr.on('data', data => (stderr += data));
            proc.on('close', code => resolve({code, stderr}));
          }),
      ),
    );
    expect(results).toEqual(results.map(() => ({code: 0, stderr: ''})));
    const folder = path.join(dir, 'ab');
    for (const name of fs.readdirSync(folder)) {
      expect(name).toMatch(/^[0-9a-f]{62}\.js$/);
      const text = fs.readFileSync(path.join(folder, name), 'utf8');
      expect(text.endsWith(`/* ab${name.slice(0, 62)} */\n`)).toBe(true);
    }
  }, 120_000);
});
