// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Runs for a superseded pull-request head stop, and never pass a required
 * check (.github/actions/superseded-runs, spec:AST-030 FR16).
 *
 * @input  the action's real script, run as actions/github-script runs it
 *   against a stubbed GitHub API, and ci.yml's conditions, evaluated as
 *   Actions would
 * @output proofs that a new head's run cancels an older head's re-run in
 *   flight and nothing else, that an older head's re-run cancels itself, that
 *   a fork's current run passes untouched, and that every required context of
 *   a superseded run reports failure or cancellation, never success or a skip,
 *   so a force-push back to that head cannot inherit a passing check
 * @position Node contract for the superseded-runs action and the jobs that
 *   read it
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => yaml.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const action = read('.github/actions/superseded-runs/action.yml');
const ci = read('.github/workflows/ci.yml');
const script = action.runs.steps[0].with.script;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// The required contexts ci.yml reports (spec:AST-030 FR7).
const REQUIRED = ['test', 'build', 'docsite-test'];
const WORKFLOW = '.github/workflows/ci.yml';
const OLD = 'old-head';
const NEW = 'new-head';
const PR = 7;

function pullRequestContext({head = NEW, fork = false, runId = 1} = {}) {
  return {
    eventName: 'pull_request',
    repo: {owner: 'o', repo: 'r'},
    runId,
    payload: {
      pull_request: {
        number: PR,
        head: {
          sha: head,
          ref: 'fix/a',
          repo: {full_name: fork ? 'author/r' : 'o/r'},
        },
      },
    },
  };
}

/** One listed run; by default an unfinished CI run of this pull request. */
function run(id, fields = {}) {
  return {
    id,
    run_attempt: 2,
    status: 'in_progress',
    path: WORKFLOW,
    head_sha: OLD,
    head_repository: {full_name: 'o/r'},
    pull_requests: [{number: PR}],
    ...fields,
  };
}

/** Runs the action script; returns its output, cancels and messages. */
async function sweep({
  context = pullRequestContext(),
  current = NEW,
  runs = [],
  cancel = true,
  cancelFails = false,
} = {}) {
  const result = {outputs: {}, cancelled: [], listed: 0, warning: []};
  const core = {
    setOutput: (key, value) => (result.outputs[key] = value),
    notice: () => {},
    info: () => {},
    warning: message => result.warning.push(message),
  };
  const github = {
    rest: {
      pulls: {
        get: async ({pull_number}) => {
          expect(pull_number).toBe(PR);
          if (current instanceof Error) throw current;
          return {data: {head: {sha: current}}};
        },
      },
      actions: {
        listWorkflowRuns: async ({workflow_id, event, branch}) => {
          expect([workflow_id, event, branch]).toEqual([
            'ci.yml',
            'pull_request',
            'fix/a',
          ]);
          result.listed++;
          return {data: {workflow_runs: runs}};
        },
        cancelWorkflowRun: async ({run_id}) => {
          if (cancelFails) throw new Error('Resource not accessible');
          result.cancelled.push(run_id);
        },
      },
    },
  };
  const saved = {...process.env};
  process.env.CANCEL = String(cancel);
  process.env.GITHUB_WORKFLOW_REF = `o/r/${WORKFLOW}@refs/pull/${PR}/merge`;
  try {
    await new AsyncFunction('github', 'context', 'core', script)(
      github,
      context,
      core,
    );
  } finally {
    process.env = saved;
  }
  return result;
}

