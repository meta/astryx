// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file esbuild for an interactive render. It is an optional peer of the CLI:
 * only `astryx experimental render --interactive` needs it, so no other
 * command loads it and a CLI install does not carry it. This finds the copy
 * the page's project installed (else one installed beside the CLI), and
 * names the install command when there is none.
 * @position foundation/render — used by render-page.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {satisfiesRange} from '../env/semver.mjs';
import {installCommandFor} from '../discovery/template-needs.mjs';

const CLI_PACKAGE_JSON = fileURLToPath(
  new URL('../../package.json', import.meta.url),
);

/** The esbuild versions the CLI declares as its optional peer. */
export const ESBUILD_RANGE = (() => {
  try {
    return (
      JSON.parse(fs.readFileSync(CLI_PACKAGE_JSON, 'utf8')).peerDependencies
        ?.esbuild ?? '*'
    );
  } catch {
    return '*';
  }
})();

/**
 * The esbuild an interactive render loads: the first copy found from each
 * folder in turn whose version is in {@link ESBUILD_RANGE}.
 * @param {string[]} dirs folders to resolve from, in order
 * @returns {{main: string, version: string} | {older: string} | null} its
 *   entry and version; `older` when the only copies found are outside the
 *   range; null when there is none
 */
export function findEsbuild(dirs) {
  /** @type {string | null} */
  let older = null;
  for (const dir of dirs) {
    let main;
    try {
      main = createRequire(path.join(dir, 'noop.js')).resolve('esbuild');
    } catch {
      continue;
    }
    let version = '';
    try {
      version = JSON.parse(
        fs.readFileSync(
          path.join(path.dirname(main), '..', 'package.json'),
          'utf8',
        ),
      ).version;
    } catch {
      // A copy without a readable version is tried as it is.
    }
    if (version && !satisfiesRange(version, ESBUILD_RANGE)) {
      older ??= version;
      continue;
    }
    return {main, version};
  }
  return older ? {older} : null;
}

/** The folder of the CLI's own modules, from which an esbuild installed beside the CLI resolves. */
export const CLI_DIR = path.dirname(CLI_PACKAGE_JSON);

/**
 * The refusal for a render that needs esbuild and has none it can use.
 * @param {{older: string} | null} found
 * @param {string} dir the page's folder, whose project's package manager the command uses
 * @returns {{message: string, install: string | null}}
 */
export function esbuildMissing(found, dir) {
  const {installCommand, noCommandReason} = installCommandFor(['esbuild'], dir);
  const have = found
    ? `the esbuild installed here is ${found.older}, and it needs ${ESBUILD_RANGE}`
    : 'esbuild is not installed here';
  const fix = installCommand
    ? `Install it, then render again: ${installCommand}`
    : (noCommandReason ?? 'Install esbuild, then render again.');
  return {
    message: `--interactive builds the page's script with esbuild, an optional peer of the CLI, and ${have}; nothing was written. ${fix}`,
    install: installCommand,
  };
}
