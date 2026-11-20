// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Opens, or adds to, the one open nightly perf regression issue.
 * @input `report` (report.json from perf-trend.mjs), and actions/github-script's
 *   `github` and `context`
 * @output An issue titled PERF_ISSUE_TITLE when none is open, else a comment
 *   on the open one; nothing when the report has no regression or was not
 *   recorded (a pull request or a branch run)
 * @position The report job of .github/workflows/perf-nightly.yml, with
 *   `issues: write`. The commit range is the compare view since the last good
 *   nightly; its commits are listed (up to MAX_COMMITS) instead of bisecting,
 *   because one bisect step costs a full build and measurement.
 */

export const PERF_ISSUE_TITLE = 'Nightly perf regression';
export const MAX_COMMITS = 30;
const BOT = 'github-actions[bot]';

function formatValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** The Markdown that describes one report's regressions. */
export async function describeReport({github, context, report}) {
  const {owner, repo} = context.repo;
  const lines = [
    `Nightly perf run on ${report.sha.slice(0, 7)} found ${report.regressions.length} metric(s) more than 10% worse than their 7-day median, as on the recorded run before it: [run](${report.runUrl}).`,
    '',
    '| Scene | Metric | This run | 7-day median | Change |',
    '| --- | --- | ---: | ---: | ---: |',
    ...report.regressions.map(
      r =>
        `| ${r.scene} | ${r.metric} | ${formatValue(r.value)} | ${formatValue(r.median)} | ${r.change == null ? `+${formatValue(r.value - r.median)}` : `+${Math.round(r.change * 100)}%`} |`,
    ),
    '',
  ];
  if (report.range == null) {
    const good = report.lastGood;
    lines.push(
      good == null
        ? 'No earlier good nightly run is recorded, so there is no commit range yet.'
        : `No commit landed since the last good run on ${good.sha.slice(0, 7)} ([run](https://github.com/${owner}/${repo}/actions/runs/${good.runId})): the code is the same, so the change comes from the runner.`,
    );
    return lines.join('\n');
  }
  const {from, to} = report.range;
  lines.push(
    `Commits since the last good run: [${from.slice(0, 7)}…${to.slice(0, 7)}](https://github.com/${owner}/${repo}/compare/${from}...${to})`,
  );
  try {
    const {data} = await github.rest.repos.compareCommits({
      owner,
      repo,
      base: from,
      head: to,
      per_page: MAX_COMMITS,
    });
    // Oldest first, as the compare view lists them.
    const commits = data.commits.slice(0, MAX_COMMITS);
    lines.push(
      '',
      ...commits.map(
        commit =>
          `- ${commit.sha.slice(0, 7)} ${commit.commit.message.split('\n')[0]}`,
      ),
    );
    if (data.total_commits > commits.length) {
      lines.push(`- … and ${data.total_commits - commits.length} more`);
    }
  } catch (error) {
    lines.push('', `(The commit list could not be read: ${error.message})`);
  }
  return lines.join('\n');
}

/**
 * Creates the regression issue or comments on the open one. Returns what it
 * did: 'none', 'created' or 'commented'.
 */
export async function upsertRegressionIssue({github, context, report}) {
  if (!report.recorded || report.regressions.length === 0) return 'none';
  const {owner, repo} = context.repo;
  const body = await describeReport({github, context, report});
  const open = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    creator: BOT,
    per_page: 100,
  });
  const existing = open.find(
    issue => issue.title === PERF_ISSUE_TITLE && issue.pull_request == null,
  );
  if (existing) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: existing.number,
      body,
    });
    return 'commented';
  }
  await github.rest.issues.create({owner, repo, title: PERF_ISSUE_TITLE, body});
  return 'created';
}
