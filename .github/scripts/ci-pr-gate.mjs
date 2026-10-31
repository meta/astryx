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

/**
 * The job's own condition, without the gate in front, nor the heavy-suite
 * deferral a heavy job adds after it (spec:AST-030 FR20).
 */
export function ungated(condition) {
  let expression = condition.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  for (const gate of [PR_CI_GATE, PR_REPORT_GATE]) {
    const prefix = `${gate} && (`;
    if (expression.startsWith(prefix)) {
      expression = expression.slice(prefix.length, -1);
      break;
    }
  }
  if (expression.startsWith(`${HEAVY_RUNS} && (`))
    expression = expression.slice(HEAVY_RUNS.length + 5, -1);
  return expression;
}

/**
 * A push that defers the heavy suites (spec:AST-030 FR20, DEC-14): a push to a
 * ready pull request from the shared agent login, in its first attempt, into
 * `main`. A release merge-back is never deferred. The `heavy-ci` job runs only
 * then, and defers unless the change is spec-only.
 */
/**
 * The shared agent logins. The heavy-suite caps
 * (.github/actions/heavy-caps) list the same logins, and a test holds the two
 * lists equal.
 */
export const SHARED_AGENT_LOGINS = ['cixzhang'];

export const HEAVY_CANDIDATE =
  "(github.event_name == 'pull_request' && github.event.action == 'synchronize' && " +
  `github.run_attempt == '1' && contains(fromJSON('${JSON.stringify(SHARED_AGENT_LOGINS)}'), github.event.pull_request.user.login) && ` +
  "github.base_ref == 'main' && !startsWith(github.head_ref, 'chore/merge-v'))";

/** `heavy-ci` decided to defer this push's heavy suites. */
export const HEAVY_DEFERRED = "needs.heavy-ci.outputs.deferred == 'true'";

/**
 * A heavy job's condition after the gate. `heavy-ci` skips for every push it
 * does not decide, so the job runs then too (`!cancelled()`, not success()).
 */
export const HEAVY_RUNS =
  "!cancelled() && needs.heavy-ci.outputs.deferred != 'true'";

/** What a deferred required check and the PR report say. */
export const HEAVY_DEFERRED_MESSAGE =
  'Heavy CI deferred: runs when marked ready and before merge';
