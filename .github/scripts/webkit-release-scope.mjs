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

import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const {mainArtifacts} = createRequire(import.meta.url)(
  './lib/main-artifact.cjs',
);

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
 *   the verdicts Main's own runs on `main` recorded (listVerdicts)
 * @param {number} options.now milliseconds since the epoch
 * @returns {{full: boolean, reason: string}}
 */
export function releaseScope({version, verdicts, now}) {
  if (version == null)
    return {
      full: true,
      reason: 'the release version is unknown, so the full suite runs',
    };
  if (version.split('.')[2] === '0')
    return {
      full: true,
      reason: `${version} is a minor release, so the full suite runs at its exact commit`,
    };
  const recorded = verdicts
    .filter(verdict => verdict.name === GREEN || verdict.name === FAILED)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (recorded.length === 0)
    return {
      full: true,
      reason: 'no full weekly WebKit run is recorded, so the full suite runs',
    };
  const last = recorded[0];
  const at = last.sha ? ` at ${last.sha.slice(0, 10)}` : '';
  if (last.name === FAILED)
    return {
      full: true,
      reason: `the last full weekly run${at} failed, so the full suite runs`,
    };
  const age = now - Date.parse(last.createdAt);
  const days = (age / (24 * 60 * 60 * 1000)).toFixed(1);
  if (!(age <= MAX_AGE_MS))
    return {
      full: true,
      reason: `the last green full weekly run${at} completed ${days} days ago, more than 7, so the full suite runs`,
    };
  return {
    full: false,
    reason: `the last full weekly run${at} is green and completed ${days} days ago, so the touch and gesture subset runs`,
  };
}

/**
 * Both verdicts as Main's own runs on `main` in this repository recorded
 * them (lib/main-artifact.cjs): a pull request's run can upload an artifact
 * under any name.
 * @param {{github: object, owner: string, repo: string}} options an
 *   Octokit-shaped client
 */
export async function listVerdicts({github, owner, repo}) {
  const verdicts = [];
  for (const name of [GREEN, FAILED])
    for (const artifact of await mainArtifacts({github, owner, repo, name}))
      verdicts.push({
        name,
        createdAt: artifact.created_at,
        sha: artifact.workflow_run?.head_sha,
      });
  return verdicts;
}

/** The one REST call listVerdicts makes, without Octokit. */
function restClient(token) {
  return {
    rest: {
      actions: {
        listArtifactsForRepo: async ({owner, repo, name, per_page}) => {
          const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/artifacts?name=${name}&per_page=${per_page}`,
            {
              headers: {
                authorization: `Bearer ${token}`,
                accept: 'application/vnd.github+json',
              },
            },
          );
          if (!response.ok)
            throw new Error(
              `listing ${name} artifacts: HTTP ${response.status}`,
            );
          return {data: await response.json()};
        },
      },
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // A failure to read the record counts as no record: the full suite runs.
  let verdicts = [];
  try {
    const [owner, repo] = String(process.env.GITHUB_REPOSITORY).split('/');
    verdicts = await listVerdicts({
      github: restClient(process.env.GITHUB_TOKEN),
      owner,
      repo,
    });
  } catch (error) {
    console.error(
      `::warning title=WebKit weekly record unreadable::${error.message}`,
    );
  }
  const {full, reason} = releaseScope({
    version: releaseVersion(process.env.RELEASE_TITLE),
    verdicts,
    now: Date.now(),
  });
  console.error(`Release WebKit scope: ${reason}.`);
  console.log(`WEBKIT_ALL_SPECS=${full}`);
}