describe('the superseded-runs action', () => {
  it("cancels an older head's re-run in flight from the new head's run, and nothing else", async () => {
    const result = await sweep({
      context: pullRequestContext({head: NEW, runId: 1}),
      runs: [
        run(1, {head_sha: NEW, run_attempt: 1}),
        // The re-run of the older head, still running.
        run(2),
        // Queued for the older head too.
        run(3, {status: 'queued'}),
        // Already finished: nothing to cancel.
        run(4, {status: 'completed'}),
        // Another workflow on the same branch.
        run(5, {path: '.github/workflows/lint.yml'}),
        // Another pull request's run from the same branch.
        run(6, {pull_requests: [{number: PR + 1}]}),
        // A fork's branch of the same name.
        run(7, {head_repository: {full_name: 'author/r'}, pull_requests: []}),
        // The current head's other run (a re-run of the current head).
        run(8, {head_sha: NEW}),
      ],
    });
    expect(result.cancelled).toEqual([2, 3]);
    expect(result.outputs.superseded).toBe('false');
  });

  it('never matches a merge-queue, main or release run, which name no pull request', async () => {
    const result = await sweep({
      runs: [
        run(2, {pull_requests: []}),
        run(3, {pull_requests: [], head_sha: 'main-head'}),
      ],
    });
    expect(result.cancelled).toEqual([]);
  });

  it('cancels a re-run of an older head from that re-run itself, after the others', async () => {
    const result = await sweep({
      context: pullRequestContext({head: OLD, runId: 2}),
      runs: [run(2), run(3, {head_sha: 'older-head'})],
    });
    expect(result.outputs.superseded).toBe('true');
    expect(result.cancelled).toEqual([3, 2]);
  });

  it("leaves a fork's current run untouched: it cancels nothing and passes", async () => {
    const result = await sweep({
      context: pullRequestContext({head: NEW, fork: true}),
      runs: [run(2, {head_repository: {full_name: 'author/r'}})],
    });
    expect(result.outputs.superseded).toBe('false');
    expect(result.listed).toBe(0);
    expect(result.cancelled).toEqual([]);
  });

  it("marks a fork's superseded run, which its read-only token cannot cancel", async () => {
    const result = await sweep({
      context: pullRequestContext({head: OLD, fork: true}),
    });
    expect(result.outputs.superseded).toBe('true');
    expect(result.listed).toBe(0);
  });

  it('only reads the head in room, which cancels nothing', async () => {
    const result = await sweep({cancel: false, runs: [run(2)]});
    expect(result.listed).toBe(0);
    expect(result.cancelled).toEqual([]);
    expect(
      (
        await sweep({
          cancel: false,
          context: pullRequestContext({head: OLD}),
        })
      ).outputs.superseded,
    ).toBe('true');
  });

  it('never fails the current run: a failed lookup or cancel starts it', async () => {
    const lookup = await sweep({current: new Error('rate limited')});
    expect(lookup.outputs.superseded).toBe('false');
    expect(lookup.warning).toHaveLength(1);
    const denied = await sweep({runs: [run(2)], cancelFails: true});
    expect(denied.outputs.superseded).toBe('false');
    expect(denied.warning).toHaveLength(1);
  });

  it('does nothing outside a pull request', async () => {
    const result = await sweep({
      context: {...pullRequestContext(), eventName: 'workflow_dispatch'},
      runs: [run(2)],
    });
    expect(result.outputs.superseded).toBe('false');
    expect(result.cancelled).toEqual([]);
  });
});

/**
 * Evaluates a job or step condition as Actions would. `needs` maps a job id
 * to `{result, outputs}`; a condition with no status-check function also
 * needs every needed job to have succeeded.
 */
function evaluate(
  condition,
  {github, needs, steps = {}, jobNeeds = [], cancelled},
) {
  const expression = String(condition)
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/\.labels\.\*\.name/g, '.labels.map(l => l.name)')
    .replace(/needs\.([a-z][a-z0-9-]*)/g, 'needs["$1"]');
  const hasStatus = /\b(always|cancelled|failure|success)\(\)/.test(expression);
  const succeeded = [jobNeeds]
    .flat()
    .every(id => (needs[id]?.result ?? 'success') === 'success');
  const all = new Proxy(needs, {
    get: (target, key) => target[key] ?? {result: 'success', outputs: {}},
  });
  return Boolean(
    Function(
      'github',
      'needs',
      'steps',
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
      new Proxy(steps, {get: (target, key) => target[key] ?? {outputs: {}}}),
      {},
      () => true,
      () => cancelled,
      () => succeeded && !cancelled,
      () => !succeeded,
      (value, prefix) => String(value ?? '').startsWith(prefix),
      (list, item) => list.includes(item),
      JSON.parse,
    ),
  );
}

