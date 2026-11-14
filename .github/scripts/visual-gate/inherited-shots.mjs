// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Marks a pull request's changed visual shots that it did not make.
 * @input This run's verdict (the re-encoded report's `verdict.json`) and its
 *   raw `manifest.json` (each shot's sha256), and other pull requests'
 *   `visual-pr-report` artifacts, read through the GitHub API.
 * @output Each changed shot that another pull request's run also showed
 *   changed, with the same image, gets `inherited: {pr}`: the pull request
 *   that introduced it when the record shows one, else `pr: null`. With more
 *   changed shots than the API budget covers, `inheritedNotChecked` counts
 *   the shots left unchecked. A failed lookup marks nothing and sets
 *   `inheritedLookupFailed` to its reason, which the comment and the step
 *   summary show, so a broken lookup is never silent.
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
/** Other pull requests' reports examined, newest first. */
export const MAX_REPORTS = 100;
const SHA256 = /^[0-9a-f]{64}$/;

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
 * Marks the verdict's changed shots that other pull requests' runs showed
 * changed with the same image.
 *
 * A shot is inherited when another pull request's report shows it changed
 * with the same image: two pull requests do not make the same change, so it
 * came from `main`. It names the introducer only when the record proves it:
 * every retained report was read; the earliest report showing the change is
 * a merged pull request's, merged before every other report showing it was
 * made; and a run between that report and its merge planned the shot
 * unchanged, so `main` did not have the change until that merge. Anything
 * less (a change merged without a visual report of its own, as a skipped
 * wide change is) says the introducer is not recorded rather than naming a
 * pull request that only inherited the change.
 *
 * @param {object} options
 * @param {any} options.verdict this run's verdict; changed in place
 * @param {any} options.manifest this run's raw manifest
 * @param {string} options.headRef this pull request's head branch
 * @param {() => Promise<Array<{id: number, createdAt: string, headRef: string, headSha: string}>>} options.listReports
 *   other runs' `visual-pr-report` artifacts, newest first (one call)
 * @param {(id: number) => Promise<{verdict: any, manifest: any} | null>} options.readReport
 *   one artifact's verdict and manifest (one call)
 * @param {(sha: string) => Promise<{number: number, mergedAt: string | null} | null>} options.pullFor
 *   the pull request a head commit belongs to (one call)
 * @param {number} [options.maxCalls]
 */
export async function markInherited({
  verdict,
  manifest,
  headRef,
  listReports,
  readReport,
  pullFor,
  maxCalls = MAX_CALLS,
}) {
  const mine = changedImages({verdict, manifest});
  if (mine.size === 0) return verdict;
  try {
    return await lookUp({
      verdict,
      mine,
      headRef,
      listReports,
      readReport,
      pullFor,
      maxCalls,
    });
  } catch (error) {
    // Partial results could name the wrong pull request: mark nothing.
    for (const change of verdict.changes ?? []) delete change.inherited;
    delete verdict.inheritedNotChecked;
    verdict.inheritedLookupFailed = failureReason(error);
    return verdict;
  }
}

async function lookUp({
  verdict,
  mine,
  headRef,
  listReports,
  readReport,
  pullFor,
  maxCalls,
}) {
  let calls = 0;
  const spend = () => (calls < maxCalls ? ((calls += 1), true) : false);
  /** @type {Map<string, Array<{createdAt: string, headSha: string}>>} */
  const seen = new Map();
  /** Times a run planned the shot and left it unchanged. @type {Map<string, string[]>} */
  const unchangedAt = new Map();
  let complete = false;
  if (spend()) {
    const reports = (await listReports())
      .filter(report => report.headRef && report.headRef !== headRef)
      .slice(0, MAX_REPORTS);
    complete = true;
    for (const report of reports) {
      // Keep a call for each introducer lookup the matches may need.
      if (calls >= maxCalls - Math.min(mine.size, 3)) {
        complete = false;
        break;
      }
      spend();
      const read = await readReport(report.id);
      if (!read) continue;
      const theirs = changedImages(read);
      for (const [key, hash] of theirs)
        if (mine.get(key) === hash) {
          const list = seen.get(key) ?? [];
          list.push({createdAt: report.createdAt, headSha: report.headSha});
          seen.set(key, list);
        }
      for (const key of mine.keys())
        if (read.manifest?.shots?.[key] && !theirs.has(key))
          unchangedAt.set(key, [
            ...(unchangedAt.get(key) ?? []),
            report.createdAt,
          ]);
    }
  }
  /** @type {Map<string, {number: number, mergedAt: string | null} | null>} */
  const pulls = new Map();
  let unchecked = 0;
  for (const change of verdict.changes ?? []) {
    const matches = seen.get(change.key);
    if (!matches) {
      if (!complete && mine.has(change.key)) unchecked += 1;
      continue;
    }
    const sorted = [...matches].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    const earliest = sorted[0];
    if (!pulls.has(earliest.headSha))
      pulls.set(
        earliest.headSha,
        spend() ? await pullFor(earliest.headSha) : null,
      );
    const pull = pulls.get(earliest.headSha);
    const introduced =
      complete &&
      pull?.mergedAt != null &&
      sorted.slice(1).every(other => other.createdAt > pull.mergedAt) &&
      (unchangedAt.get(change.key) ?? []).some(
        at => at >= earliest.createdAt && at < pull.mergedAt,
      );
    change.inherited = {pr: introduced ? pull.number : null};
  }
  if (unchecked > 0) verdict.inheritedNotChecked = unchecked;
  return verdict;
}

/** The three GitHub reads, without Octokit. */
function githubReads({token, repository}) {
  const base = `https://api.github.com/repos/${repository}`;
  const get = async url => {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
      },
    });
    // An artifact that expired after the list is gone, not a failure.
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok)
      throw new Error(`${url.replace(base, '')}: HTTP ${response.status}`);
    return response;
  };
  return {
    listReports: async () => {
      const {artifacts} = await (
        await get(
          `${base}/actions/artifacts?name=visual-pr-report&per_page=100`,
        )
      ).json();
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
        const names = execFileSync('unzip', ['-Z1', zip], {
          encoding: 'utf8',
          maxBuffer: 1 << 24,
        }).split('\n');
        // A report without both files has no images to compare.
        if (!names.includes('verdict.json') || !names.includes('manifest.json'))
          return null;
        const read = name =>
          JSON.parse(
            execFileSync('unzip', ['-p', zip, name], {
              encoding: 'utf8',
              maxBuffer: 1 << 26,
            }),
          );
        return {verdict: read('verdict.json'), manifest: read('manifest.json')};
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    pullFor: async sha => {
      const response = await get(`${base}/commits/${sha}/pulls`);
      const pulls = response ? await response.json() : [];
      const pull = (pulls ?? []).find(each => each.merged_at) ?? pulls?.[0];
      return pull
        ? {number: pull.number, mergedAt: pull.merged_at ?? null}
        : null;
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
  if (verdict) {
    try {
      const manifest = JSON.parse(fs.readFileSync(flag('manifest'), 'utf8'));
      await markInherited({
        verdict,
        manifest,
        headRef: flag('head-ref') ?? '',
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
