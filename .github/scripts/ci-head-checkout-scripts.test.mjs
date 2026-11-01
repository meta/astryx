// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-head-checkout-scripts.test.mjs
 * @input .github/workflows/ci.yml
 * @output Fails when a pull-request job that checks out the pull request's
 *   head runs a repository script the head may predate, with no guard
 * @position Contract test for ci.yml (spec:AST-030 FR12, FR13)
 *
 * A job that checks out `pull_request.head.sha` measures the head, so its
 * evidence stays bound to the commit a reviewer read. It also runs the
 * repository scripts at that head: a branch cut before a script existed has
 * none, and the step fails with "Cannot find module" on an unrelated pull
 * request. Every script such a step runs is either established (older than
 * any branch still expected to run CI, listed below with its reason) or
 * guarded: the step's condition requires `hashFiles('<script>') != ''`, the
 * job's scope step names it as `requires-head-file` and the step reads
 * `head_file_present`, the step loads it from the workflow's own commit
 * (`git show "$WORKFLOW_SHA:<script>"`), or the step checks for it itself
 * (`[ ! -f ... ]`). A job that does not measure the head takes the default
 * merge checkout instead, and this test does not apply to it.
 *
 * Scope: `.js`, `.mjs` and `.cjs` scripts named in a step's `run:`.
 */

import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const ci = yaml.parse(
  fs.readFileSync(new URL('../workflows/ci.yml', import.meta.url), 'utf8'),
);

/**
 * Scripts every branch still running CI has: present on `main` for weeks, or
 * one without which the head cannot build at all (merging main is the only
 * fix, and the build failure says so).
 */
const ESTABLISHED = new Set([
  '.github/scripts/accessibility-audit.js',
  '.github/scripts/analyze-pr.js',
  '.github/scripts/a11y-pr-scope.mjs',
  '.github/scripts/modal-close-visibility.js',
  '.github/scripts/theme-var-reachability.js',
  '.github/scripts/story-play-guard.js',
  '.github/scripts/rtl-report-completion.mjs',
  '.github/scripts/rtl-shard-scope.mjs',
  'apps/storybook/rtl-audit/rtl-audit.mjs',
  'scripts/verify-exports.mjs',
  // Builds the packages and Storybook: a head without it has nothing to test.
  '.github/scripts/build-packages-and-storybook.mjs',
]);

/**
 * Jobs that check out the head but never run on a stale pull-request branch:
 * the release check runs from `main`, and a release bump is cut from current
 * `main` by the release automation.
 */
const NOT_ON_STALE_BRANCHES = new Set([
  'release-bump',
  'pr-a11y-shard',
  'pr-a11y-audit',
  'a11y-contracts-shard',
]);

const SCRIPT =
  /(?:\.github\/scripts|scripts|apps\/storybook\/rtl-audit)\/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js)/g;

function checksOutHead(job) {
  return (job.steps ?? []).some(
    step =>
      String(step.uses ?? '').startsWith('actions/checkout@') &&
      String(step.with?.ref ?? '').includes('pull_request.head.sha') &&
      !step.with?.path &&
      !step.with?.['sparse-checkout'],
  );
}

/**
 * Whether a step's own shell skips when this exact script is missing:
 * `[ ! -f <script> ]`, or `[ ! -f "$VAR" ]` where VAR holds the script,
 * followed by `exit 0`. Another script in the same step is not covered.
 */
export function skipsWhenMissing(run, script) {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variables = [
    ...run.matchAll(
      new RegExp(
        `^\\s*([A-Za-z_][A-Za-z0-9_]*)=["']?${escaped}["']?\\s*$`,
        'gm',
      ),
    ),
  ].map(match => match[1]);
  const targets = [
    escaped,
    ...variables.flatMap(name => [`\\$${name}`, `\\$\\{${name}\\}`]),
  ];
  return targets.some(target =>
    new RegExp(
      `if \\[ ! -f "?${target}"? \\]; then[\\s\\S]*?exit 0[\\s\\S]*?fi`,
    ).test(run),
  );
}

export function unguardedScripts(job) {
  const scope = (job.steps ?? []).find(step =>
    String(step.uses ?? '').includes('test-scope'),
  );
  const requiredHeadFile = scope?.with?.['requires-head-file'];
  const findings = [];
  for (const step of job.steps ?? []) {
    const condition = String(step.if ?? '');
    const run = String(step.run ?? '');
    for (const [script] of run.matchAll(SCRIPT)) {
      if (ESTABLISHED.has(script)) continue;
      if (condition.includes(`hashFiles('${script}') != ''`)) continue;
      // Loaded from the workflow's own commit, not the head.
      if (run.includes(`$WORKFLOW_SHA:${script}`)) continue;
      // The step skips a head without this script on its own.
      if (skipsWhenMissing(run, script)) continue;
      if (
        script === requiredHeadFile &&
        condition.includes('head_file_present')
      ) {
        continue;
      }
      findings.push(`${step.name}: ${script}`);
    }
  }
  return findings;
}

describe('pull-request jobs that check out the head', () => {
  const headJobs = Object.entries(ci.jobs).filter(
    ([name, job]) => checksOutHead(job) && !NOT_ON_STALE_BRANCHES.has(name),
  );

  it('are found', () => {
    expect(headJobs.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        'build-storybook',
        'pr-a11y-guards',
        'pr-a11y-specs',
        'pr-rtl-shard',
      ]),
    );
  });

  it('run only established scripts, or guard each newer one', () => {
    const findings = Object.fromEntries(
      headJobs
        .map(([name, job]) => [name, unguardedScripts(job)])
        .filter(([, list]) => list.length > 0),
    );
    expect(findings).toEqual({});
  });

  it('say visibly when a guarded step skips on a head that predates its script', () => {
    for (const [, job] of headJobs) {
      for (const step of job.steps ?? []) {
        for (const [, script] of String(step.if ?? '').matchAll(
          /hashFiles\('([^']+)'\) != ''/g,
        )) {
          if (!SCRIPT.test(script)) continue;
          SCRIPT.lastIndex = 0;
          // The notice runs exactly when the guarded step would have, but
          // the head lacks the script: never on a pull request the step skips.
          const base = String(step.if)
            .replace(` && hashFiles('${script}') != ''`, '')
            .replace(/^\((.*)\)$/, '$1');
          const notice = job.steps.find(
            candidate =>
              String(candidate.if ?? '') ===
                `(${base}) && hashFiles('${script}') == ''` &&
              String(candidate.run ?? '').includes('::notice::'),
          );
          expect(notice, `${step.name}: ${script}`).toBeDefined();
        }
      }
    }
  });

  it("exempts only the script a step's own missing-file check names", () => {
    const run = [
      'D7_TEST=.github/scripts/d7.test.mjs',
      'if [ ! -f "$D7_TEST" ]; then',
      "  echo '::notice::skipped'",
      '  exit 0',
      'fi',
      'node .github/scripts/other-new.mjs',
    ].join('\n');
    expect(skipsWhenMissing(run, '.github/scripts/d7.test.mjs')).toBe(true);
    expect(skipsWhenMissing(run, '.github/scripts/other-new.mjs')).toBe(false);
    expect(unguardedScripts({steps: [{name: 'Mixed step', run}]})).toEqual([
      'Mixed step: .github/scripts/other-new.mjs',
    ]);
  });

  it('catches a newer script with no guard', () => {
    expect(
      unguardedScripts({
        steps: [
          {
            name: 'Run a new check',
            run: 'node .github/scripts/new-check.mjs',
          },
        ],
      }),
    ).toEqual(['Run a new check: .github/scripts/new-check.mjs']);
  });
});
