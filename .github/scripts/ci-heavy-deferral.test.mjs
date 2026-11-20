// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An agent lane's push defers the heavy suites (spec:AST-030 FR20,
 * DEC-14).
 *
 * @input  ci.yml, lint.yml and pr-comment.yml, evaluated as Actions would for
 *   each kind of push
 * @output proofs that a deferred push runs only the fast checks, that every
 *   required context it reaches fails with the reason instead of passing as
 *   skipped, and that every other push, the ready and reopen events and any
 *   later attempt run everything
 * @position Node contract for the `heavy-ci` decision and the jobs it gates
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it, vi} from 'vitest';
import yaml from 'yaml';

import {
  HEAVY_CANDIDATE,
  HEAVY_DEFERRED,
  HEAVY_DEFERRED_MESSAGE,
  HEAVY_RUNS,
  SHARED_AGENT_LOGINS,
  ungated,
} from './ci-pr-gate.mjs';
import {withoutCheckoutRetries} from './lib/checkout-retries.mjs';

const read = name =>
  yaml.parse(
    fs.readFileSync(
      path.resolve(import.meta.dirname, '../workflows', name),
      'utf8',
    ),
  );
const ci = read('ci.yml');
const lint = read('lint.yml');
const prComment = read('pr-comment.yml');

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// The jobs that skip on a deferred push.
const HEAVY = [
  'test-ui',
  'test-node',
  'native-swift-runner',
  'test-native-swift',
  'run-labels',
  'test-build',
  'build-storybook',
  'interaction-legs',
  'pr-interaction',
  'pr-interaction-webkit',
];
// The required contexts ci.yml reports (spec:AST-030 FR7).
const REQUIRED = ['test', 'build', 'docsite-test'];

function pushEvent({
  action = 'synchronize',
  attempt = '1',
  login = 'cixzhang',
  base = 'main',
  head = 'fix/thing',
  labels = [],
} = {}) {
  return {
    event_name: 'pull_request',
    repository: 'meta/astryx',
    run_attempt: attempt,
    base_ref: base,
    head_ref: head,
    event: {
      action,
      pull_request: {
        draft: false,
        user: {login},
        head: {repo: {full_name: 'meta/astryx'}},
        labels: labels.map(name => ({name})),
      },
    },
  };
}

/**
 * Evaluates a job or step condition as Actions would. `needs` maps a job id
 * to `{result, outputs}`; a condition with no status-check function also
 * needs every needed job to have succeeded.
 */
function evaluate(condition, {github, needs = {}, jobNeeds = []}) {
  const expression = String(condition)
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/\.labels\.\*\.name/g, '.labels.map(l => l.name)')
    .replace(/needs\.([a-z][a-z0-9-]*)/g, 'needs["$1"]');
  const hasStatus = /\b(always|cancelled|failure|success)\(\)/.test(expression);
  const needed = [jobNeeds].flat().map(id => needs[id] ?? {result: 'success'});
  const succeeded = needed.every(need => need.result === 'success');
  const all = new Proxy(needs, {
    get: (target, key) => target[key] ?? {result: 'success', outputs: {}},
  });
  return Boolean(
    Function(
      'github',
      'needs',
      'inputs',
      'always',
      'cancelled',
      'success',
      'failure',
      'startsWith',
      'contains',
      'fromJSON',
      `return ${hasStatus ? '' : 'success() && '}(${expression});`,
    )(
      github,
      all,
      {},
      () => true,
      () => false,
      () => succeeded,
      () => !succeeded,
      (value, prefix) => String(value ?? '').startsWith(prefix),
      (list, item) => list.includes(item),
      JSON.parse,
    ),
  );
}

/** The `heavy-ci` result and output a push leaves, by its own condition. */
function heavyCi(github, {specOnly = false} = {}) {
  if (!evaluate(ci.jobs['heavy-ci'].if, {github}))
    return {result: 'skipped', outputs: {}};
  return {
    result: 'success',
    outputs: {deferred: specOnly ? 'false' : 'true'},
  };
}

/** Whether a job starts, with every need but `heavy-ci` as given. */
function starts(id, github, {specOnly, others = 'success'} = {}) {
  const job = ci.jobs[id];
  const needs = Object.fromEntries(
    [job.needs ?? []]
      .flat()
      .map(need => [
        need,
        need === 'heavy-ci'
          ? heavyCi(github, {specOnly})
          : {result: others, outputs: {}},
      ]),
  );
  return evaluate(job.if, {github, needs, jobNeeds: job.needs ?? []});
}

