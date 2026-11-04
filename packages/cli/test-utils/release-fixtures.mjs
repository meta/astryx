// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fixture builders shared by the global-mode tests: projects with an
 * installed Core and CLI of any version, and stand-in CLI packages whose
 * `astryx` command reports what it received.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {releaseTree} from '../foundation/release/cache.mjs';

/** @type {string[]} */
const made = [];

/**
 * A fresh temporary folder, removed by {@link cleanupFixtures}.
 * @param {string} [label]
 * @returns {string}
 */
export function tempDir(label = 'release') {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), `astryx-${label}-`)),
  );
  made.push(dir);
  return dir;
}

/** Remove every folder {@link tempDir} made. */
export function cleanupFixtures() {
  for (const dir of made.splice(0)) {
    // A global copy's background Core step, started as a run ends, may still
    // be writing its record into a test's cache folder: retry until it is done.
    fs.rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
  }
}

/**
 * Write a JSON file, creating its folder.
 * @param {string} file
 * @param {unknown} value
 */
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * The source of a stand-in `astryx` command. It prints, as one JSON line on
 * stdout, the version it was built as, its arguments, its working folder,
 * whatever arrived on stdin, and its stderr marker, then exits with the
 * status `--exit <n>` names (0 by default). `--version` prints the version
 * alone, as a real CLI does.
 * @param {string} version
 * @returns {string}
 */
export function standInBin(version) {
  return `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log(${JSON.stringify(version)}); process.exit(0); }
let stdin = '';
try { if (!process.stdin.isTTY) stdin = require('node:fs').readFileSync(0, 'utf-8'); } catch {}
console.log(JSON.stringify({version: ${JSON.stringify(version)}, args, cwd: process.cwd(), stdin}));
console.error('stand-in ' + ${JSON.stringify(version)});
const at = args.indexOf('--exit');
process.exit(at === -1 ? 0 : Number(args[at + 1]));
`;
}

/**
 * Install a stand-in `@astryxdesign/cli` of `version` into `dir`'s
 * node_modules (or at `dir` itself with `{at: true}`).
 * @param {string} dir
 * @param {string} version
 * @param {{bin?: boolean, engines?: Record<string, string>}} [options]
 *   `bin: false` leaves the command out; `engines` is written as declared
 * @returns {string} the package folder
 */
export function installStandInCli(dir, version, options = {}) {
  const pkgDir = path.join(dir, 'node_modules', '@astryxdesign', 'cli');
  /** @type {Record<string, unknown>} */
  const pkg = {name: '@astryxdesign/cli', version, type: 'commonjs'};
  if (options.engines) pkg.engines = options.engines;
  if (options.bin !== false) {
    Object.assign(pkg, {bin: {astryx: './bin.cjs'}});
    fs.mkdirSync(pkgDir, {recursive: true});
    fs.writeFileSync(path.join(pkgDir, 'bin.cjs'), standInBin(version));
  }
  writeJson(path.join(pkgDir, 'package.json'), pkg);
  return pkgDir;
}

/**
 * Install a stand-in `@astryxdesign/core` of `version` into `dir`.
 * @param {string} dir
 * @param {string} version
 * @returns {string}
 */
export function installCore(dir, version) {
  const pkgDir = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  writeJson(path.join(pkgDir, 'package.json'), {
    name: '@astryxdesign/core',
    version,
  });
  return pkgDir;
}

/**
 * A project folder whose package.json declares `deps`.
 * @param {string} dir
 * @param {Record<string, string>} deps
 * @returns {string}
 */
export function project(dir, deps) {
  writeJson(path.join(dir, 'package.json'), {
    name: path.basename(dir),
    private: true,
    dependencies: deps,
  });
  return dir;
}

/**
 * A verified release in a cache folder, made of stand-ins: the layout and
 * marker `ensureRelease` leaves.
 * @param {string} cacheDir
 * @param {string} version
 * @param {{engines?: Record<string, string>}} [options] the CLI's `engines`
 * @returns {string} the release folder
 */
export function seedRelease(cacheDir, version, options = {}) {
  const dir = path.join(cacheDir, 'releases', version);
  writeJson(path.join(dir, 'package.json'), {
    name: 'astryx-release',
    private: true,
  });
  installStandInCli(dir, version, options);
  installCore(dir, version);
  /** @type {Record<string, string>} */
  const files = {};
  for (const rel of [
    'node_modules/@astryxdesign/cli/package.json',
    'node_modules/@astryxdesign/core/package.json',
    'node_modules/@astryxdesign/cli/bin.cjs',
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
  return dir;
}

/**
 * This CLI's own version. A test that runs the real bin in a project whose
 * Core is another release is handed to that release (spec AST-081 FR2), so a
 * fixture that means "the installed Core" without caring which release uses
 * this version.
 */
export const CLI_VERSION = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
).version;

/**
 * This CLI package's folder. Derived with `fileURLToPath`, because
 * `URL.pathname` is a URI path rather than a filesystem one: it keeps the
 * percent-encoding of a checkout under a space, `%`, `#` or non-ASCII
 * directory, and puts a leading slash before a Windows drive letter.
 */
const THIS_CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/**
 * Make `dir` a project whose own CLI is this copy, linked into its
 * node_modules, with no Core installed. Runs there answer as the project's own
 * CLI (`copy: project`), so no carried Core stands in for the missing one.
 * @param {string} dir
 * @returns {string} dir
 */
export function linkThisCliAsProjectCli(dir) {
  if (!fs.existsSync(THIS_CLI)) {
    // Fail here rather than leave a dangling link: a project whose `cli` entry
    // does not resolve answers as the carried Core instead of as its own CLI,
    // which surfaces as an unrelated assertion in whichever test ran next.
    throw new Error(
      `linkThisCliAsProjectCli: this CLI package is not at ${THIS_CLI}`,
    );
  }
  const pkgFile = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    writeJson(pkgFile, {
      name: 'app',
      private: true,
      devDependencies: {'@astryxdesign/cli': CLI_VERSION},
    });
  }
  const link = path.join(dir, 'node_modules', '@astryxdesign', 'cli');
  fs.mkdirSync(path.dirname(link), {recursive: true});
  if (!fs.existsSync(link)) fs.symlinkSync(THIS_CLI, link, 'dir');
  return dir;
}
