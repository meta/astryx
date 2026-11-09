// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fixtures for the global and project table's tests (spec AST-081
 * FR11): real copies of this CLI, packed the way it is published and placed
 * in every install layout the table names, and a package registry that runs
 * inside the test process.
 *
 * - `packedCli()` unpacks the tarball the node project's global setup packed
 *   once for the run (`npm pack`), or packs one itself when no run did.
 *   `extractTarball` unpacks it with no external tool, so the copies hold
 *   exactly the published files.
 * - `cliTarball()` is that tarball, and `tarballFiles(file)` lists the files
 *   a tarball holds, the published file set, without unpacking it.
 * - `releasePackedCli()` removes what this process unpacked or packed, unless
 *   it sits in the run's folder, which the global teardown removes.
 *   `runFolder()` is that folder, for a suite's own fixture.
 * - `placeCli(dir, version)` puts a copy at `dir`, labeled `version`: every
 *   file is a hard link to the unpacked package except a rewritten
 *   package.json, and its `node_modules` links to this package's installed
 *   dependencies, so a copy costs almost nothing and runs as the release it
 *   is labeled. `recyclePlacedCopies()` gives a test's unchanged copies back
 *   for the next test to move into place.
 * - `globalCli(layout, version)` places one where a package manager or a Node
 *   version manager puts a global install, with an `astryx` command for the
 *   search path.
 * - `seedPackedRelease(cacheDir, version)` puts one in the per-user release
 *   cache with the marker an install leaves.
 * - `startRegistry({latest})` answers package questions for the CLI and Core
 *   from inside this process, the way the cross-platform smoke workflow does,
 *   with no network.
 *
 * @position packages/cli/test-utils — used by test/global-local.test.mjs,
 *   and by the theme build test of a packed CLI with an older Core.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inject} from 'vitest';
import {releaseTree} from '../foundation/release/cache.mjs';
import {packCli} from './pack-cli.mjs';
import {installCore, tempDir, writeJson} from './release-fixtures.mjs';

/** This CLI package's folder. */
export const CLI_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * Each entry of a `.tgz` written by `npm pack`: its path below the leading
 * `package/` folder, its tar type flag, and its contents.
 * @param {string} file
 * @returns {Generator<{rel: string, type: string, body: Buffer}>}
 */
function* tarballEntries(file) {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  let off = 0;
  /** @type {string | null} */
  let longName = null;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every(b => b === 0)) break;
    const field = (/** @type {number} */ start, /** @type {number} */ len) =>
      header
        .subarray(start, start + len)
        .toString('utf8')
        .replace(/\0.*$/su, '');
    let name = field(0, 100);
    const prefix = field(345, 155);
    if (prefix) name = `${prefix}/${name}`;
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156]);
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      const match = /\d+ path=([^\n]+)\n/u.exec(body.toString('utf8'));
      if (match) longName = match[1];
      continue;
    }
    if (type === 'L') {
      longName = body.toString('utf8').replace(/\0.*$/su, '');
      continue;
    }
    if (longName) name = longName;
    longName = null;
    const rel = name.replace(/^[^/]+\//u, '');
    if (!rel || rel.split('/').includes('..')) continue;
    yield {rel, type, body};
  }
}

/**
 * Unpack a `.tgz` written by `npm pack` into `dest`, dropping its leading
 * `package/` folder.
 * @param {string} file
 * @param {string} dest
 */
export function extractTarball(file, dest) {
  for (const entry of tarballEntries(file)) writeEntry(dest, entry);
}

/**
 * Write one tarball entry under `dest`: a folder, or a file with its
 * contents. A script under a `bin` folder is made executable.
 * @param {string} dest
 * @param {{rel: string, type: string, body: Buffer}} entry
 */
function writeEntry(dest, {rel, type, body}) {
  const target = path.join(dest, ...rel.split('/'));
  if (type === '5') {
    fs.mkdirSync(target, {recursive: true});
  } else if (type === '0' || type === '\0') {
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, body);
    if (/\.(?:mjs|cjs|js)$/u.test(rel) && rel.includes('/bin/')) {
      fs.chmodSync(target, 0o755);
    }
  }
}

/**
 * The files a `.tgz` written by `npm pack` holds, by their path below its
 * leading `package/` folder: the package's published file set.
 * @param {string} file
 * @returns {string[]}
 */
