// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Marks a pull request's changed visual shots that came from `main`.
 * @input This run's verdict (the re-encoded report's `verdict.json`, whose
 *   `context.baseSha` is the base commit the run tested), its raw
 *   `manifest.json` (each shot's sha256), this pull request's head commit,
 *   and other pull requests' `visual-pr-report` artifacts through the API.
 * @output Each changed shot gets `inherited`: `{from: 'main'}` when a merged
 *   pull request's run showed the same shot changed with the same image and
 *   its merge commit is in the tested base; `{found: true}` when a report read
 *   shows the same image but that is not proven; else `{found: false}`.
 *   `inheritedChecked` counts the reports read. A failed lookup marks nothing
 *   and sets `inheritedLookupFailed`, which the comment and the step summary
 *   show, so a broken lookup is never silent.
 * @position The pull-request comment job, after `publish-pr-report.mjs`. The
 *   label is report text only: no check, status or baseline reads it.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** GitHub API calls one comment may spend on this, at most. */
export const MAX_CALLS = 20;
/** Calls kept for proving candidates: three each (pull request, base, stack). */
const PROOF_CALLS = 9;
const SHA256 = /^[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;

/** A lookup error as one short line of report text. */
export function failureReason(error) {
  const text = String(error?.message ?? error ?? 'unknown error')
    .replace(/[\r\n|`<>]+/g, ' ')
    .trim();
  return (text || 'unknown error').slice(0, 200);
}

/** The step-summary line for a failed lookup, or '' when it did not fail. */
export function lookupSummary(verdict) {
  return verdict?.inheritedLookupFailed
    ? `inheritance lookup failed: ${verdict.inheritedLookupFailed}\n`
    : '';
}

/**
 * The shot images a report's run captured, by key, for its changed shots.
 * @param {{verdict: any, manifest: any}} report
 * @returns {Map<string, string>} key -> sha256
 */
export function changedImages({verdict, manifest}) {
  const images = new Map();
  for (const change of verdict?.changes ?? []) {
    const hash = manifest?.shots?.[change?.key]?.sha256;
    if (
      typeof change?.key === 'string' &&
      typeof hash === 'string' &&
      SHA256.test(hash)
    )
      images.set(change.key, hash);
  }
  return images;
}

/**
 * Marks the verdict's changed shots that came from `main`.
 *
 * A shot came from `main` only when the record proves it: a merged pull
 * request's run showed the same shot changed with the same image, its merge
 * commit is in the base this run tested, and its head does not contain this
 * pull request's head. A stack's later entry or a superseding branch shows
 * this pull request's own change, and an unmerged pull request proves
 * nothing, so neither counts. A shot a report read shows with the same image,
 * unproven, says so; a shot no report read shows says it was not found. Both
 * are unknown, never "introduced here".
 *
 * @param {object} options
 * @param {any} options.verdict this run's verdict; changed in place
 * @param {any} options.manifest this run's raw manifest
 * @param {string} options.headRef this pull request's head branch
 * @param {string} options.headSha this pull request's head commit
 * @param {() => Promise<Array<{id: number, createdAt: string, headRef: string, headSha: string}>>} options.listReports
 *   other runs' `visual-pr-report` artifacts, newest first (one call)
 * @param {(id: number) => Promise<{verdict: any, manifest: any} | {unreadable: true} | null>} options.readReport
 *   one artifact's verdict and manifest; null when it is gone or has nothing
 *   to compare, `{unreadable: true}` when it cannot be opened (one call)
 * @param {(sha: string) => Promise<{number: number, mergedAt: string | null, mergeSha: string | null} | null>} options.pullFor
 *   the pull request a head commit belongs to (one call)
 * @param {(ancestor: string, descendant: string) => Promise<boolean | null>} options.contains
 *   whether `descendant` contains `ancestor`; null when a commit is gone (one call)
 * @param {number} [options.maxCalls]
 */
export async function markInherited({
  verdict,
  manifest,
  headRef,
  headSha,
  listReports,
  readReport,
  pullFor,
  contains,
  maxCalls = MAX_CALLS,
}) {
  const mine = changedImages({verdict, manifest});
  if (mine.size === 0) return verdict;
  try {
    const baseSha = verdict.context?.baseSha;
    if (typeof baseSha !== 'string' || !SHA.test(baseSha))
      throw new Error('the report records no base commit');
    if (typeof headSha !== 'string' || !SHA.test(headSha))
      throw new Error('no head commit given');
    await lookUp({
      verdict,
      mine,
      headRef,
      headSha,
      baseSha,
      listReports,
      readReport,
      pullFor,
      contains,
      maxCalls,
    });
  } catch (error) {
    // Partial results could mark a shot wrongly: mark nothing.
    for (const change of verdict.changes ?? []) delete change.inherited;
    delete verdict.inheritedChecked;
    verdict.inheritedLookupFailed = failureReason(error);
  }
  return verdict;
}

async function lookUp({
  verdict,
  mine,
  headRef,
  headSha,
  baseSha,
  listReports,
  readReport,
  pullFor,
  contains,
  maxCalls,
}) {
  let calls = 1;
  const reports = (await listReports()).filter(
    report => report.headRef && report.headRef !== headRef,
  );
  /** Heads whose report showed the shot changed with this image. @type {Map<string, string[]>} */
  const candidates = new Map();
  let read = 0;
  let tried = 0;
  let unreadable = 0;
  for (const report of reports) {
    if (calls >= maxCalls - PROOF_CALLS) break;
    calls += 1;
    tried += 1;
    const content = await readReport(report.id);
    if (content && 'unreadable' in content) {
      unreadable += 1;
      continue;
    }
    if (!content) continue;
    read += 1;
    for (const [key, hash] of changedImages(content))
      if (mine.get(key) === hash && SHA.test(report.headSha)) {
        const heads = candidates.get(key) ?? [];
        if (!heads.includes(report.headSha)) heads.push(report.headSha);
        candidates.set(key, heads);
      }
  }
  // One unreadable report is no data; none openable means the lookup broke.
  if (tried > 0 && unreadable === tried)
    throw new Error(`none of the ${tried} reports tried could be opened`);
  /** @type {Map<string, boolean>} */
  const proven = new Map();
  const fromMain = async head => {
    if (proven.has(head)) return proven.get(head);
    if (calls + 3 > maxCalls) return false;
    calls += 1;
    const pull = await pullFor(head);
    let result = false;
    if (pull?.mergedAt && pull.mergeSha && SHA.test(pull.mergeSha)) {
      calls += 1;
      if ((await contains(pull.mergeSha, baseSha)) === true) {
        calls += 1;
        // A head that contains this one carries this pull request's change;
        // one that cannot be compared counts as containing it.
        result = (await contains(headSha, head)) === false;
      }
    }
    proven.set(head, result);
    return result;
  };
  for (const change of verdict.changes ?? []) {
    if (!mine.has(change.key)) continue;
    let inherited = false;
    for (const head of candidates.get(change.key) ?? [])
      if (await fromMain(head)) {
        inherited = true;
        break;
      }
    change.inherited = inherited
      ? {from: 'main'}
      : {found: candidates.has(change.key)};
  }
  verdict.inheritedChecked = read;
}

/** The four GitHub reads, without Octokit. */
function githubReads({token, repository}) {
  const base = `https://api.github.com/repos/${repository}`;
  const get = async url => {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
      },
    });
    // An artifact or commit that is gone is no data, not a failure.
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok)
      throw new Error(`${url.replace(base, '')}: HTTP ${response.status}`);
    return response;
  };
  return {
    listReports: async () => {
      const response = await get(
        `${base}/actions/artifacts?name=visual-pr-report&per_page=100`,
      );
      const {artifacts} = response ? await response.json() : {artifacts: []};
      return (artifacts ?? [])
        .filter(artifact => !artifact.expired)
        .map(artifact => ({
          id: artifact.id,
          createdAt: artifact.created_at,
          headRef: artifact.workflow_run?.head_branch ?? '',
          headSha: artifact.workflow_run?.head_sha ?? '',
        }));
    },
    readReport: async id => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inherited-'));
      try {
        const zip = path.join(dir, 'report.zip');
        const response = await get(`${base}/actions/artifacts/${id}/zip`);
        if (!response) return null;
        fs.writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
        try {
          const names = execFileSync('unzip', ['-Z1', zip], {
            encoding: 'utf8',
            maxBuffer: 1 << 24,
          }).split('\n');
          // A report without both files (a run that planned no shots) has
          // nothing to compare.
          if (
            !names.includes('verdict.json') ||
            !names.includes('manifest.json')
          )
            return null;
          const read = name =>
            JSON.parse(
              execFileSync('unzip', ['-p', zip, name], {
                encoding: 'utf8',
                maxBuffer: 1 << 26,
              }),
            );
          return {
            verdict: read('verdict.json'),
            manifest: read('manifest.json'),
          };
        } catch {
          // A broken archive is no data; markInherited fails when none open.
          return {unreadable: true};
        }
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    pullFor: async sha => {
      const response = await get(`${base}/commits/${sha}/pulls`);
      const pulls = response ? await response.json() : [];
      const pull = (pulls ?? []).find(each => each.merged_at) ?? pulls?.[0];
      return pull
        ? {
            number: pull.number,
            mergedAt: pull.merged_at ?? null,
            mergeSha: pull.merge_commit_sha ?? null,
          }
        : null;
    },
    contains: async (ancestor, descendant) => {
      const response = await get(`${base}/compare/${ancestor}...${descendant}`);
      if (!response) return null;
      const {status} = await response.json();
      return status === 'ahead' || status === 'identical';
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flag = name => {
    const at = process.argv.indexOf(`--${name}`);
    return at === -1 ? undefined : process.argv[at + 1];
  };
  const verdictPath = flag('verdict');
  const summary = line => {
    console.error(`::warning title=Inherited visual changes::${line.trim()}`);
    if (process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, line);
  };
  let verdict;
  try {
    verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
  } catch (error) {
    // No verdict means no visual section to label; the summary still says so.
    summary(`inheritance lookup failed: ${failureReason(error)}\n`);
  }
  // A run with no changed shot has nothing to mark, and may have no manifest.
  if (verdict && (verdict.changes ?? []).length > 0) {
    try {
      const manifest = JSON.parse(fs.readFileSync(flag('manifest'), 'utf8'));
      await markInherited({
        verdict,
        manifest,
        headRef: flag('head-ref') ?? '',
        headSha: flag('head-sha') ?? '',
        ...githubReads({
          token: process.env.GITHUB_TOKEN,
          repository: process.env.GITHUB_REPOSITORY,
        }),
      });
    } catch (error) {
      verdict.inheritedLookupFailed = failureReason(error);
    }
    if (lookupSummary(verdict)) summary(lookupSummary(verdict));
    fs.writeFileSync(verdictPath, `${JSON.stringify(verdict, null, 2)}\n`);
  }
}
