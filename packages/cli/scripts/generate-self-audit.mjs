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
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {SELF_AUDIT_FILE} from '../foundation/discovery/stored-self-audit.mjs';
import {assertSameBesideLockfiles} from './same-beside-lockfiles.mjs';
import {copyPublishedFiles} from './published-files.mjs';

/** The repository's folder, two levels above the package. */
const REPO_DIR = path.resolve(CLI_ROOT, '..', '..');

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
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-self-audit-'));
  try {
    const pkg = path.join(stage, 'packages', 'cli');
    copyPublishedFiles(CLI_ROOT, pkg);
    const link = (/** @type {string} */ target, /** @type {string} */ at) => {
      if (!fs.existsSync(target)) return;
      fs.mkdirSync(path.dirname(at), {recursive: true});
      fs.symlinkSync(
        target,
        at,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    };
    link(path.join(CLI_ROOT, 'node_modules'), path.join(pkg, 'node_modules'));
    link(path.join(REPO_DIR, 'node_modules'), path.join(stage, 'node_modules'));
    link(
      path.join(REPO_DIR, 'packages', 'core'),
      path.join(stage, 'packages', 'core'),
    );
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
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
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