export function tarballFiles(file) {
  return [...tarballEntries(file)]
    .filter(({type}) => type === '0' || type === '\0')
    .map(({rel}) => rel);
}

/** @type {string | null} */
let packed = null;

/** @type {string | null} */
let cliTarballFile = null;

/** The folder this process packed its own tarball in, when no run did. */
let ownTarballDir = '';

/**
 * The folder the node project's global setup made for this run, or null when
 * nothing provided one. Its teardown removes the folder once, after every
 * suite, with each unpacked CLI, pooled copy and suite fixture inside it.
 * @returns {string | null}
 */
export function runFolder() {
  let dir;
  try {
    dir = inject('astryxPackedCliRunDir');
  } catch {
    return null;
  }
  return typeof dir === 'string' && fs.existsSync(dir) ? dir : null;
}

/**
 * Whether the unpacked package `dir` sits in the run's folder.
 * @param {string} dir
 */
function inRunFolder(dir) {
  const run = runFolder();
  return Boolean(run && path.dirname(path.dirname(dir)) === run);
}

/**
 * The tarball the node project's global setup packed for this run, or null
 * when nothing provided one, as in another test config.
 * @returns {string | null}
 */
function providedTarball() {
  let tarball;
  try {
    tarball = inject('astryxPackedCliTarball');
  } catch {
    return null;
  }
  return typeof tarball === 'string' && fs.existsSync(tarball) ? tarball : null;
}

/**
 * This CLI's tarball: the one the node project's global setup packed for the
 * run, or one packed once per process when no run packed it.
 * @returns {string} the `.tgz` file
 */
export function cliTarball() {
  if (cliTarballFile) return cliTarballFile;
  const provided = providedTarball();
  if (provided) {
    cliTarballFile = provided;
  } else {
    ownTarballDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-cli-tarball-'),
    );
    cliTarballFile = packCli(ownTarballDir);
  }
  return cliTarballFile;
}

/**
 * This CLI, packed once per run (or once per process when no run packed it)
 * and unpacked once per process.
 * @returns {string} the unpacked package folder
 */
export function packedCli() {
  if (packed) return packed;
  const out = fs.mkdtempSync(
    path.join(runFolder() ?? os.tmpdir(), 'astryx-packed-cli-'),
  );
  packedTarball = cliTarball();
  const dir = path.join(out, 'package');
  extractTarball(packedTarball, dir);
  packed = dir;
  packedRecord = treeRecord(dir, {contents: true});
  return dir;
}

/**
 * Remove the CLI this process unpacked, with the copies given back to its
 * pool, and a tarball it packed itself. Leave what sits in the run's folder:
 * the node project's global teardown removes that once, after every suite.
 */
export function releasePackedCli() {
  if (packed && !inRunFolder(packed)) {
    fs.rmSync(path.dirname(packed), {recursive: true, force: true});
    pool.clear();
    packed = null;
    packedRecord = null;
  }
  if (ownTarballDir) {
    fs.rmSync(ownTarballDir, {recursive: true, force: true});
    ownTarballDir = '';
    cliTarballFile = null;
  }
}

/** The tarball {@link packedCli} made, to unpack again. */
let packedTarball = '';

/**
 * The packed tree as {@link packedCli} unpacked it. Every copy shares its
 * files, so a test that writes into one of them in place changes them all.
 * @type {Map<string, string> | null}
 */
let packedRecord = null;

/**
 * `dir` and each entry below it by its path: its type and mode, and for a
 * file its inode. A file no other copy links, or any file with `contents`,
 * also records its size and modification time. A symbolic link records its
 * target and is not followed.
 * @param {string} dir
 * @param {{contents?: boolean}} [options]
 * @returns {Map<string, string>}
 */
function treeRecord(dir, {contents = false} = {}) {
  /** @type {Map<string, string>} */
  const record = new Map([
    ['.', `dir ${fs.lstatSync(dir, {bigint: true}).mode}`],
  ]);
  /**
   * @param {string} folder
   * @param {string} rel
   */
  const walk = (folder, rel) => {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      const at = path.join(folder, entry.name);
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        record.set(entryRel, `link ${fs.readlinkSync(at)}`);
        continue;
      }
      const stat = fs.lstatSync(at, {bigint: true});
      if (entry.isDirectory()) {
        record.set(entryRel, `dir ${stat.mode}`);
        walk(at, entryRel);
      } else {
        record.set(
          entryRel,
          contents || stat.nlink === 1n
            ? `file ${stat.ino} ${stat.mode} ${stat.size} ${stat.mtimeNs}`
            : `file ${stat.ino} ${stat.mode}`,
        );
      }
    }
  };
  walk(dir, '');
  return record;
}

