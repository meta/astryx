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
 *   Only a weekly run at a commit in the release's own history counts: a run
 *   at a later main commit tested code the release does not have.
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
 * @param {(sha: string) => boolean} [options.isAncestor] whether a commit is
 *   in the release head's history (the head itself included); unknown is no
 * @returns {{full: boolean, reason: string}}
 */
export function releaseScope({
  version,
  verdicts,
  now,
  isAncestor = () => false,
}) {
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
  const inHistory = recorded.filter(
    verdict => verdict.sha && isAncestor(verdict.sha),
  );
  if (inHistory.length === 0)
    return {
      full: true,
      reason: `none of the ${recorded.length} recorded full weekly run(s) is at a commit in the release's history, so the full suite runs`,
    };
  const last = inHistory[0];
  const newer = recorded.indexOf(last);
  const at =
    ` at ${last.sha.slice(0, 10)}` +
    (newer
      ? ` (${newer} newer run(s), at commits after the release, do not count)`
      : '');
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

/**
 * Which recorded commits are in the release head's history: the compare API
 * says `ahead` or `identical` for a commit the head contains. A failed lookup
 * counts as not in it, so the full suite runs.
 * @param {{github: object, owner: string, repo: string, head: string, shas: string[]}} options
 * @returns {Promise<Set<string>>}
 */
export async function ancestorsOf({github, owner, repo, head, shas}) {
  const found = new Set();
  for (const sha of new Set(shas)) {
    try {
      const {data} = await github.rest.repos.compareCommits({
        owner,
        repo,
        base: sha,
        head,
        per_page: 1,
      });
      if (data.status === 'ahead' || data.status === 'identical')
        found.add(sha);
    } catch (error) {
      console.error(
        `::warning title=WebKit weekly ancestry unreadable::${sha.slice(0, 10)}: ${error.message}`,
      );
    }
  }
  return found;
}

/** The REST calls this script makes, without Octokit. */
function restClient(token) {
  const get = async (url, what) => {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
      },
    });
    if (!response.ok) throw new Error(`${what}: HTTP ${response.status}`);
    return {data: await response.json()};
  };
  return {
    rest: {
      repos: {
        compareCommits: ({owner, repo, base, head}) =>
          get(
            `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}?per_page=1`,
            `comparing ${base.slice(0, 10)} with the release head`,
          ),
      },
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
  let inHistory = new Set();
  const head = process.env.RELEASE_HEAD_SHA ?? '';
  const now = Date.now();
  try {
    const [owner, repo] = String(process.env.GITHUB_REPOSITORY).split('/');
    const github = restClient(process.env.GITHUB_TOKEN);
    verdicts = await listVerdicts({github, owner, repo});
    // Only a run of the last 7 days can choose the subset, so only those
    // commits are compared with the release head.
    if (/^[0-9a-f]{40}$/.test(head))
      inHistory = await ancestorsOf({
        github,
        owner,
        repo,
        head,
        shas: verdicts
          .filter(v => v.sha && now - Date.parse(v.createdAt) <= MAX_AGE_MS)
          .map(v => v.sha),
      });
    else
      console.error(
        '::warning title=Release head unknown::RELEASE_HEAD_SHA is not a commit, so no weekly run counts',
      );
  } catch (error) {
    console.error(
      `::warning title=WebKit weekly record unreadable::${error.message}`,
    );
  }
  const {full, reason} = releaseScope({
    version: releaseVersion(process.env.RELEASE_TITLE),
    verdicts,
    now,
    isAncestor: sha => inHistory.has(sha),
  });
  console.error(`Release WebKit scope: ${reason}.`);
  console.log(`WEBKIT_ALL_SPECS=${full}`);
}
