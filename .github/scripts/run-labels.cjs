// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Decides which heavy suites a pull request opted into with a
 * `ci:run-<suite>` label (spec:AST-030 FR12, DEC-7).
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

/** Suites a pull request can opt into, by output name and label. */
const SUITE_LABELS = Object.freeze({
  visual: 'ci:run-visual',
  a11y: 'ci:run-a11y',
  rtl: 'ci:run-rtl',
});

const WRITE_ROLES = new Set(['admin', 'maintain', 'write']);

/** Display names for the pull-request comment's not-run sentence. */
const SUITE_NAMES = Object.freeze({
  visual: 'Visual',
  a11y: 'Accessibility',
  rtl: 'RTL',
  perf: 'Perf',
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
 * Decides every suite and sets one `true`/`false` output per suite.
 * @returns {Promise<Record<string, boolean>>}
 */
async function decideRunLabels({github, context, core}) {
  const decisions = Object.fromEntries(
    Object.keys(SUITE_LABELS).map(suite => [suite, false]),
  );
  const pr = context.payload.pull_request;
  if (context.eventName === 'pull_request' && pr != null) {
    const carried = new Set((pr.labels ?? []).map(label => label.name));
    const wanted = Object.entries(SUITE_LABELS).filter(([, label]) =>
      carried.has(label),
    );
    if (wanted.length > 0) {
      const {owner, repo} = context.repo;
      let labelers = new Map();
      const roles = new Map();
      try {
        labelers = await newestLabelers(github, {
          owner,
          repo,
          number: pr.number,
        });
        for (const [, label] of wanted) {
          const login = labelers.get(label);
          if (login != null && !roles.has(login)) {
            const {data} =
              await github.rest.repos.getCollaboratorPermissionLevel({
                owner,
                repo,
                username: login,
              });
            roles.set(login, data.role_name);
          }
        }
      } catch (error) {
        core.warning(
          `Could not check who applied the ci:run labels: ${error.message}`,
        );
      }
      for (const [suite, label] of wanted) {
        const login = labelers.get(label) ?? null;
        const role = login == null ? null : (roles.get(login) ?? null);
        decisions[suite] = WRITE_ROLES.has(role);
        if (!decisions[suite]) {
          core.notice(
            login == null
              ? `No ${label} label event could be read; the ${suite} suite does not run.`
              : `${label} was applied by ${login} (${role ?? 'unknown role'}); only write, maintain or admin access runs the ${suite} suite.`,
          );
        }
      }
    }
  }
  for (const [suite, runs] of Object.entries(decisions)) {
    core.setOutput(suite, String(runs));
  }
  return decisions;
}

module.exports = {SUITE_LABELS, decideRunLabels, notRunSentence};