/**
 * The first path whose entry differs between two records, or null.
 * @param {Map<string, string>} before
 * @param {Map<string, string>} after
 * @returns {string | null}
 */
function firstChange(before, after) {
  return changedPaths(before, after)[0] ?? null;
}

/**
 * Every path whose entry differs between two records, in the order
 * {@link firstChange} finds the first.
 * @param {Map<string, string>} before
 * @param {Map<string, string>} after
 * @returns {string[]}
 */
function changedPaths(before, after) {
  const changed = [];
  for (const [rel, entry] of before) {
    if (after.get(rel) !== entry) changed.push(rel);
  }
  for (const rel of after.keys()) {
    if (!before.has(rel)) changed.push(rel);
  }
  return changed;
}

/**
 * Put each of `paths` below `dir` back as the tarball has it. What is there
 * is removed, and the tarball's entries at or below each path are unpacked
 * again. A path the tarball does not have stays removed.
 * @param {string} dir
 * @param {string} tarball
 * @param {string[]} paths
 */
function restorePaths(dir, tarball, paths) {
  const wanted = new Set(paths);
  // The package folder itself changed: no single entry restores it.
  if (wanted.has('.')) {
    fs.rmSync(dir, {recursive: true, force: true});
    extractTarball(tarball, dir);
    return;
  }
  for (const rel of paths) {
    fs.rmSync(path.join(dir, ...rel.split('/')), {
      recursive: true,
      force: true,
    });
  }
  for (const entry of tarballEntries(tarball)) {
    const parts = entry.rel.split('/');
    if (parts.some((_, i) => wanted.has(parts.slice(0, i + 1).join('/')))) {
      writeEntry(dir, entry);
    }
  }
}

/**
 * Hard-link every file under `from` into `to`, copying across devices. Each
 * folder named in `shared`, by its path below `from`, is one link to that
 * folder instead.
 * @param {string} from
 * @param {string} to
 * @param {ReadonlySet<string>} [shared]
 * @param {string} [rel] - Path of `from` below the top folder.
 */
function linkTree(from, to, shared = new Set(), rel = '') {
  fs.mkdirSync(to, {recursive: true});
  for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory() && shared.has(entryRel)) {
      fs.symlinkSync(
        src,
        dst,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } else if (entry.isDirectory()) linkTree(src, dst, shared, entryRel);
    else {
      try {
        fs.linkSync(src, dst);
      } catch {
        fs.copyFileSync(src, dst);
      }
    }
  }
}

/**
 * Put a copy of the packed CLI at `dir`, labeled `version`. A copy that an
 * earlier test gave back with the same label and options is moved there;
 * otherwise a new one is linked.
 * @param {string} dir the package folder to create
 * @param {string} version
 * The copy leaves out the global copy's background Core step
 * (core-worker.mjs), as a release that predates it does, so no test's run
 * starts a download behind its back; `coreStep: true` keeps it.
 * @param {{engines?: Record<string, string>, coreStep?: boolean}} [options]
 * @returns {{dir: string, bin: string}}
 */
export function placeCli(dir, version, options = {}) {
  const key = JSON.stringify([
    version,
    Boolean(options.coreStep),
    options.engines ?? null,
  ]);
  const ready = fs.existsSync(dir) ? undefined : pool.get(key)?.pop();
  if (ready) {
    fs.mkdirSync(path.dirname(dir), {recursive: true});
    fs.renameSync(ready.dir, dir);
    placed.push({dir, key, record: ready.record});
  } else {
    buildCopy(dir, version, options);
    placed.push({dir, key, record: treeRecord(dir)});
  }
  return {dir, bin: path.join(dir, 'clients', 'cli', 'bin', 'astryx.mjs')};
}

/**
 * Copies that tests gave back, by label and options, each with the record it
 * was placed with. The next placement with the same key moves one.
 * @type {Map<string, {dir: string, record: Map<string, string>}[]>}
 */
