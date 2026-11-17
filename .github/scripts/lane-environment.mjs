#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lane-environment.mjs
 * @description Fails a CI lane early, with a plain message, when the pull
 *   request's head is older than the lane's environment. The workflow comes
 *   from the merge commit but some lanes run the head's own specs, so a head
 *   cut before an environment change can fail for reasons that are not its
 *   own.
 * @input `check`: the lane's key, the workflow commit's marker file and the
 *   head's marker file (`.github/lane-environments.json`).
 * @output Exit 0, or an `::error` annotation and exit 1.
 * @position The interaction proof legs and the touched components'
 *   accessibility contracts in ci.yml; `lane-environment.test.mjs` keeps the
 *   marker equal to each lane's environment.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** The jobs whose environment each marker key stands for. */
export const LANES = {
  'interaction-chromium': ['pr-interaction'],
  'interaction-webkit': ['pr-interaction-webkit'],
  'a11y-contracts': ['pr-component-a11y-contracts'],
};

/**
 * A short hash of what a lane's specs run in: each job's runner, container
 * and browser install. Other workflow edits leave it unchanged.
 */
export function environmentOf(jobs) {
  const parts = jobs.map(job => ({
    runsOn: job['runs-on'] ?? null,
    container: job.container ?? null,
    install:
      job.steps?.find(step => /^Install Playwright/.test(step.name ?? ''))
        ?.run ?? null,
  }));
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 12);
}

/**
 * The lane's version in a marker file. A head with no file, or no entry for
 * the lane, predates the markers and counts as version 1.
 */
export function versionIn(file, lane) {
  if (!fs.existsSync(file)) return 1;
  const entry = JSON.parse(fs.readFileSync(file, 'utf8'))[lane];
  return entry?.version ?? 1;
}

/** The error for a head older than the lane, or null when it is current. */
export function staleHead(lane, workflowVersion, headVersion) {
  if (headVersion >= workflowVersion) return null;
  return `The ${lane} lane's environment changed on main (version ${workflowVersion}; this branch has ${headVersion}). Update this branch onto main, then re-run.`;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, ...args] = process.argv.slice(2);
  const lane = option(args, '--lane');
  const workflow = option(args, '--workflow');
  const head = option(args, '--head');
  if (command !== 'check' || !LANES[lane] || !workflow || !head) {
    console.error(
      `usage: lane-environment.mjs check --lane <${Object.keys(LANES).join('|')}> --workflow <file> --head <file>`,
    );
    process.exitCode = 1;
  } else {
    const error = staleHead(
      lane,
      versionIn(workflow, lane),
      versionIn(head, lane),
    );
    if (error) {
      console.log(`::error title=Update your branch::${error}`);
      process.exitCode = 1;
    } else {
      console.log(`This branch has the ${lane} lane's current environment.`);
    }
  }
}