const github = ({fork = false} = {}) => ({
  event_name: 'pull_request',
  repository: 'o/r',
  base_ref: 'main',
  head_ref: 'fix/a',
  run_attempt: '2',
  event: {
    action: 'synchronize',
    pull_request: {
      draft: false,
      user: {login: 'author'},
      head: {repo: {full_name: fork ? 'author/r' : 'o/r'}},
      labels: fork ? [{name: 'ci:run'}] : [],
    },
  },
});

/**
 * The conclusion a required context reaches in a superseded run: room failed
 * at its superseded stop, so every job behind it without its own status rule
 * skipped. A job that does not start in a cancelled run is cancelled; one that
 * starts concludes with its first failing step.
 */
function conclusion(id, {fork, cancelled, rerunFailed, headNow = 'old'}) {
  const job = ci.jobs[id];
  // A re-run of the failed jobs keeps room's first-attempt look, which saw
  // the head current; every other superseded run's room stopped it.
  const needs = rerunFailed
    ? {room: {result: 'success', outputs: {superseded: 'false', attempt: '1'}}}
    : {
        room: {result: 'failure', outputs: {superseded: 'true', attempt: '2'}},
        'heavy-ci': {result: 'skipped', outputs: {}},
      };
  for (const need of [job.needs ?? []].flat())
    needs[need] ??= {
      result: rerunFailed ? 'success' : 'skipped',
      outputs: {},
    };
  const steps = {};
  const context = {github: github({fork}), needs, steps, cancelled};
  if (!evaluate(job.if, {...context, jobNeeds: job.needs ?? []}))
    return cancelled ? 'cancelled' : 'skipped';
  for (const step of job.steps) {
    if (step.if != null && !evaluate(step.if, context)) continue;
    // The head check reads the pull request's head as it is now.
    if (step.uses?.endsWith('/.github/actions/superseded-runs'))
      steps[step.id] = {
        outputs: {superseded: headNow === 'old' ? 'true' : 'false'},
      };
    if (/\bexit 1\s*$/.test(step.run ?? '')) return `failure: ${step.name}`;
  }
  return 'success';
}

