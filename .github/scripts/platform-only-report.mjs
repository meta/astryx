// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The one issue that reports the daily platform-only run on main.
 * @input actions/github-script's `github` and `context` for the running
 *   workflow run; its legs' jobs, read through the Actions API.
 * @output An issue opened, commented on or closed (lib/daily-run-issue.mjs),
 *   naming each failed leg's case and the run link only; what it did.
 * @position The report job of .github/workflows/platform-only-tests.yml, on a
 *   scheduled run only.
 */

import {reportDailyIssue} from './lib/daily-run-issue.mjs';
import {PLATFORM_ONLY} from './platform-only-cases.mjs';

export const ISSUE_TITLE = 'Platform-only tests fail on main';

/**
 * Each leg's verdict from its job's conclusion: "pass" for success, "fail"
 * for a failure or a time-out, and "none" for anything else (cancelled,
 * skipped, or a leg with no job).
 * @param {Array<{name: string, conclusion: string | null}>} jobs
 * @returns {Array<{case: string, os: string, verdict: 'pass' | 'fail' | 'none'}>}
 */
export function legVerdicts(jobs) {
  return PLATFORM_ONLY.map(entry => {
    const job = jobs.find(item => item.name === `platform-only (${entry.os})`);
    const conclusion = job?.conclusion;
    const verdict =
      conclusion === 'success'
        ? 'pass'
        : conclusion === 'failure' || conclusion === 'timed_out'
          ? 'fail'
          : 'none';
    return {case: entry.case, os: entry.os, verdict};
  });
}

/**
 * The run's verdict: "fail" when a leg failed, else "none" when a leg judged
 * nothing, else "pass".
 * @param {Array<{verdict: 'pass' | 'fail' | 'none'}>} legs
 * @returns {'pass' | 'fail' | 'none'}
 */
export function runVerdict(legs) {
  if (legs.some(leg => leg.verdict === 'fail')) return 'fail';
  return legs.some(leg => leg.verdict === 'none') ? 'none' : 'pass';
}

/**
 * Reads this run's legs and opens, updates or closes the issue.
 * @param {{github: any, context: any}} script
 */
export async function reportPlatformOnly({github, context}) {
  const {data} = await github.rest.actions.listJobsForWorkflowRun({
    ...context.repo,
    run_id: context.runId,
    per_page: 100,
  });
  const legs = legVerdicts(data.jobs);
  const verdict = runVerdict(legs);
  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const failed = legs
    .filter(leg => leg.verdict === 'fail')
    .map(leg => `"${leg.case}" (${leg.os})`)
    .join(', ');
  return reportDailyIssue({
    github,
    context,
    title: ISSUE_TITLE,
    verdict,
    notes: {
      fail: `The daily platform-only run failed on main: ${failed}. [Run](${runUrl}).`,
      pass: `The daily platform-only run passes on main again: [run](${runUrl}).`,
      none: `No verdict from the daily platform-only run: a leg stopped, was cancelled or was skipped before it judged anything ([run](${runUrl})). This issue stays as it is.`,
      closesWhen: 'This issue closes once a daily run passes again.',
    },
  });
}