const deferralStep = id =>
  ci.jobs[id].steps.find(step => step.name === 'Heavy CI deferred');

describe('which runs defer the heavy suites (spec:AST-030 FR20, DEC-32)', () => {
  it('is any first attempt of a pull request into main', () => {
    expect(ci.jobs['heavy-ci'].if).toContain(HEAVY_CANDIDATE);
    expect(evaluate(HEAVY_CANDIDATE, {github: pushEvent()})).toBe(true);
  });

  it.each([
    ['a push', {}],
    ['marked ready', {action: 'ready_for_review'}],
    ['opened', {action: 'opened'}],
    ['reopened', {action: 'reopened'}],
    ['from another author', {login: 'someone'}],
    ['from an engineering owner', {login: 'engineer'}],
  ])('defers on %s, for every author', (_, event) => {
    const github = pushEvent(event);
    expect(evaluate(HEAVY_CANDIDATE, {github})).toBe(true);
    expect(heavyCi(github).outputs.deferred).toBe('true');
    for (const id of HEAVY) expect(starts(id, github), id).toBe(false);
  });

  it.each([
    ['re-run in full (review passed, or the pre-merge run)', {attempt: '2'}],
    ['a release merge-back', {head: 'chore/merge-v1.2.3-to-main'}],
  ])('runs everything when the run is %s', (_, event) => {
    const github = pushEvent(event);
    expect(evaluate(HEAVY_CANDIDATE, {github})).toBe(false);
    expect(heavyCi(github).result).toBe('skipped');
    for (const id of HEAVY) expect(starts(id, github), id).toBe(true);
    for (const id of REQUIRED) {
      expect(starts(id, github), id).toBe(true);
      expect(
        evaluate(deferralStep(id).if, {
          github,
          needs: {'heavy-ci': heavyCi(github)},
        }),
        id,
      ).toBe(false);
    }
  });

  it('never defers a release-branch pull request', () => {
    const github = pushEvent({base: 'release/v1.2.3'});
    expect(heavyCi(github).result).toBe('skipped');
  });

  it('runs every suite in the same run when the review gate already passes at the head, never a deferred attempt and then a second run (DEC-32)', async () => {
    vi.useFakeTimers();
    const job = ci.jobs['heavy-ci'];
    expect(job.permissions.statuses).toBe('read');
    const gate = job.steps.find(item => item.id === 'gate');
    expect(gate.env.HEAD_SHA).toBe('${{ github.event.pull_request.head.sha }}');
    expect(job.steps.find(item => item.id === 'decide').env.REVIEW_PASSES).toBe(
      '${{ steps.gate.outputs.passes }}',
    );
    process.env.HEAVY_MODULE = '/heavy-turn.mjs';
    process.env.HEAD_SHA = 'h1';
    process.env.ENG_OWNERS = '@owner1';
    process.env.REVIEW_APP = 'astracat-bot[bot]';
    /**
     * Runs the step with the gate's states, one per look, and whether a
     * review of the head cleared it; returns its answer and looks.
     */
    const passes = async (states, reviewed = true) => {
      const outputs = {};
      let looks = 0;
      const done = new AsyncFunction(
        'github',
        'context',
        'core',
        'importModule',
        gate.with.script.replaceAll('await import(', 'await importModule('),
      )(
        {},
        {
          repo: {owner: 'o', repo: 'r'},
          payload: {pull_request: {number: 7, head: {sha: 'h1'}}},
        },
        {warning: () => {}, setOutput: (key, value) => (outputs[key] = value)},
        async specifier =>
          specifier === 'node:url'
            ? import('node:url')
            : {
                reviewStatus: async ({sha}) => {
                  expect(sha).toBe('h1');
                  const state = states[Math.min(looks, states.length - 1)];
                  looks += 1;
                  return state == null ? null : {state};
                },
                ownerHandles: text => [String(text)],
                reviewPasses: async ({pull, engOwners, reviewApp}) => {
                  expect(pull).toEqual({number: 7, head: {sha: 'h1'}});
                  expect(engOwners).toEqual(['@owner1']);
                  expect(reviewApp).toBe('astracat-bot[bot]');
                  return reviewed;
                },
              },
      );
      await vi.advanceTimersByTimeAsync(4 * 60_000);
      await done;
      return [outputs.passes, looks];
    };
    // Review signal writes the gate a moment after the push; a review of the
    // head cleared it (a re-run, or a head reviewed before its run).
    expect(await passes([null, 'pending', 'success'])).toEqual(['true', 3]);
    // The gate passed at the author's own push, with no review: defer.
    expect(await passes(['success'], false)).toEqual(['false', 1]);
    // A failing gate defers at once; a gate still pending after three
    // minutes defers.
    expect(await passes(['failure'])).toEqual(['false', 1]);
    expect(await passes(['pending'])).toEqual(['false', 12]);
    vi.useRealTimers();
  });

  it('reads a release-critical label only when someone with write access applied it last (DEC-30)', async () => {
    const job = ci.jobs['heavy-ci'];
    const read = job.steps.find(item => item.id === 'release');
    const labelled = pushEvent({
      login: 'someone',
      labels: ['release-critical'],
    });
    // The job still runs for a labelled pull request; its decision reads the label.
    expect(evaluate(HEAVY_CANDIDATE, {github: labelled})).toBe(true);
    expect(evaluate(read.if, {github: labelled})).toBe(true);
    expect(evaluate(read.if, {github: pushEvent()})).toBe(false);
    expect(
      job.steps.find(item => item.uses?.startsWith('actions/checkout')).with[
        'sparse-checkout'
      ],
    ).toContain('.github/scripts/lib');
    // The step asks run-labels.cjs, as admission and the caps do.
    process.env.RUN_LABELS_MODULE = '/run-labels.cjs';
    const counts = async decide => {
      const outputs = {};
      await new AsyncFunction(
        'github',
        'context',
        'core',
        'importModule',
        read.with.script.replaceAll('await import(', 'await importModule('),
      )(
        {},
        {},
        {
          warning: () => {},
          notice: () => {},
          setOutput: (key, value) => (outputs[key] = value),
        },
        async specifier =>
          specifier === 'node:url'
            ? import('node:url')
            : {
                decideRunLabel: async ({suite, label}) => {
                  expect([suite, label]).toEqual([
                    'release-critical',
                    'release-critical',
                  ]);
                  return decide();
                },
              },
      );
      return outputs.counts;
    };
    expect(await counts(() => true)).toBe('true');
    // Applied last by someone without write access, or unreadable: it does
    // not count, so the push defers.
    expect(await counts(() => false)).toBe('false');
    expect(
      await counts(() => {
        throw new Error('lookup failed');
      }),
    ).toBe('false');
    expect(
      job.steps.find(item => item.id === 'decide').env.RELEASE_CRITICAL,
    ).toBe('${{ steps.release.outputs.counts }}');
  });

  it('names no author in the deferral, and keeps the shared agent logins in one list with the heavy-suite caps', () => {
    expect(HEAVY_CANDIDATE).not.toContain('user.login');
    const caps = fs.readFileSync(
      path.resolve(import.meta.dirname, '../actions/heavy-caps/action.yml'),
      'utf8',
    );
    const listed = /const shared = (\[[^\]]*\])\.includes\(login\)/.exec(
      caps,
    )[1];
    expect(JSON.parse(listed.replaceAll("'", '"'))).toEqual(
      SHARED_AGENT_LOGINS,
    );
  });

  it('runs everything for a spec-only change', () => {
    const github = pushEvent();
    for (const id of HEAVY)
      expect(starts(id, github, {specOnly: true}), id).toBe(true);
  });
});

