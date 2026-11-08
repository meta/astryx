// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether a release interaction check runs the full WebKit suite.
 * @input The release's version (from the release tooling's pull request
 *   title) and the recorded full weekly WebKit runs: each run's verdict
 *   artifact, `webkit-weekly-green` or `webkit-weekly-failed`, with its
 *   creation time and the main commit it ran at.
 * @output `{full, reason}`; as a command, `WEBKIT_ALL_SPECS=<true|false>` for
 *   `$GITHUB_ENV`, with the reason on stderr.
 * @position A release runs WebKit's touch and gesture subset, the same subset
 *   a pull request runs, while the last full weekly run on main is green and
 *   at most seven days old. It runs the full suite when that run failed, is
 *   older, or is missing, and at every minor release (spec:AST-030 DEC-24).
 */

import {fileURLToPath} from 'node:url';

export const GREEN = 'webkit-weekly-green';
export const FAILED = 'webkit-weekly-failed';
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The release version a release tooling pull request title names, e.g.
 * "[do not merge] v0.7.12 interaction check at c99ad4aa20", or null.
 * @param {string | undefined} title
 */
export function releaseVersion(title) {
  return /\bv(\d+\.\d+\.\d+)\b/.exec(title ?? '')?.[1] ?? null;
}

/**
 * @param {object} options
 * @param {string | null} options.version e.g. `0.7.12`
 * @param {Array<{name: string, createdAt: string, sha?: string}>} options.verdicts
 * @param {number} options.now milliseconds since the epoch
 * @returns {{full: boolean, reason: string}}
 */
export function releaseScope({version, verdicts, now}) {
  if (version == null)
    return {full: true, reason: 'the release version is unknown, so the full suite runs'};
  if (version.split('.')[2] === '0')
    return {full: true, reason: `${version} is a minor release, so the full suite runs at its exact commit`};
  const recorded = verdicts
    .filter(verdict => verdict.name === GREEN || verdict.name === FAILED)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (recorded.length === 0)
    return {full: true, reason: 'no full weekly WebKit run is recorded, so the full suite runs'};
  const last = recorded[0];
  const at = last.sha ? ` at ${last.sha.slice(0, 10)}` : '';
  if (last.name === FAILED)
    return {full: true, reason: `the last full weekly run${at} failed, so the full suite runs`};
  const age = now - Date.parse(last.createdAt);
  const days = (age / (24 * 60 * 60 * 1000)).toFixed(1);
  if (!(age <= MAX_AGE_MS))
    return {full: true, reason: `the last green full weekly run${at} completed ${days} days ago, more than 7, so the full suite runs`};
  return {full: false, reason: `the last full weekly run${at} is green and completed ${days} days ago, so the touch and gesture subset runs`};
}

/** Lists both verdict artifacts through the REST API. */
async function listVerdicts({repository, token}) {
  const verdicts = [];
  for (const name of [GREEN, FAILED]) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/artifacts?name=${name}&per_page=20`,
      {headers: {authorization: `Bearer ${token}`, accept: 'application/vnd.github+json'}},
    );
    if (!response.ok) throw new Error(`listing ${name} artifacts: HTTP ${response.status}`);
    const {artifacts} = await response.json();
    for (const artifact of artifacts ?? [])
      verdicts.push({name, createdAt: artifact.created_at, sha: artifact.workflow_run?.head_sha});
  }
  return verdicts;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // A failure to read the record counts as no record: the full suite runs.
  let verdicts = [];
  try {
    verdicts = await listVerdicts({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
    });
  } catch (error) {
    console.error(`::warning title=WebKit weekly record unreadable::${error.message}`);
  }
  const {full, reason} = releaseScope({
    version: releaseVersion(process.env.RELEASE_TITLE),
    verdicts,
    now: Date.now(),
  });
  console.error(`Release WebKit scope: ${reason}.`);
  console.log(`WEBKIT_ALL_SPECS=${full}`);
}
