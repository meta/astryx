#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes clients/cli/manifest.generated.json at `prepack`: the `data` of
 * `astryx manifest --json` as the fully loaded CLI builds it, so the published
 * package's `manifest` loads no other command. The file is not committed; a
 * checkout without it builds the manifest from every command, with the same
 * result. `--clean` (at `postpack`) removes it.
 *
 * The manifest describes the commands alone, so it is the same wherever the
 * CLI runs: this script proves it by building it from a folder beside each
 * package manager's lockfile, and from one with none.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {MANIFEST_FILE} from '../clients/cli/lib/manifest.mjs';

/** The CLI's bin, run as a user runs it. */
const BIN = fileURLToPath(
  new URL('../clients/cli/bin/astryx.mjs', import.meta.url),
);

/** Each package manager's lockfile, as the CLI tells them apart. */
const LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
];

/**
 * The manifest the CLI builds, run from a fresh folder with `lockfile`.
 * @param {string | null} lockfile
 * @returns {unknown}
 */
function manifestBeside(lockfile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-manifest-'));
  try {
    if (lockfile) {
      fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"probe"}');
      fs.writeFileSync(path.join(dir, lockfile), '');
    }
    const env = {...process.env, NO_UPDATE_NOTIFIER: '1'};
    const run = spawnSync(process.execPath, [BIN, 'manifest', '--json'], {
      cwd: dir,
      encoding: 'utf8',
      env,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (run.status !== 0) throw new Error(run.stderr);
    return JSON.parse(run.stdout).data;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

/**
 * The file's text: the manifest's data.
 * @returns {string}
 */
export function manifestText() {
  const data = manifestBeside(null);
  for (const lockfile of LOCKFILES) {
    if (!isDeepStrictEqual(manifestBeside(lockfile), data)) {
      throw new Error(`the manifest differs beside ${lockfile}`);
    }
  }
  return JSON.stringify(data) + '\n';
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && process.argv.includes('--clean')) {
  fs.rmSync(MANIFEST_FILE, {force: true});
} else if (isMain) {
  // Built from a checkout without a stored manifest, as every command loads.
  fs.rmSync(MANIFEST_FILE, {force: true});
  fs.writeFileSync(MANIFEST_FILE, manifestText());
  console.log(`Wrote ${path.relative(process.cwd(), MANIFEST_FILE)}.`);
}