const pool = new Map();

/**
 * Copies placed since the last {@link recyclePlacedCopies}.
 * @type {{dir: string, key: string, record: Map<string, string>}[]}
 */
const placed = [];

/** Pooled copies made so far, for unique folder names. */
let pooledCount = 0;

/**
 * Give each copy placed since the last call back to the pool. The next
 * placement of its label then moves it instead of linking its files again.
 * Call it after the test's background steps settle and before its folders go.
 * A copy whose entries changed stays where it is, for its folder's removal.
 * So does every copy when `keep` is false: a step that is still running may
 * still use one.
 * @param {{keep?: boolean}} [options]
 * @throws {Error} when a test wrote into a file every copy shares. The pool is
 * then emptied, and the changed files are unpacked again from the tarball.
 */
export function recyclePlacedCopies({keep = true} = {}) {
  const copies = placed.splice(0);
  if (packed && packedRecord) {
    const changed = changedPaths(
      packedRecord,
      treeRecord(packed, {contents: true}),
    );
    if (changed.length > 0) {
      // Each pooled copy links the changed files, so none is used again. The
      // run's teardown removes their folders; outside a run, they go now.
      pool.clear();
      if (!inRunFolder(packed)) {
        fs.rmSync(path.join(path.dirname(packed), 'pool'), {
          recursive: true,
          force: true,
        });
      }
      // Only the changed paths are unpacked again. Removing and unpacking
      // the whole package rewrites thousands of files, which a busy machine
      // can make outlast the test.
      restorePaths(packed, packedTarball, changed);
      packedRecord = treeRecord(packed, {contents: true});
      throw new Error(
        `A test changed ${changed[0]}, which every placed CLI copy shares. Unlink a copy's file before you write it, as placeCli does for package.json.`,
      );
    }
  }
  if (!keep) return;
  for (const copy of copies) {
    let record;
    try {
      record = treeRecord(copy.dir);
    } catch {
      continue;
    }
    if (firstChange(copy.record, record)) continue;
    const spot = path.join(
      path.dirname(packedCli()),
      'pool',
      String(pooledCount++),
    );
    fs.mkdirSync(path.dirname(spot), {recursive: true});
    try {
      fs.renameSync(copy.dir, spot);
    } catch {
      // Another file system, or a read-only folder: the copy stays put.
      continue;
    }
    const ready = pool.get(copy.key) ?? [];
    ready.push({dir: spot, record: copy.record});
    pool.set(copy.key, ready);
  }
}

/**
 * Link a new copy of the packed CLI at `dir`, labeled `version`.
 * @param {string} dir
 * @param {string} version
 * @param {{engines?: Record<string, string>, coreStep?: boolean}} options
 */
