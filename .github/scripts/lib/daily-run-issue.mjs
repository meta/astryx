// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The one issue a daily run on main keeps: a failed run opens it or
 *   comments on it, a passing run closes it, and a run with no verdict only
 *   notes that on the open issue.
 * @input actions/github-script's `github` and `context`, the issue's title,
 *   the run's verdict (pass, fail or none) and the text of each note.
 * @output An issue opened, commented on or closed; what it did.
 * @position The report jobs of .github/workflows/cli-minimum-node.yml (through
 *   cli-minimum-node.mjs) and .github/workflows/platform-only-tests.yml
 *   (through platform-only-report.mjs).
 */

/** The account a workflow's token writes as. */
export const BOT = 'github-actions[bot]';

/**
 * The open issue with this exact title that a workflow opened, or null. An
 * issue a person opened under the same title is never touched.
 * @param {any} github
 * @param {{repo: {owner: string, repo: string}}} context
 * @param {string} title
 */
async function findOpenIssue(github, context, title) {
  const {data} = await github.rest.search.issuesAndPullRequests({
    q: `repo:${context.repo.owner}/${context.repo.repo} is:issue is:open in:title "${title}"`,
  });
  return (
    data.items.find(item => item.title === title && item.user?.login === BOT) ??
    null
  );
}

/**
 * A failed run opens the issue, or comments on the open one; a passing run
 * closes an open issue a workflow opened; a run with no verdict only notes it
 * on an open issue. Returns what it did.
 * @param {{
 *   github: any,
 *   context: {repo: {owner: string, repo: string}},
 *   title: string,
 *   verdict: 'pass' | 'fail' | 'none',
 *   notes: {fail: string, pass: string, none: string, closesWhen: string},
 * }} report
 * @returns {Promise<'created' | 'commented' | 'closed' | 'no verdict noted' | 'none'>}
 */
export async function reportDailyIssue({
  github,
  context,
  title,
  verdict,
  notes,
}) {
  const issue = await findOpenIssue(github, context, title);
  // No verdict neither closes the issue nor says the run failed.
  if (verdict === 'none') {
    if (!issue) return 'none';
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: issue.number,
      body: notes.none,
    });
    return 'no verdict noted';
  }
  if (verdict === 'pass') {
    if (!issue) return 'none';
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: issue.number,
      body: notes.pass,
    });
    await github.rest.issues.update({
      ...context.repo,
      issue_number: issue.number,
      state: 'closed',
      state_reason: 'completed',
    });
    return 'closed';
  }
  if (issue) {
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: issue.number,
      body: notes.fail,
    });
    return 'commented';
  }
  await github.rest.issues.create({
    ...context.repo,
    title,
    body: `${notes.fail}\n\n${notes.closesWhen}`,
  });
  return 'created';
}
