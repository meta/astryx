#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Sets `astryx/trainer-pass` on every open pull request's current head,
 *   as .github/workflows/trainer-pass.yml would have when the head was pushed.
 * @input `--write` to post the statuses; without it the script only prints
 *   what it would post. Runs `gh api` as the person who starts it.
 * @output One line per open pull request: success for a pull request the
 *   review bot did not open, pending for one it did. A head that already has a
 *   trainer-pass status keeps it, so a trainer's success is never overwritten.
 * @position Run once before `astryx/trainer-pass` becomes a required check, so
 *   pull requests opened before the workflow existed are not blocked.
 */

import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const CONTEXT = 'astryx/trainer-pass';
export const BOT = 'astracat-bot[bot]';
const REPO = 'meta/astryx';

/** The status the workflow sets for a pull request opened by `login`. */
export function statusFor(login) {
  return login === BOT
    ? {
        state: 'pending',
        description: 'waiting for trainer review of this exact head',
      }
    : {state: 'success', description: 'not an Astracat PR'};
}

/** `gh api` as a function: (args) => parsed JSON. */
function ghApi(args) {
  const out = execFileSync('gh', ['api', ...args], {encoding: 'utf8'});
  return out.trim() ? JSON.parse(out) : null;
}

/**
 * Plans, and with `write` posts, the status for each open pull request.
 * Returns one entry per pull request: `{number, sha, state, action}`, where
 * action is 'set', 'would-set' or 'kept'.
 */
export function backfill({api = ghApi, write = false, repo = REPO} = {}) {
  const pulls = api([
    '--paginate',
    '--slurp',
    `repos/${repo}/pulls?state=open&per_page=100`,
  ]).flat();
  const plan = [];
  for (const pr of pulls) {
    const sha = pr.head.sha;
    const statuses = api([
      `repos/${repo}/commits/${sha}/statuses?per_page=100`,
    ]);
    const existing = statuses.find(status => status.context === CONTEXT);
    const {state, description} = statusFor(pr.user?.login);
    if (existing) {
      plan.push({
        number: pr.number,
        sha,
        state: existing.state,
        action: 'kept',
      });
      continue;
    }
    if (write) {
      api([
        '-X',
        'POST',
        `repos/${repo}/statuses/${sha}`,
        '-f',
        `state=${state}`,
        '-f',
        `context=${CONTEXT}`,
        '-f',
        `description=${description}`,
      ]);
    }
    plan.push({
      number: pr.number,
      sha,
      state,
      action: write ? 'set' : 'would-set',
    });
  }
  return plan;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const write = process.argv.includes('--write');
  const plan = backfill({write});
  for (const entry of plan) {
    console.log(
      `#${entry.number} ${entry.sha.slice(0, 8)} ${entry.action} ${entry.state}`,
    );
  }
  const changed = plan.filter(entry => entry.action !== 'kept').length;
  console.log(
    write
      ? `${changed} status(es) set; ${plan.length - changed} kept.`
      : `Dry run: ${changed} status(es) would be set; ${plan.length - changed} kept. Pass --write to post them.`,
  );
}
