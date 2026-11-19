// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Preloaded into a child process (`node --import`) to stop that
 * process part way through a preview change, as a kill would: right after
 * the file system step the rule after `--stop-at` on its command line
 * names (`node --import … -- --stop-at '<rule>'`), the process
 * exits at once, with no catch or finally of the change run. Its exit
 * handlers still run (a lock it holds is released, as for any stopped
 * command), so the next command does not wait out the lock.
 *
 * The rule is `{after, n}`: the `n`th `pending` (the step record landed),
 * `rename` (a preview file renamed into place after the record) or
 * `delete` (a preview file removed after the record).
 *
 * @position test-utils — used by {@link ./stopped-run.mjs}
 */

import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import path from 'node:path';

/** The exit code of a process stopped by this rule. */
export const STOPPED_CODE = 86;

const at = process.argv.indexOf('--stop-at');
const rule = at >= 0 ? JSON.parse(process.argv[at + 1] ?? 'null') : null;
const PENDING = '.theme-preview.pending.json';
const RECORD = 'theme-preview.json';
let afterRecord = false;
let seen = 0;
/** @param {string} step */
const step = s => {
  if (rule?.after === s && ++seen === rule.n) process.exit(STOPPED_CODE);
};

if (rule) {
  const rename = fs.renameSync;
  fs.renameSync = function renameSync(from, to) {
    const r = rename.call(this, from, to);
    const base = path.basename(String(to));
    if (base === PENDING) {
      afterRecord = true;
      step('pending');
    } else if (afterRecord && base !== RECORD) step('rename');
    return r;
  };
  const rm = fs.rmSync;
  fs.rmSync = function rmSync(file, options) {
    const r = rm.call(this, file, options);
    const base = path.basename(String(file));
    if (base === PENDING) afterRecord = false;
    else if (afterRecord && !base.endsWith('.tmp')) step('delete');
    return r;
  };
  syncBuiltinESMExports();
}