describe('a superseded run in ci.yml', () => {
  it('room reads the head first and stops before it takes room', () => {
    const {room} = ci.jobs;
    const names = room.steps.map(step => step.name);
    expect(names.indexOf("Check the pull request's head")).toBe(1);
    expect(names.indexOf('Stop for a superseded head')).toBe(2);
    expect(names.indexOf('Stop for a superseded head')).toBeLessThan(
      names.indexOf('Wait for room under the CI ceiling'),
    );
    const check = room.steps[1];
    expect(check.uses).toBe('./.ci-admission/.github/actions/superseded-runs');
    expect(check.with?.cancel).toBeUndefined();
    expect(room.steps[2].if).toBe("steps.head.outputs.superseded == 'true'");
    expect(room.outputs.superseded).toBe(
      '${{ steps.head.outputs.superseded }}',
    );
    expect(room.permissions.actions).toBe('read');
  });

  it('cancels from one pull-request job, the only new holder of actions: write', () => {
    const job = ci.jobs['superseded-runs'];
    // It starts once admission found room, or right after room stopped this
    // run for a superseded head, so the run cancels itself; never while the
    // run waits, nor after room turned it away as CI full.
    expect(job.needs).toEqual(['room', 'admission']);
    const startsAfter = (room, admission) =>
      evaluate(job.if, {
        github: github(),
        needs: {room, admission: {result: admission, outputs: {}}},
        jobNeeds: job.needs,
      });
    expect(startsAfter({result: 'success', outputs: {}}, 'success')).toBe(true);
    expect(
      startsAfter(
        {result: 'failure', outputs: {superseded: 'true'}},
        'skipped',
      ),
    ).toBe(true);
    expect(
      startsAfter({result: 'failure', outputs: {full: 'true'}}, 'skipped'),
    ).toBe(false);
    expect(startsAfter({result: 'success', outputs: {}}, 'failure')).toBe(
      false,
    );
    expect(job.permissions).toEqual({
      actions: 'write',
      contents: 'read',
      'pull-requests': 'read',
    });
    expect(job.steps.at(-1).with).toEqual({cancel: true});
    expect(job['runs-on']).toBe('ubuntu-slim');
    expect(job['timeout-minutes']).toBeLessThanOrEqual(5);
    // Its own failure fails no other job: it is not required, no job needs
    // it, and a skip (a fork's run) blocks nothing.
    expect(job['continue-on-error']).toBe(true);
    for (const [id, other] of Object.entries(ci.jobs))
      expect([other.needs ?? []].flat(), id).not.toContain('superseded-runs');
    expect(REQUIRED).not.toContain('superseded-runs');
    expect(evaluate(job.if, {github: github(), needs: {}})).toBe(true);
    // A fork's token is read-only: its run skips the sweep.
    expect(evaluate(job.if, {github: github({fork: true}), needs: {}})).toBe(
      false,
    );
    expect(
      evaluate(job.if, {
        github: {...github(), event_name: 'workflow_dispatch'},
        needs: {},
      }),
    ).toBe(false);
    const writers = Object.entries(ci.jobs)
      .filter(([, value]) => value.permissions?.actions === 'write')
      .map(([id]) => id);
    expect(writers).toContain('superseded-runs');
    expect(writers).not.toContain('room');
  });

  it.each([
    ['cancelled by the sweep', {fork: false, cancelled: true}],
    ["a fork's, which nothing can cancel", {fork: true, cancelled: false}],
  ])(
    'reports no required context as success or skipped when %s, so a force-push back to its head inherits no pass',
    (_, state) => {
      for (const id of REQUIRED) {
        const verdict = conclusion(id, state);
        expect(verdict, id).not.toBe('success');
        expect(verdict, id).not.toBe('skipped');
        if (!state.cancelled)
          expect(verdict, id).toBe('failure: Stop for a superseded head');
      }
    },
  );

  it("fails every required context when the head moved after room's look: a newer push mid-run, or a re-run of only the failed jobs", () => {
    for (const id of REQUIRED) {
      expect(conclusion(id, {rerunFailed: true}), id).toBe(
        'failure: Stop for a superseded head',
      );
      // The same re-run on the current head passes the check.
      expect(
        conclusion(id, {rerunFailed: true, headNow: 'current'}),
        id,
      ).not.toBe('failure: Stop for a superseded head');
      const check = ci.jobs[id].steps.find(step => step.id === 'head');
      expect(check.uses, id).toBe(
        './.superseded-runs/.github/actions/superseded-runs',
      );
      expect(check.with?.cancel, id).toBeUndefined();
      expect(ci.jobs[id].permissions['pull-requests'], id).toBe('read');
    }
  });

  it('builds nothing behind a superseded room: every job that guards on a full room guards on a superseded one', () => {
    for (const [id, job] of Object.entries(ci.jobs)) {
      const condition = String(job.if ?? '');
      if (condition.includes("needs.room.outputs.full != 'true'"))
        expect(condition, id).toContain(
          "needs.room.outputs.full != 'true' && needs.room.outputs.superseded != 'true'",
        );
    }
    expect(String(ci.jobs['build-storybook'].if)).toContain(
      "needs.room.outputs.superseded != 'true'",
    );
  });
});