function buildCopy(dir, version, options) {
  const from = packedCli();
  // Templates and icons are two thirds of the packed files, and no module
  // there imports the CLI's code or packages. One link to each serves every
  // copy. Each copy keeps its own code and its other assets.
  linkTree(from, dir, new Set(['assets/templates', 'assets/icons']));
  if (!options.coreStep) {
    fs.rmSync(path.join(dir, 'foundation', 'release', 'core-worker.mjs'), {
      force: true,
    });
  }
  const pkgFile = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  fs.unlinkSync(pkgFile);
  fs.writeFileSync(
    pkgFile,
    `${JSON.stringify({...pkg, version, ...(options.engines ? {engines: options.engines} : {})}, null, 2)}\n`,
  );
  fs.symlinkSync(
    path.join(CLI_DIR, 'node_modules'),
    path.join(dir, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
}

/**
 * Where each layout keeps a global install, relative to a home folder: the
 * package folder and the folder its `astryx` command is in.
 * @type {Record<string, {pkg: string[], bin: string[]}>}
 */
const LAYOUTS = {
  npm: {
    pkg: ['.npm-global', 'lib', 'node_modules', '@astryxdesign', 'cli'],
    bin: ['.npm-global', 'bin'],
  },
  pnpm: {
    pkg: [
      '.local',
      'share',
      'pnpm',
      'global',
      '5',
      'node_modules',
      '@astryxdesign',
      'cli',
    ],
    bin: ['.local', 'share', 'pnpm'],
  },
  nvm: {
    pkg: [
      '.nvm',
      'versions',
      'node',
      'v22.13.0',
      'lib',
      'node_modules',
      '@astryxdesign',
      'cli',
    ],
    bin: ['.nvm', 'versions', 'node', 'v22.13.0', 'bin'],
  },
  fnm: {
    pkg: [
      '.local',
      'share',
      'fnm',
      'node-versions',
      'v24.0.0',
      'installation',
      'lib',
      'node_modules',
      '@astryxdesign',
      'cli',
    ],
    bin: [
      '.local',
      'share',
      'fnm',
      'node-versions',
      'v24.0.0',
      'installation',
      'bin',
    ],
  },
  volta: {
    pkg: [
      '.volta',
      'tools',
      'image',
      'packages',
      '@astryxdesign',
      'cli',
      'lib',
      'node_modules',
      '@astryxdesign',
      'cli',
    ],
    bin: ['.volta', 'bin'],
  },
};

/**
 * A global install of the packed CLI in `layout`, under `root`, with its
 * `astryx` command linked into its bin folder.
 * @param {keyof typeof LAYOUTS} layout
 * @param {string} version
 * @param {{root?: string, engines?: Record<string, string>, coreStep?: boolean}} [options]
 * @returns {{dir: string, bin: string, binDir: string}}
 */
export function globalCli(layout, version, options = {}) {
  const root = options.root ?? tempDir(`global-${layout}`);
  const {pkg, bin} = LAYOUTS[layout];
  const placed = placeCli(path.join(root, ...pkg), version, options);
  const binDir = path.join(root, ...bin);
  fs.mkdirSync(binDir, {recursive: true});
  fs.symlinkSync(placed.bin, path.join(binDir, 'astryx'));
  return {...placed, binDir};
}

/**
 * A verified release of the packed CLI in a cache folder, the way an install
 * leaves it, with a stand-in Core.
 * @param {string} cacheDir the `astryx` cache folder
 * @param {string} version
 * @param {{engines?: Record<string, string>}} [options]
 * @returns {{dir: string, bin: string}}
 */
export function seedPackedRelease(cacheDir, version, options = {}) {
  const dir = path.join(cacheDir, 'releases', version);
  writeJson(path.join(dir, 'package.json'), {
    name: 'astryx-release',
    private: true,
  });
  const cli = placeCli(
    path.join(dir, 'node_modules', '@astryxdesign', 'cli'),
    version,
    options,
  );
  installCore(dir, version);
  /** @type {Record<string, string>} */
  const files = {};
  for (const rel of [
    'node_modules/@astryxdesign/cli/package.json',
    'node_modules/@astryxdesign/core/package.json',
    path.relative(dir, cli.bin).split(path.sep).join('/'),
  ]) {
    files[rel] = createHash('sha256')
      .update(fs.readFileSync(path.join(dir, rel)))
      .digest('hex');
  }
  writeJson(path.join(dir, 'release.json'), {
    version,
    verifiedAt: 'test',
    files,
    tree: releaseTree(dir),
  });
  return {dir, bin: cli.bin};
}

/**
 * A package registry inside this process: packuments for the CLI and Core
 * with the given versions and `latest` tag; every other request is not
 * found.
 * @param {{versions: string[], latest: string}} options
 * @returns {Promise<{url: string, close: () => Promise<void>}>}
 */
export function startRegistry({versions, latest}) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '').split('?')[0]);
    const match = /^\/(@astryxdesign\/(?:cli|core))(?:\/([^/]+))?$/u.exec(url);
    if (!match) {
      res.writeHead(404, {'content-type': 'application/json'});
      res.end('{}');
      return;
    }
    const [, name, tag] = match;
    const self = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
    const packument = {
      name,
      'dist-tags': {latest},
      versions: Object.fromEntries(
        versions.map(v => [
          v,
          {
            name,
            version: v,
            dist: {
              tarball: `${self}/${name}/-/${name.split('/')[1]}-${v}.tgz`,
            },
          },
        ]),
      ),
    };
    const body = tag
      ? packument.versions[packument['dist-tags'][tag] ?? tag]
      : packument;
    res.writeHead(body ? 200 : 404, {'content-type': 'application/json'});
    res.end(JSON.stringify(body ?? {}));
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/`,
        close: () => new Promise(done => server.close(() => done())),
      });
    });
  });
}
