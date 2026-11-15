#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes assets/self-audit.generated.json at `prepack`: what Doctor's
 * audits of the CLI's own files find, with the state of every file and folder
 * each read, so the published package's `doctor` reuses the answer while
 * those files are unchanged. The file is not committed; a checkout without it
 * audits on every run, with the same result. `--clean` (at `postpack`)
 * removes it.
 *
 * The audits run on a copy holding exactly the files the package publishes,
 * so what they read, folders included, is what an installed package holds.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {SELF_AUDIT_FILE} from '../foundation/discovery/stored-self-audit.mjs';
import {assertSameBesideLockfiles} from './same-beside-lockfiles.mjs';
import {withPublishedCopy} from './published-copy.mjs';

/**
 * What runs the audit in the copy and prints its inputs and value.
 * @param {string} pkg the copy's package folder
 * @returns {string}
 */
function auditRunner(pkg) {
  const at = (/** @type {string} */ rel) =>
    JSON.stringify(pathToFileURL(path.join(pkg, rel)).href);
  return `const {recordReads} = await import(${at('foundation/fs/read-record.mjs')});
const {selfAuditInputs} = await import(${at('foundation/discovery/stored-self-audit.mjs')});
const {AUTHORING_AUDIT, authoringAuditData} = await import(${at('api/doctor/_adapter.mjs')});
const seen = new Map();
const {audit, topic, surface} = await recordReads(seen, () => authoringAuditData());
const value = {audit, topic: topic.keys === null ? topic : {keys: [...topic.keys]}, surface};
process.stdout.write(JSON.stringify({name: AUTHORING_AUDIT, inputs: selfAuditInputs(seen.keys()), value}));`;
}

/**
 * Run the audit in the copy from `cwd`.
 * @param {string} pkg
 * @param {string} cwd
 * @returns {{name: string, inputs: Record<string, string>, value: unknown}}
 */
function runAudit(pkg, cwd) {
  const run = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', auditRunner(pkg)],
    {cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
  );
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout);
}

/**
 * The file's text: each audit's inputs and value.
 * @returns {string}
 */
export function selfAuditText() {
  return withPublishedCopy('astryx-self-audit-', ({stage, pkg}) => {
    const {name, inputs, value} = runAudit(pkg, stage);
    // Stored only as plain data that reads back the same.
    if (!isDeepStrictEqual(JSON.parse(JSON.stringify(value)), value)) {
      throw new Error('the authoring audit is not plain data');
    }
    // The audit reads where it runs only to spell commands: prove its answer
    // is the same beside each package manager's lockfile.
    assertSameBesideLockfiles(
      'the authoring audit',
      value,
      dir => runAudit(pkg, dir).value,
    );
    return JSON.stringify({[name]: {inputs, value}}) + '\n';
  });
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && process.argv.includes('--clean')) {
  fs.rmSync(SELF_AUDIT_FILE, {force: true});
} else if (isMain) {
  fs.writeFileSync(SELF_AUDIT_FILE, selfAuditText());
  console.log(`Wrote ${path.relative(process.cwd(), SELF_AUDIT_FILE)}.`);
}
