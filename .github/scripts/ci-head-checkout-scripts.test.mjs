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
 * (`git show "$WORKFLOW_SHA:<script>"`, or from the job's `.test-scope`
 * checkout, whose sparse directories hold it, directly or through a copy an
 * earlier step made in `$RUNNER_TEMP`), the step runs in the job's merge
 * checkout before its head checkout replaces the workspace, or the step checks
 * for it itself (`[ ! -f ... ]`). A job that does not measure the head takes the default
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
  // The docsite's data generator, on main since the docsite began.
  'apps/docsite/scripts/generate-data.mjs',
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
  /(?:\.github\/scripts|apps\/docsite\/scripts|scripts|apps\/storybook\/rtl-audit)\/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js)/g;

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

/**
 * Whether the job's scope checkout (`path: .test-scope`, the workflow's own
 * commit) holds the script: a sparse-checkout directory contains it.
 */
export function scopeHolds(job, script) {
  const scope = (job.steps ?? []).find(
    step =>
      String(step.uses ?? '').startsWith('actions/checkout@') &&
      step.with?.path === '.test-scope' &&
      step.with?.ref == null,
  );
  const dirs = String(scope?.with?.['sparse-checkout'] ?? '')
    .split('\n')
    .map(line => line.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return dirs.some(dir => script.startsWith(`${dir}/`));
}

/**
 * Whether the step runs `$RUNNER_TEMP/<dir>/<script>` that an earlier step of
 * the job copied there from the scope checkout:
 * `cp .test-scope/<script> "$RUNNER_TEMP/<dir>/<script's directory>/"`.
 */
export function copiedFromScope(job, step, script) {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const used = new RegExp(`\\$RUNNER_TEMP/([\\w.-]+)/${escaped}`).exec(
    String(step.run ?? ''),
  );
  if (!used || !scopeHolds(job, script)) return false;
  const copy = `cp .test-scope/${script} "$RUNNER_TEMP/${used[1]}/${script.slice(0, script.lastIndexOf('/') + 1)}"`;
  const steps = job.steps ?? [];
  return steps
    .slice(0, steps.indexOf(step))
    .some(
      earlier =>
        String(earlier.run ?? '').includes(copy) &&
        beforeHeadCheckout(job, earlier),
    );
}

/** Whether the step runs before the job's head checkout replaces the workspace. */
export function beforeHeadCheckout(job, step) {
  const steps = job.steps ?? [];
  const head = steps.findIndex(
    each =>
      String(each.uses ?? '').startsWith('actions/checkout@') &&
      String(each.with?.ref ?? '').includes('pull_request.head.sha') &&
      !each.with?.path,
  );
  return head === -1 || steps.indexOf(step) < head;
}

/**
 * Whether the step runs in the job's merge checkout (the workflow's own
 * commit): a workspace checkout with no `ref` comes before the step, and the
 * head checkout comes after it.
 */
export function inMergeCheckout(job, step) {
  const steps = job.steps ?? [];
  const merge = steps.findIndex(
    each =>
      String(each.uses ?? '').startsWith('actions/checkout@') &&
      each.with?.ref == null &&
      !each.with?.path,
  );
  return (
    merge !== -1 && merge < steps.indexOf(step) && beforeHeadCheckout(job, step)
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
      // Read from the job's scope checkout, also the workflow's own commit,
      // before the head checkout replaces the workspace.
      if (
        run.includes(`.test-scope/${script}`) &&
        scopeHolds(job, script) &&
        beforeHeadCheckout(job, step)
      )
        continue;
      if (inMergeCheckout(job, step)) continue;
      // Run from a copy an earlier step took from that scope checkout.
      if (copiedFromScope(job, step, script)) continue;
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

  it('exempts a step in the merge checkout only before the head checkout', () => {
    const merge = {name: 'Merge', uses: 'actions/checkout@v7'};
    const head = {
      name: 'Head',
      uses: 'actions/checkout@v7',
      with: {ref: '${{ github.event.pull_request.head.sha }}'},
    };
    const before = {name: 'Before', run: 'node .github/scripts/new.mjs'};
    const after = {name: 'After', run: 'node .github/scripts/new.mjs'};
    expect(unguardedScripts({steps: [merge, before, head, after]})).toEqual([
      'After: .github/scripts/new.mjs',
    ]);
    // With no merge checkout, the step reads no tree of the workflow.
    expect(unguardedScripts({steps: [before, head]})).toEqual([
      'Before: .github/scripts/new.mjs',
    ]);
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

  describe('scripts from the scope checkout', () => {
    const script = '.github/scripts/new-check.mjs';
    const scope = (
      dirs = ['.github/actions/test-scope', '.github/scripts'],
    ) => ({
      name: 'Check out the scope action',
      uses: 'actions/checkout@v7',
      with: {'sparse-checkout': dirs.join('\n'), path: '.test-scope'},
    });
    const head = {
      name: 'Checkout',
      uses: 'actions/checkout@v7',
      with: {ref: '${{ github.event.pull_request.head.sha }}'},
    };
    const fromScope = {
      name: 'Run from the scope checkout',
      run: `node .test-scope/${script}`,
    };
    const keep = (dir = 'legs') => ({
      name: 'Keep the check',
      run: `cp .test-scope/${script} "$RUNNER_TEMP/${dir}/.github/scripts/"`,
    });
    const fromCopy = {
      name: 'Run the copy',
      run: `node "$RUNNER_TEMP/legs/${script}"`,
    };

    it('accepts a script read from the scope checkout before the head checkout', () => {
      expect(unguardedScripts({steps: [scope(), fromScope, head]})).toEqual([]);
    });

    it('rejects it after the head checkout replaced the workspace', () => {
      expect(unguardedScripts({steps: [scope(), head, fromScope]})).toEqual([
        `Run from the scope checkout: ${script}`,
      ]);
    });

    it("rejects it when the scope checkout's sparse directories do not hold it", () => {
      expect(
        unguardedScripts({
          steps: [scope(['.github/actions/test-scope']), fromScope, head],
        }),
      ).toEqual([`Run from the scope checkout: ${script}`]);
    });

    it('rejects a scope checkout of another commit', () => {
      const pinned = scope();
      pinned.with.ref = '${{ github.event.pull_request.head.sha }}';
      expect(unguardedScripts({steps: [pinned, fromScope, head]})).toEqual([
        `Run from the scope checkout: ${script}`,
      ]);
    });

    it('accepts a copy an earlier step took from the scope checkout before the head checkout', () => {
      expect(
        unguardedScripts({steps: [scope(), keep(), head, fromCopy]}),
      ).toEqual([]);
    });

    it('rejects a copy taken after the head checkout, never taken, or taken to another directory', () => {
      expect(
        unguardedScripts({steps: [scope(), head, keep(), fromCopy]}),
      ).toEqual([`Keep the check: ${script}`, `Run the copy: ${script}`]);
      expect(unguardedScripts({steps: [scope(), head, fromCopy]})).toEqual([
        `Run the copy: ${script}`,
      ]);
      expect(
        unguardedScripts({steps: [scope(), keep('other'), head, fromCopy]}),
      ).toEqual([`Run the copy: ${script}`]);
    });
  });
});
