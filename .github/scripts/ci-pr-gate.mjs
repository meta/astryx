// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file When a pull request runs CI (spec:AST-030 FR17). A draft runs
 * nothing. A pull request runs CI when its branch lives in this repository
 * (pushing one needs write access) or a maintainer has labelled it `ci:run`.
 * Every other event (a push to main, a merge-group entry, a dispatch) passes.
 *
 * Jobs that report a required context keep only the draft skip: for a pull
 * request CI does not run, their first step fails with the reason, because a
 * skipped required check counts as passing.
 */

const TRUSTED =
  '(github.event.pull_request.head.repo.full_name == github.repository || ' +
  "contains(github.event.pull_request.labels.*.name, 'ci:run'))";

/** Every job that can start on a pull request begins with this. */
export const PR_CI_GATE = `(github.event_name != 'pull_request' || !github.event.pull_request.draft && ${TRUSTED})`;

/** A job that reports a required context begins with this instead. */
export const PR_REPORT_GATE =
  "(github.event_name != 'pull_request' || !github.event.pull_request.draft)";

/** The condition of a required job's first step, which fails with the reason. */
export const PR_HELD = `github.event_name == 'pull_request' && !${TRUSTED}`;

/** A job condition with a gate in front: `${{ GATE && (condition) }}`. */
export function gated(condition, gate = PR_CI_GATE) {
  if (condition == null || condition === '') return gate;
  const expression = condition.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const wrapped = `${gate} && (${expression})`;
  return condition.startsWith('${{') ? `\${{ ${wrapped} }}` : wrapped;
}

/** The job's own condition, without the gate in front. */
export function ungated(condition) {
  const expression = condition.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  for (const gate of [PR_CI_GATE, PR_REPORT_GATE]) {
    const prefix = `${gate} && (`;
    if (expression.startsWith(prefix))
      return expression.slice(prefix.length, -1);
  }
  return expression;
}
