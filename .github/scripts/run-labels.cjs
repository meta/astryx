// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Decides which heavy suites a pull request opted into with a
 * `ci:run-<suite>` label (spec:AST-030 FR12, FR18, DEC-7).
 *
 * A suite runs on a pull request only while the pull request carries its
 * label, and only when the newest application of that label came from someone
 * with write, maintain or admin access. Agent lanes push with write access,
 * so their labels count. The decision reads the payload of the event that
 * started the run, so applying or removing a label starts nothing; it takes
 * effect on the next push or reopen (FR17). Outside a pull request no label
 * applies, and the release check runs every suite on its own terms. Any
 * lookup that fails denies the suite (fail closed).
 */

'use strict';

// The review gate's own write-access rule, so a label and a review answer the
// same question the same way (custom write-based roles report `write`).
const {hasWritePermission} = require('./review-signal-decision.cjs');

/** Suites a pull request can opt into, by output name and label. */
const SUITE_LABELS = Object.freeze({
  visual: 'ci:run-visual',
  a11y: 'ci:run-a11y',
  rtl: 'ci:run-rtl',
});

/** Display names for the pull-request comment's not-run sentence. */
const SUITE_NAMES = Object.freeze({
  visual: 'Visual',
  a11y: 'Accessibility',
  rtl: 'RTL',
});

/**
 * The comment's sentence for a suite a pull request did not run, with the
 * label that runs it.
 */
function notRunSentence(suite) {
  return `${SUITE_NAMES[suite]} did not run on this pull request; add \`ci:run-${suite}\` to run it.`;
}

/**
 * The newest actor that applied each label, from the pull request's timeline.
 * Only the newest application counts: a later one by someone without write
 * access does not inherit an earlier maintainer's.
 */
async function newestLabelers(github, {owner, repo, number}) {
  const data = await github.graphql(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          timelineItems(last: 100, itemTypes: [LABELED_EVENT]) {
            nodes { ... on LabeledEvent { actor { login } label { name } } }
          }
        }
      }
    }`,
    {owner, repo, number},
  );
  const labelers = new Map();
  for (const event of data.repository.pullRequest.timelineItems.nodes) {
    const name = event?.label?.name;
    if (name != null) labelers.set(name, event.actor?.login ?? null);
  }
  return labelers;
}

/**
 * Decides each suite in `suites` (suite → label) without setting outputs.
 * @returns {Promise<Record<string, boolean>>}
 */
async function decideSuites({github, context, core, suites}) {
  const decisions = Object.fromEntries(
    Object.keys(suites).map(suite => [suite, false]),
  );
  const pr = context.payload.pull_request;
  if (context.eventName === 'pull_request' && pr != null) {
    const carried = new Set((pr.labels ?? []).map(label => label.name));
    const wanted = Object.entries(suites).filter(([, label]) =>
      carried.has(label),
    );
    if (wanted.length > 0) {
      const {owner, repo} = context.repo;
      let labelers = new Map();
      try {
        labelers = await newestLabelers(github, {
          owner,
          repo,
          number: pr.number,
        });
      } catch (error) {
        core.warning(
          `Could not read who applied the ci:run labels: ${error.message}`,
        );
      }
      // One lookup per labeler; a failed lookup denies only that labeler's
      // suites.
      const access = new Map();
      const accessOf = async login => {
        if (!access.has(login)) {
          try {
            const {data} =
              await github.rest.repos.getCollaboratorPermissionLevel({
                owner,
                repo,
                username: login,
              });
            access.set(login, {
              writes: hasWritePermission(data),
              permission: data?.permission ?? null,
            });
          } catch (error) {
            core.warning(`Could not check ${login}'s access: ${error.message}`);
            access.set(login, {writes: false, permission: null});
          }
        }
        return access.get(login);
      };
      for (const [suite, label] of wanted) {
        const login = labelers.get(label) ?? null;
        const {writes, permission} =
          login == null
            ? {writes: false, permission: null}
            : await accessOf(login);
        decisions[suite] = writes;
        if (!writes) {
          core.notice(
            login == null
              ? `No ${label} label event could be read; the ${suite} suite does not run.`
              : `${label} was applied by ${login} (${permission ?? 'unknown access'}); only write access runs the ${suite} suite.`,
          );
        }
      }
    }
  }
  return decisions;
}

/**
 * Decides every CI suite and sets one `true`/`false` output per suite.
 * @returns {Promise<Record<string, boolean>>}
 */
async function decideRunLabels({github, context, core}) {
  const decisions = await decideSuites({
    github,
    context,
    core,
    suites: SUITE_LABELS,
  });
  for (const [suite, runs] of Object.entries(decisions)) {
    core.setOutput(suite, String(runs));
  }
  return decisions;
}

/**
 * Decides one suite that lives in its own workflow (the nightly perf lane's
 * `ci:run-perf`), under the same rule as the CI suites. Sets no output.
 * @returns {Promise<boolean>}
 */
async function decideRunLabel({github, context, core, suite, label}) {
  const decisions = await decideSuites({
    github,
    context,
    core,
    suites: {[suite]: label},
  });
  return decisions[suite];
}

module.exports = {
  SUITE_LABELS,
  decideRunLabel,
  decideRunLabels,
  notRunSentence,
};
