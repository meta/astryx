// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The official package list as the CLI reads it (spec:AST-051 FR11).
 * @input The list file `prepack` writes, or the repository the CLI sits in
 * @output `readOfficialList`: the parsed list
 * @position The one reader of the list for `discover` and the release notices.
 *   A published CLI reads the file it was packed with. A checkout has no such
 *   file, so it asks the generator (scripts/generate-official-packages.mjs)
 *   for the list, once per process: a new package needs no edit here.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

// Found from this file, not from fs/paths.mjs: the release notices read the
// list, and paths.mjs and the notices load each other.
const CLI_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/** The list `prepack` writes into the published CLI. */
export const OFFICIAL_LIST_FILE = path.join(
  CLI_DIR,
  'assets',
  'discover',
  'official-packages.json',
);

/** The generator. A checkout has it; a published CLI does not. */
const GENERATOR = path.join(
  CLI_DIR,
  'scripts',
  'generate-official-packages.mjs',
);

/** @type {Map<string, unknown>} */
const derived = new Map();

/**
 * The official list, parsed. A `file` other than the CLI's own is read as it
 * is. For the CLI's own list, a checkout derives it from the repository
 * (`root`, else the checkout), and a published CLI reads the file it was
 * packed with. Throws when the list cannot be read or derived.
 * @param {{file?: string, root?: string}} [options]
 * @returns {any}
 */
export function readOfficialList({file = OFFICIAL_LIST_FILE, root} = {}) {
  if (file !== OFFICIAL_LIST_FILE || !fs.existsSync(GENERATOR)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const key = root ?? '';
  if (!derived.has(key)) {
    const run = spawnSync(
      process.execPath,
      [GENERATOR, '--print', ...(root == null ? [] : ['--root', root])],
      {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
    );
    if (run.status !== 0) {
      const why = (run.stderr || run.error?.message || '').trim();
      throw new Error(
        `the official list could not be derived from the repository${why ? `: ${why}` : ''}`,
      );
    }
    derived.set(key, JSON.parse(run.stdout));
  }
  return derived.get(key);
}
