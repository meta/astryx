// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fixtures for the global and project table's tests (spec AST-081
 * FR11): real copies of this CLI, packed the way it is published and placed
 * in every install layout the table names, and a package registry that runs
 * inside the test process.
 *
 * - `packedCli()` packs this package once per process (`npm pack`), and
 *   `extractTarball` unpacks it with no external tool, so the copies hold
 *   exactly the published files.
 * - `placeCli(dir, version)` puts a copy at `dir`, labeled `version`: every
 *   file is a hard link to the unpacked package except a rewritten
 *   package.json, and its `node_modules` links to this package's installed
 *   dependencies, so a copy costs almost nothing and runs as the release it
 *   is labeled.
 * - `globalCli(layout, version)` places one where a package manager or a Node
 *   version manager puts a global install, with an `astryx` command for the
 *   search path.
 * - `seedPackedRelease(cacheDir, version)` puts one in the per-user release
 *   cache with the marker an install leaves.
 * - `startRegistry({latest})` answers package questions for the CLI and Core
 *   from inside this process, the way the cross-platform smoke workflow does,
 *   with no network.
 *
 * @position packages/cli/test-utils — used by test/global-local.test.mjs.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {releaseTree} from '../foundation/release/cache.mjs';
import {installCore, tempDir, writeJson} from './release-fixtures.mjs';

/** This CLI package's folder. */
export const CLI_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * Unpack a `.tgz` written by `npm pack` into `dest`, dropping its leading
 * `package/` folder.
 * @param {string} file
 * @param {string} dest
 */
export function extractTarball(file, dest) {
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
}

/** @type {string | null} */
let packed = null;

/**
 * This CLI, packed once per process and unpacked.
 * @returns {string} the unpacked package folder
 */
export function packedCli() {
  if (packed) return packed;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-packed-cli-'));
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', out],
    {cwd: CLI_DIR, encoding: 'utf8', shell: process.platform === 'win32'},
  );
  if (result.status !== 0) {
    throw new Error(`npm pack failed: ${result.stderr}`);
  }
  const [{filename}] = JSON.parse(result.stdout);
  const dir = path.join(out, 'package');
  extractTarball(path.join(out, filename), dir);
  packed = dir;
  return dir;
}

/**
 * Hard-link every file under `from` into `to`, copying across devices.
 * @param {string} from
 * @param {string} to
 */
function linkTree(from, to) {
  fs.mkdirSync(to, {recursive: true});
  for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) linkTree(src, dst);
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
 * Put a copy of the packed CLI at `dir`, labeled `version`.
 * @param {string} dir the package folder to create
 * @param {string} version
 * The copy leaves out the global copy's background Core step
 * (core-worker.mjs), as a release that predates it does, so no test's run
 * starts a download behind its back; `coreStep: true` keeps it.
 * @param {{engines?: Record<string, string>, coreStep?: boolean}} [options]
 * @returns {{dir: string, bin: string}}
 */
export function placeCli(dir, version, options = {}) {
  const from = packedCli();
  linkTree(from, dir);
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
  return {dir, bin: path.join(dir, 'clients', 'cli', 'bin', 'astryx.mjs')};
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