describe('a deferred push', () => {
  const github = pushEvent();

  it('skips every heavy job', () => {
    for (const id of HEAVY) {
      expect(starts(id, github), id).toBe(false);
      // The deferral sits right after the gate, and ungated() sees past it.
      expect(String(ci.jobs[id].if), id).toContain(`&& (${HEAVY_RUNS} && (`);
      expect(ungated(ci.jobs[id].if), id).not.toContain('heavy-ci');
    }
  });

  it('defers a fork push admitted with ci:run; its review-pass run at that head runs every suite after the label is removed, and a later push runs nothing (FR20, FR29)', () => {
    const fromFork = ({labels, attempt}) => {
      const event = pushEvent({login: 'someone', labels, attempt});
      event.event.pull_request.head.repo.full_name = 'someone/astryx';
      return event;
    };
    const admitted = fromFork({labels: ['ci:run'], attempt: '1'});
    expect(heavyCi(admitted).outputs.deferred).toBe('true');
    expect(starts('typecheck', admitted)).toBe(true);
    for (const id of HEAVY) expect(starts(id, admitted), id).toBe(false);
    // A later attempt keeps the event it re-runs, `ci:run` included, though
    // the contributor job has since removed the label from the pull request.
    const reviewPass = fromFork({labels: ['ci:run'], attempt: '2'});
    expect(heavyCi(reviewPass).result).toBe('skipped');
    for (const id of HEAVY) expect(starts(id, reviewPass), id).toBe(true);
    // A later push carries no label: nothing runs until it is vetted again.
    const later = fromFork({labels: [], attempt: '1'});
    expect(starts('typecheck', later)).toBe(false);
    for (const id of HEAVY) expect(starts(id, later), id).toBe(false);
  });

  it('runs every suite at the pre-merge re-run, a later attempt', () => {
    const preMerge = pushEvent({attempt: '2'});
    expect(heavyCi(preMerge).result).toBe('skipped');
    for (const id of HEAVY) expect(starts(id, preMerge), id).toBe(true);
  });

  it('still runs the fast checks: typecheck and lint', () => {
    expect(starts('typecheck', github)).toBe(true);
    expect(JSON.stringify(ci.jobs.typecheck)).not.toContain('heavy-ci');
    expect(JSON.stringify(lint)).not.toContain('heavy-ci');
  });

  it('fails every required context with the reason, never passing as skipped', () => {
    for (const id of REQUIRED) {
      // The job starts even though the jobs it joins skipped...
      expect(starts(id, github, {others: 'skipped'}), id).toBe(true);
      // ...and its deferral step, which exits 1, runs right after the fork
      // gate and the stops for a full CI and a superseded head, with the
      // head check that stop reads (and, in
      // `test`, the PR report's record), so the context fails before any
      // join could pass.
      const steps = withoutCheckoutRetries(ci.jobs[id].steps);
      const step = deferralStep(id);
      const before = steps.slice(0, steps.indexOf(step)).map(item => item.name);
      expect(before.slice(0, 5), id).toEqual([
        'Require a branch in this repository or the ci:run label',
        'Stop when CI is full',
        'Check out the superseded-runs action',
        "Check the pull request's head",
        'Stop for a superseded head',
      ]);
      expect(before.slice(5), id).toEqual(
        id === 'test'
          ? [
              'Record the deferral for the PR report',
              'Upload the deferral for the PR report',
            ]
          : [],
      );
      expect(step.if).toBe(HEAVY_DEFERRED);
      expect(
        evaluate(step.if, {github, needs: {'heavy-ci': heavyCi(github)}}),
        id,
      ).toBe(true);
      expect(step.run, id).toContain(`::error::${HEAVY_DEFERRED_MESSAGE}`);
      expect(step.run, id).toMatch(/\bexit 1\s*$/);
    }
  });

  it('decides with one cheap job that reads the trusted scope', () => {
    const job = ci.jobs['heavy-ci'];
    expect(job['runs-on']).toBe('ubuntu-slim');
    expect(job.outputs.deferred).toBe('${{ steps.decide.outputs.deferred }}');
    expect(
      job.steps.some(step => step.uses?.endsWith('/actions/test-scope')),
    ).toBe(true);
    for (const id of [...HEAVY, ...REQUIRED])
      expect([ci.jobs[id].needs].flat(), id).toContain('heavy-ci');
  });

  // A Lab-only change runs only fast work, so it defers nothing either
  // (spec:AST-030 FR26).
  it.each([
    ['true', 'false', '', '', 'false', ''],
    ['false', 'true', '', '', 'false', ''],
    ['false', 'false', 'true', '', 'false', ''],
    ['false', 'false', 'false', 'true', 'false', ''],
    ['false', 'false', 'false', 'false', 'true', HEAVY_DEFERRED_MESSAGE],
    ['false', 'false', '', '', 'true', HEAVY_DEFERRED_MESSAGE],
    ['', '', '', '', 'true', HEAVY_DEFERRED_MESSAGE],
  ])(
    'defers unless the change is spec-only or Lab-only, release-critical counts, or the review gate already passes (spec_only=%s, lab_only=%s, release_critical=%s, review_passes=%s → deferred=%s)',
    (specOnly, labOnly, releaseCritical, reviewPasses, deferred, summary) => {
      const step = ci.jobs['heavy-ci'].steps.find(item => item.id === 'decide');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-ci-'));
      try {
        const output = path.join(dir, 'output');
        const stepSummary = path.join(dir, 'summary');
        const result = spawnSync(
          'bash',
          ['-e', '-c', step.run.replaceAll(/\$\{\{[^}]*\}\}/g, 'abc')],
          {
            cwd: dir,
            encoding: 'utf8',
            env: {
              ...process.env,
              SPEC_ONLY: specOnly,
              LAB_ONLY: labOnly,
              RELEASE_CRITICAL: releaseCritical,
              REVIEW_PASSES: reviewPasses,
              GITHUB_OUTPUT: output,
              GITHUB_STEP_SUMMARY: stepSummary,
              GITHUB_RUN_ID: '7',
              GITHUB_RUN_ATTEMPT: '1',
            },
          },
        );
        expect(result.status, result.stderr).toBe(0);
        expect(fs.readFileSync(output, 'utf8')).toBe(`deferred=${deferred}\n`);
        expect(
          fs.existsSync(stepSummary)
            ? fs.readFileSync(stepSummary, 'utf8')
            : '',
        ).toBe(summary ? `${summary}.\n` : '');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
  );
});

describe("heavy-ci's skip on every other run", () => {
  // Actions' implicit success() needs every ancestor, not only the direct
  // needs, to have succeeded; heavy-ci skips on every run but an agent push,
  // so any job below it without its own status check would skip too.
  const needsOf = id => [ci.jobs[id].needs ?? []].flat();
  const ancestors = (id, seen = new Set()) => {
    for (const need of needsOf(id))
      if (!seen.has(need)) {
        seen.add(need);
        ancestors(need, seen);
      }
    return seen;
  };
  const below = Object.keys(ci.jobs).filter(id =>
    ancestors(id).has('heavy-ci'),
  );

  it('gives every job below it a status check', () => {
    expect(below.length).toBeGreaterThan(HEAVY.length);
    for (const id of below)
      expect(String(ci.jobs[id].if), id).toMatch(
        /\b(always|cancelled|success|failure)\(\)/,
      );
  });

  /** Every job's start as Actions decides it, ancestors included. */
  function plan(github, inputs = {}, {full = false} = {}) {
    const results = {};
    const order = [];
    const visit = id => {
      if (order.includes(id)) return;
      for (const need of needsOf(id)) visit(need);
      order.push(id);
    };
    Object.keys(ci.jobs).forEach(visit);
    for (const id of order) {
      const job = ci.jobs[id];
      const needs = Object.fromEntries(
        needsOf(id).map(need => [need, results[need]]),
      );
      const all = [...ancestors(id)].map(need => results[need]);
      const condition = String(job.if ?? 'true')
        .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
        .replace(/\.labels\.\*\.name/g, '.labels.map(l => l.name)')
        .replace(/needs\.([a-z][a-z0-9-]*)/g, 'needs["$1"]');
      const hasStatus = /\b(always|cancelled|failure|success)\(\)/.test(
        condition,
      );
      const ok = all.every(item => item.result === 'success');
      const runs =
        (hasStatus || ok) &&
        Boolean(
          Function(
            'github',
            'needs',
            'inputs',
            'always',
            'cancelled',
            'success',
            'failure',
            'startsWith',
            'contains',
            'fromJSON',
            `return (${condition});`,
          )(
            github,
            needs,
            inputs,
            () => true,
            () => false,
            () => ok,
            () => !ok,
            (value, prefix) => String(value ?? '').startsWith(prefix),
            (list, item) => list.includes(item),
            JSON.parse,
          ),
        );
      results[id] = {
        // When CI is full, admission fails at its first step.
        result: !runs
          ? 'skipped'
          : id === 'admission' && full
            ? 'failure'
            : 'success',
        outputs:
          id === 'run-labels'
            ? {a11y: 'true', rtl: 'true', visual: 'true'}
            : id === 'room'
              ? {full: String(full)}
              : // A push that is not spec-only or Lab-only defers.
                id === 'heavy-ci' && runs
                ? {deferred: 'true'}
                : {},
      };
    }
    return results;
  }

  it("runs a release-check's every browser owner", () => {
    const results = plan(
      {event_name: 'workflow_dispatch', repository: 'meta/astryx', event: {}},
      {operation: 'release-check', 'release-branch': 'main'},
    );
    expect(results['heavy-ci'].result).toBe('skipped');
    for (const id of [
      'build-storybook',
      'pr-a11y-shard',
      'a11y-contracts-shard',
      'pr-a11y-guards',
      'pr-a11y-specs',
      'pr-rtl-shard',
      'pr-a11y-audit',
      'release-check',
    ])
      expect(results[id].result, id).toBe('success');
  });

  it('starts no heavy job when CI is full (spec:AST-030 FR16)', () => {
    // A fork's run with ci:run cannot cancel itself, so only the jobs' own
    // conditions stop it.
    const github = pushEvent({login: 'someone'});
    github.event.pull_request.head.repo.full_name = 'someone/astryx';
    github.event.pull_request.labels = [{name: 'ci:run'}];
    const results = plan(github, {}, {full: true});
    expect(results.admission.result).toBe('failure');
    expect(results['heavy-ci'].result).toBe('skipped');
    // test-native-swift always runs to report its runner, as on main.
    for (const id of HEAVY.filter(item => item !== 'test-native-swift'))
      expect(results[id].result, id).toBe('skipped');
  });

  it('runs the suites an opt-in label asks for once review passes, not on the first attempt', () => {
    const labelled = attempt => {
      const github = pushEvent({login: 'someone', attempt});
      github.event.pull_request.labels = [
        {name: 'ci:run-a11y'},
        {name: 'ci:run-rtl'},
      ];
      return plan(github);
    };
    const first = labelled('1');
    expect(first['heavy-ci'].result).toBe('success');
    for (const id of ['pr-a11y-specs', 'pr-rtl-shard'])
      expect(first[id].result, id).toBe('skipped');
    // The review-pass re-run (a later attempt) runs them.
    const again = labelled('2');
    expect(again['heavy-ci'].result).toBe('skipped');
    for (const id of ['pr-a11y-guards', 'pr-a11y-specs', 'pr-rtl-shard'])
      expect(again[id].result, id).toBe('success');
  });
});

describe('the PR report on a deferred push', () => {
  const comment = prComment.jobs.comment;

  it("reads the run attempt's deferral, only for a failed run", () => {
    const download = comment.steps.find(
      step => step.id === 'deferral-download',
    );
    expect(download.uses).toBe('actions/download-artifact@v8');
    expect(download.with.name).toBe(
      'heavy-ci-deferred-${{ steps.identity.outputs.run_attempt }}',
    );
    expect(download.with['run-id']).toBe(
      '${{ steps.identity.outputs.run_id }}',
    );
    expect(download.if).toContain(
      "steps.identity.outputs.source_conclusion == 'failure'",
    );
    expect(download['continue-on-error']).toBe(true);
    // `test` records it: a failed-jobs re-run repeats `test` (it failed) and
    // keeps heavy-ci's output, so that attempt has its own record; a full
    // re-run is a later attempt, which never defers.
    const steps = ci.jobs.test.steps;
    const record = steps.find(
      step => step.name === 'Record the deferral for the PR report',
    );
    const upload = steps.find(step =>
      step.uses?.startsWith('actions/upload-artifact'),
    );
    expect(record.if).toBe(HEAVY_DEFERRED);
    expect(upload.if).toBe(HEAVY_DEFERRED);
    expect(upload.with.name).toBe(
      'heavy-ci-deferred-${{ github.run_attempt }}',
    );
    expect(
      ci.jobs['heavy-ci'].steps.some(step =>
        step.uses?.startsWith('actions/upload-artifact'),
      ),
    ).toBe(false);
  });

  it('writes the record the report reads', () => {
    const record = ci.jobs.test.steps.find(
      step => step.name === 'Record the deferral for the PR report',
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-ci-'));
    try {
      const result = spawnSync(
        'bash',
        ['-e', '-c', record.run.replaceAll(/\$\{\{[^}]*\}\}/g, 'abc')],
        {
          cwd: dir,
          encoding: 'utf8',
          env: {...process.env, GITHUB_RUN_ID: '7', GITHUB_RUN_ATTEMPT: '2'},
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(
        JSON.parse(
          fs.readFileSync(path.join(dir, 'heavy-ci-deferred.json'), 'utf8'),
        ),
      ).toEqual({headSha: 'abc', runId: '7', runAttempt: '2'});
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('says the heavy CI was deferred', () => {
    const publish = comment.steps.find(step => step.id === 'publish');
    expect(publish.with.script).toContain(HEAVY_DEFERRED_MESSAGE);
    expect(publish.with.script).toContain(
      'heavy-ci-deferred/heavy-ci-deferred.json',
    );
  });
});
