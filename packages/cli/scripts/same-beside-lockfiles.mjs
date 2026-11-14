// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The publish-time guard shared by the generators that store an answer
 *   the CLI would otherwise work out where it runs (scripts/generate-manifest.mjs,
 *   scripts/generate-self-audit.mjs): the answer must not depend on which
 *   package manager the folder it runs in uses, or a stored copy would be
 *   wrong somewhere.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

/** Each package manager's lockfile, as the CLI tells them apart. */
export const LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
];

/**
 * Run `answer` in a fresh folder, removed afterwards.
 * @template T
 * @param {(dir: string) => T} answer
 * @param {string | null} [lockfile] a lockfile (and a package.json) to put
 *   there first
 * @returns {T}
 */
export function inFreshFolder(answer, lockfile = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-publish-probe-'));
  try {
    if (lockfile) {
      fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"probe"}');
      fs.writeFileSync(path.join(dir, lockfile), '');
    }
    return answer(dir);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

/**
 * Throw unless `answer`, run in a fresh folder beside each package manager's
 * lockfile, gives `expected`.
 * @param {string} what what the answer is, for the error
 * @param {unknown} expected
 * @param {(dir: string) => unknown} answer
 */
export function assertSameBesideLockfiles(what, expected, answer) {
  for (const lockfile of LOCKFILES) {
    if (!isDeepStrictEqual(inFreshFolder(answer, lockfile), expected)) {
      throw new Error(`${what} differs beside ${lockfile}`);
    }
  }
}
