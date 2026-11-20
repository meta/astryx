#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes clients/cli/build-id.generated.json at `prepack`, last: a hash
 * of every file the package publishes, so a gathered catalog kept between runs
 * (foundation/fs/gather-cache.mjs) is used only by the exact CLI that stored
 * it. The file is not committed; a checkout without it keeps no catalogs.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {BUILD_ID_FILE} from '../foundation/fs/gather-cache.mjs';

/** A published file the hash leaves out: tests, and the id itself. */
const SKIP = /(?:\.test\.|\.spec\.|\/__tests__\/|\/__mocks__\/|\.bench\.)/;

/**
 * Every published file under `dir`, as paths relative to the package.
 * @param {string} dir
 * @returns {string[]}
 */
function filesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name.startsWith('.')
        ? []
        : filesIn(file);
    }
    return entry.isFile() ? [path.relative(CLI_ROOT, file)] : [];
  });
}

/**
 * The id: a hash of the package's version and every published file.
 * @returns {string}
 */
export function buildIdOf() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf-8'),
  );
  const published = /** @type {string[]} */ (pkg.files ?? []).filter(
    entry => !entry.startsWith('!'),
  );
  const files = published
    .flatMap(entry => {
      const full = path.join(CLI_ROOT, entry);
      return fs.existsSync(full) && fs.statSync(full).isFile()
        ? [entry]
        : filesIn(full);
    })
    .map(file => file.split(path.sep).join('/'))
    .filter(
      file =>
        !SKIP.test(`/${file}`) && path.join(CLI_ROOT, file) !== BUILD_ID_FILE,
    )
    .sort();
  const hash = createHash('sha256').update(`${pkg.name}@${pkg.version}\n`);
  for (const file of files) {
    hash.update(`${file}\n`);
    hash.update(fs.readFileSync(path.join(CLI_ROOT, file)));
  }
  return hash.digest('hex');
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && process.argv.includes('--clean')) {
  // `postpack`: a checkout keeps no build id, so it never keeps catalogs.
  fs.rmSync(BUILD_ID_FILE, {force: true});
} else if (isMain) {
  fs.writeFileSync(BUILD_ID_FILE, JSON.stringify({id: buildIdOf()}) + '\n');
  console.log(`Wrote ${path.relative(process.cwd(), BUILD_ID_FILE)}.`);
}
