// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The esbuild that builds a rendered page's script. Only `astryx
 * experimental export` loads it, by dynamic import in the page's worker, so
 * no other command pays for it at startup. A native esbuild whose version
 * satisfies the CLI's own esbuild-wasm range comes first, from the project and
 * then from beside the CLI; otherwise the esbuild-wasm the CLI installs. The
 * wasm build gives the same output more slowly, and it has no install script
 * for a package manager to approve.
 * @position foundation/render — used by render-page.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isValidSemver, satisfiesRange} from '../env/semver.mjs';
import {findInstalledPackage} from '../fs/paths.mjs';

/** The folder of the CLI's own modules, from which its packages resolve. */
export const CLI_DIR = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Which esbuild builds the page's script, and why.
 * @typedef {object} EsbuildChoice
 * @property {string} entry - The entry file to load.
 * @property {'esbuild' | 'esbuild-wasm'} build - The package that builds.
 * @property {string | null} version - Its version, when its package.json says.
 * @property {string} reason - Why this build: a native esbuild whose version
 *   satisfies the range, or why none was used.
 */

/**
 * The parsed package.json of an installed package, or null.
 * @param {string | null} packageDir
 * @returns {{main?: unknown, version?: unknown, dependencies?: Record<string, unknown>} | null}
 */
function manifestOf(packageDir) {
  if (!packageDir) return null;
  try {
    return JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    );
  } catch {
    return null;
  }
}

/**
 * The entry file of an installed package, from its package.json `main`.
 * @param {string} packageDir
 * @returns {string}
 */
function entryOf(packageDir) {
  const main = manifestOf(packageDir)?.main;
  // A copy without a readable package.json loads from its usual entry.
  return path.join(packageDir, typeof main === 'string' ? main : 'lib/main.js');
}

/**
 * The version an installed package's package.json gives, when it is semver.
 * @param {string | null} packageDir
 * @returns {string | null}
 */
function versionOf(packageDir) {
  const version = manifestOf(packageDir)?.version;
  return typeof version === 'string' && isValidSemver(version) ? version : null;
}

/**
 * The range forms the lookup reads: a caret, tilde or exact full version, or
 * comparators on full versions. Any other form fails closed to esbuild-wasm.
 */
const READ_RANGE =
  /^(?:[\^~]?\d+\.\d+\.\d+|(?:>=|<=|>|<|=)\d+\.\d+\.\d+(?:\s+(?:>=|<=|>|<|=)\d+\.\d+\.\d+)*)$/;

/**
 * The esbuild range a native esbuild must satisfy: the CLI's own dependency
 * range for esbuild-wasm, as publishing writes it (under 0.x esbuild treats
 * each minor as breaking, and a caret pins the minor). In the repository the
 * manifest names the catalog instead, so the range is the installed
 * esbuild-wasm's version and its patches. `closed` is true for a declared
 * range the lookup does not read.
 * @param {string} cliDir the folder whose package.json declares esbuild-wasm
 * @param {string | null} wasmDir the installed esbuild-wasm
 * @returns {{range: string | null, closed: boolean}}
 */
function esbuildRange(cliDir, wasmDir) {
  const declared = manifestOf(cliDir)?.dependencies?.['esbuild-wasm'];
  if (typeof declared === 'string' && READ_RANGE.test(declared.trim())) {
    return {range: declared.trim(), closed: false};
  }
  if (
    typeof declared === 'string' &&
    !/^(?:catalog|workspace):/.test(declared)
  ) {
    return {range: declared, closed: true};
  }
  const version = versionOf(wasmDir);
  return {range: version ? `^${version}` : null, closed: false};
}

/**
 * The judgement behind the choice: which esbuild builds the page's script,
 * why each native esbuild found was passed over, and the range checked.
 * @param {string} from
 * @param {string | undefined} project
 * @returns {{choice: EsbuildChoice | null, passed: string[], range: string | null, closed: boolean}}
 */
function judge(from, project) {
  const wasm = findInstalledPackage(from, 'esbuild-wasm');
  const {range, closed} = esbuildRange(from, wasm);
  /** @type {string[]} */
  const passed = [];
  if (closed || range == null) {
    return {
      choice: wasm
        ? {
            entry: entryOf(wasm),
            build: 'esbuild-wasm',
            version: versionOf(wasm),
            reason: closed
              ? `the CLI\u2019s esbuild-wasm range ${range} is not one the lookup reads`
              : 'the CLI\u2019s esbuild-wasm has no readable version, so no native esbuild can be checked',
          }
        : null,
      passed,
      range,
      closed,
    };
  }
  const beside = {dir: from, label: 'the esbuild beside the CLI'};
  const places = project
    ? [{dir: project, label: 'the project\u2019s esbuild'}, beside]
    : [beside];
  // The project's esbuild can also be the one beside the CLI (a hoisted
  // install); each folder is judged, and named, once.
  /** @type {Set<string>} */
  const seen = new Set();
  for (const {dir, label} of places) {
    const native = findInstalledPackage(dir, 'esbuild');
    if (!native || seen.has(native)) continue;
    seen.add(native);
    const version = versionOf(native);
    if (version != null && satisfiesRange(version, range)) {
      return {
        choice: {
          entry: entryOf(native),
          build: 'esbuild',
          version,
          reason: `${label} satisfies ${range}`,
        },
        passed,
        range,
        closed,
      };
    }
    passed.push(
      version == null
        ? `${label} has no readable version`
        : `${label} ${version} is outside ${range}`,
    );
  }
  return {
    choice: wasm
      ? {
          entry: entryOf(wasm),
          build: 'esbuild-wasm',
          version: versionOf(wasm),
          reason:
            passed.length > 0
              ? passed.join('; ')
              : `no native esbuild satisfying ${range} is installed`,
        }
      : null,
    passed,
    range,
    closed,
  };
}

/**
 * Which esbuild builds the page's script: a native esbuild whose version
 * satisfies the CLI's esbuild-wasm range, from the project and then from
 * beside the CLI, else the CLI's esbuild-wasm. A native esbuild is used only
 * after its version is checked, so with no range to check, none is. Null
 * when the CLI's install lost its esbuild-wasm and no native esbuild passes.
 * @param {string} [from] the CLI's folder: its package.json declares
 *   esbuild-wasm, and its packages resolve from it (default: the CLI's)
 * @param {string} [project] the page's project folder
 * @returns {EsbuildChoice | null}
 */
export function chooseEsbuild(from = CLI_DIR, project) {
  return judge(from, project).choice;
}

/**
 * The entry file of the esbuild that builds the page's script, or null when
 * the CLI's install lost its esbuild-wasm and no native esbuild passes.
 * @param {string} [from]
 * @param {string} [project]
 * @returns {string | null}
 */
export function findEsbuild(from = CLI_DIR, project) {
  return chooseEsbuild(from, project)?.entry ?? null;
}

/**
 * Why a render has no esbuild, with each native esbuild passed over and the
 * fixes: install the CLI again, or, when the CLI's manifest gives a range the
 * lookup reads, add or upgrade esbuild to that range in the project's dev
 * dependencies.
 * @param {string} [from] the CLI's folder (default: the CLI's)
 * @param {string} [project] the page's project folder
 * @returns {string}
 */
export function esbuildMissing(from = CLI_DIR, project) {
  const {passed, range, closed} = judge(from, project);
  const why = passed.length > 0 ? `, and ${passed.join('; ')}` : '';
  const add =
    range != null && !closed
      ? `, or add or upgrade esbuild to ${range} in your project\u2019s dev dependencies`
      : '';
  return `the CLI\u2019s install is missing its esbuild-wasm${why}; install the CLI again${add}`;
}
