// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI's declared minimum Node, and the one issue that reports a run
 *   on it.
 * @input `minimum --package <package.json>` prints the lowest Node version its
 *   `engines.node` range allows. `reportIssue` takes actions/github-script's
 *   `github` and `context`, whether the run passed, the version and the run
 *   link.
 * @output The version on stdout (exit 1 when the range has no lower bound this
 *   reads); an issue opened, commented on or closed.
 * @position .github/workflows/cli-minimum-node.yml: the daily main-only run of
 *   the CLI's tests and global-mode smoke on that version. The version comes
 *   from the CLI's own `engines.node`, not from .nvmrc, which names the
 *   version the rest of CI uses.
 */

import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export const ISSUE_TITLE = 'CLI fails on its minimum Node';
const BOT = 'github-actions[bot]';

function parseVersion(text) {
  const match = /^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(text);
  if (!match) return null;
  const part = value =>
    value == null || value === 'x' || value === '*' ? 0 : Number(value);
  return [Number(match[1]), part(match[2]), part(match[3])];
}

function compare(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * The lowest version a semver range allows: the least lower bound across its
 * `||` alternatives. A bound is `>=X`, `^X`, `~X`, `=X`, `X` or `X - Y`. A range
 * with an alternative that has no such bound throws, so the job fails rather
 * than testing a guessed version.
 */
export function minimumVersion(range) {
  if (typeof range !== 'string' || range.trim() === '') {
    throw new Error('engines.node is missing');
  }
  let lowest = null;
  for (const raw of range.split('||')) {
    const alternative = raw.trim();
    let bound = null;
    const hyphen = /^(\S+)\s+-\s+\S+$/.exec(alternative);
    const lowerBounds = hyphen
      ? [hyphen[1]]
      : alternative
          .split(/\s+/)
          .filter(token => token !== '' && !token.startsWith('<'))
          .map(token => {
            if (token.startsWith('>') && !token.startsWith('>=')) {
              throw new Error(
                `engines.node "${range}": an exclusive bound (${token}) has no lowest version`,
              );
            }
            return token.replace(/^(>=|\^|~|=)/, '');
          });
    for (const text of lowerBounds) {
      const version = parseVersion(text);
      if (version == null) {
        throw new Error(`engines.node "${range}": cannot read "${text}"`);
      }
      // Within one alternative every bound holds, so the highest one is its floor.
      if (bound == null || compare(version, bound) > 0) bound = version;
    }
    if (bound == null) {
      throw new Error(
        `engines.node "${range}" has an alternative with no lower bound: "${alternative}"`,
      );
    }
    if (lowest == null || compare(bound, lowest) < 0) lowest = bound;
  }
  return lowest.join('.');
}

async function findOpenIssue(github, context) {
  const {data} = await github.rest.search.issuesAndPullRequests({
    q: `repo:${context.repo.owner}/${context.repo.repo} is:issue is:open in:title "${ISSUE_TITLE}"`,
  });
  return (
    data.items.find(
      item => item.title === ISSUE_TITLE && item.user?.login === BOT,
    ) ?? null
  );
}

/**
 * A failed run opens the issue, or comments on the open one; a passing run
 * closes an open issue this job opened. Returns what it did.
 */
export async function reportIssue({github, context, ok, version, runUrl}) {
  const issue = await findOpenIssue(github, context);
  if (ok) {
    if (!issue) return 'none';
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: issue.number,
      body: `The CLI's tests and global-mode smoke pass on Node ${version} again: [run](${runUrl}).`,
    });
    await github.rest.issues.update({
      ...context.repo,
      issue_number: issue.number,
      state: 'closed',
      state_reason: 'completed',
    });
    return 'closed';
  }
  const note = `The CLI's tests or global-mode smoke failed on Node ${version}, the minimum its \`engines.node\` declares: [run](${runUrl}).`;
  if (issue) {
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: issue.number,
      body: note,
    });
    return 'commented';
  }
  await github.rest.issues.create({
    ...context.repo,
    title: ISSUE_TITLE,
    body: `${note}\n\nThis issue closes once a daily run passes on that version again.`,
  });
  return 'created';
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [, , command, flag, file] = process.argv;
  if (command !== 'minimum' || flag !== '--package' || !file) {
    console.error(
      'usage: cli-minimum-node.mjs minimum --package <package.json>',
    );
    process.exit(2);
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(minimumVersion(pkg.engines?.node));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
