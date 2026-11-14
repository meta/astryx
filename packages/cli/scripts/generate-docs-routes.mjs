#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes assets/docs-routes.generated.json at `prepack`: every route of
 * the CLI's own docs tree, with the state of every file and folder the tree
 * read, so the published package's lookup commands name a docs route in a
 * not-found hint without building the tree while those files are unchanged
 * (api/docs/_entry-names.mjs). The file is not committed; a checkout without
 * it builds the tree, with the same result. `--clean` (at `postpack`)
 * removes it.
 *
 * The tree is built on a copy holding exactly the files the package
 * publishes, so what it reads, folders included, is what an installed package
 * holds.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {DOCS_ROUTES_FILE} from '../foundation/doc-compiler/stored-docs.mjs';
import {withPublishedCopy} from './published-copy.mjs';

/**
 * What builds the routes in the copy and prints them with their inputs.
 * @param {string} pkg the copy's package folder
 * @returns {string}
 */
function routesRunner(pkg) {
  const at = (/** @type {string} */ rel) =>
    JSON.stringify(pathToFileURL(path.join(pkg, rel)).href);
  return `const {recordReads} = await import(${at('foundation/fs/read-record.mjs')});
const {selfAuditInputs} = await import(${at('foundation/discovery/stored-self-audit.mjs')});
const {cliDocsRoutesNow} = await import(${at('api/docs/_entry-names.mjs')});
const seen = new Map();
const value = await recordReads(seen, () => cliDocsRoutesNow());
process.stdout.write(JSON.stringify({inputs: selfAuditInputs(seen.keys()), value}));`;
}

/**
 * The file's text: the routes and their inputs.
 * @returns {string}
 */
export function docsRoutesText() {
  return withPublishedCopy('astryx-docs-routes-', ({stage, pkg}) => {
    const run = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', routesRunner(pkg)],
      {cwd: stage, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
    );
    if (run.status !== 0) throw new Error(run.stderr);
    const {inputs, value} = JSON.parse(run.stdout);
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every(route => typeof route === 'string')
    ) {
      throw new Error('the CLI docs tree gave no routes');
    }
    return JSON.stringify({routes: {inputs, value}}) + '\n';
  });
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && process.argv.includes('--clean')) {
  fs.rmSync(DOCS_ROUTES_FILE, {force: true});
} else if (isMain) {
  fs.writeFileSync(DOCS_ROUTES_FILE, docsRoutesText());
  console.log(`Wrote ${path.relative(process.cwd(), DOCS_ROUTES_FILE)}.`);
}
