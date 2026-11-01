// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A release-check's wide legs and the release owner's re-check.
 * @input The CI and Release re-check workflows, and a mocked GitHub API
 * @output The legs each event runs, the job budget, the lane a re-check
 *   takes, and what the re-check trigger starts or refuses
 * @position Node contracts for spec:AST-030 FR23 and DEC-18
 */

import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {matrixFor} from './ci-matrix.mjs';

const read = name =>
  yaml.parse(
    fs.readFileSync(new URL(`../workflows/${name}`, import.meta.url), 'utf8'),
  );
const ci = read('ci.yml');
const recheck = read('release-recheck.yml');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const TIP = 'a'.repeat(40);
const range = count => Array.from({length: count}, (_, index) => index + 1);
const coreParts = event =>
  matrixFor(ci.jobs['pr-rtl-shard'].strategy.matrix.include, event).filter(
    leg => leg.package === 'core',
  );

describe('release-check legs', () => {
  it.each([
    ['pr-a11y-shard', 6],
    ['a11y-contracts-shard', 6],
    ['visual-scout', 8],
  ])('%s runs %i legs on a release-check', (job, legs) => {
    const shards = ci.jobs[job].strategy.matrix.shard;
    expect(matrixFor(shards, 'workflow_dispatch')).toEqual(range(legs));
  });

  it('keeps a pull request’s visual scout at five legs', () => {
    expect(
      matrixFor(ci.jobs['visual-scout'].strategy.matrix.shard, 'pull_request'),
    ).toEqual(range(5));
  });

  it('splits Core RTL six ways on a release-check and three on a pull request, and the join expects the same', () => {
    for (const [event, parts] of [
      ['workflow_dispatch', 6],
      ['pull_request', 3],
    ]) {
      expect(coreParts(event).map(leg => [leg.part, leg.parts])).toEqual(
        range(parts).map(part => [part, parts]),
      );
      const others = matrixFor(
        ci.jobs['pr-rtl-shard'].strategy.matrix.include,
        event,
      ).filter(leg => leg.package !== 'core');
      expect(others).toEqual(
        ['lab', 'charts', 'richtext', 'vega'].map(pkg => ({
          package: pkg,
          part: 1,
          parts: 1,
        })),
      );
    }
    const join = ci.jobs['pr-rtl-merge'].steps.find(
      step => step.name === 'Join Core RTL parts',
    );
    expect(join.env.CORE_PARTS).toBe(
      `\${{ github.event_name == 'workflow_dispatch' && ${coreParts('workflow_dispatch').length} || ${coreParts('pull_request').length} }}`,
    );
    expect(join.run).toContain('-ne "$CORE_PARTS"');
  });

  it.each([
    'pr-a11y-shard',
    'a11y-contracts-shard',
    'visual-scout',
    'pr-rtl-shard',
  ])(
    '%s starts every leg at once and keeps each inside the job budget',
    job => {
      expect(ci.jobs[job].strategy['max-parallel']).toBeUndefined();
      expect(ci.jobs[job].strategy['fail-fast']).toBe(false);
      expect(ci.jobs[job]['timeout-minutes']).toBe(15);
    },
  );

  it("runs each contract leg's own test list", () => {
    const run = ci.jobs['a11y-contracts-shard'].steps.find(
      step => step.name === 'Run accessibility spec-test contracts',
    ).run;
    expect(run).toContain(
      'node .github/scripts/a11y-contract-shard.mjs --shard "${{ matrix.shard }}/${{ strategy.job-total }}" > contract-tests.txt',
    );
    expect(run).toContain(
      'pnpm exec playwright test --test-list contract-tests.txt --config playwright.config.ts --project chromium',
    );
  });

  it("keeps a release-check's widest wave at 32 legs, the room main's lane plans for", () => {
    const legs = job =>
      job === 'pr-rtl-shard'
        ? matrixFor(ci.jobs[job].strategy.matrix.include, 'workflow_dispatch')
            .length
        : matrixFor(ci.jobs[job].strategy.matrix.shard, 'workflow_dispatch')
            .length;
    const wave =
      ['pr-a11y-shard', 'a11y-contracts-shard', 'visual-scout', 'pr-rtl-shard']
        .map(legs)
        .reduce((sum, count) => sum + count, 0) +
      ['pr-a11y-guards', 'pr-a11y-specs'].length;
    expect(wave).toBe(32);
  });
});

describe('the main check lane', () => {
  it('takes a re-check input that only the workflow token can use to cancel', () => {
    expect(ci.on.workflow_dispatch.inputs.recheck).toMatchObject({
      type: 'boolean',
      default: false,
    });
    expect(ci.concurrency['cancel-in-progress']).toBe(
      "${{ github.event_name != 'workflow_dispatch' || (inputs.recheck && github.triggering_actor == 'github-actions[bot]') }}",
    );
    // Workflow-token dispatches, the re-check included, share main's lane.
    expect(ci.concurrency.group).toContain(
      "(github.event_name == 'workflow_dispatch' && github.triggering_actor == 'github-actions[bot]' && 'main-heavy-lanes')",
    );
  });
});

describe('release re-check trigger', () => {
  it('is a maintainer dispatch with an exact commit and a failed-only switch', () => {
    expect(Object.keys(recheck.on)).toEqual(['workflow_dispatch']);
    expect(recheck.on.workflow_dispatch.inputs.sha).toMatchObject({
      type: 'string',
      required: true,
    });
    expect(recheck.on.workflow_dispatch.inputs['failed-only']).toMatchObject({
      type: 'boolean',
      default: false,
    });
    expect(recheck.permissions).toEqual({});
    expect(recheck.jobs.recheck.permissions).toEqual({
      actions: 'write',
      contents: 'read',
    });
    expect(recheck.jobs.recheck['timeout-minutes']).toBe(5);
  });

  async function trigger({
    sha = TIP,
    failedOnly = false,
    role = 'maintain',
    ref = 'refs/heads/main',
    tip = TIP,
    runs = {},
  } = {}) {
    const calls = {dispatches: [], reruns: [], notices: []};
    lastCalls = calls;
    const github = {
      rest: {
        repos: {
          getCollaboratorPermissionLevel: async () => ({
            data: {role_name: role},
          }),
          getBranch: async () => ({data: {commit: {sha: tip}}}),
        },
        actions: {
          createWorkflowDispatch: async params => {
            calls.dispatches.push(params);
          },
          listWorkflowRuns: async ({workflow_id, head_sha, event, branch}) => {
            expect([event, branch, head_sha]).toEqual([
              'workflow_dispatch',
              'main',
              sha,
            ]);
            return {data: {workflow_runs: runs[workflow_id] ?? []}};
          },
          listJobsForWorkflowRun: async ({run_id}) => ({
            data: {
              jobs: Object.values(runs)
                .flat()
                .find(item => item.id === run_id).jobs,
            },
          }),
          reRunWorkflowFailedJobs: async ({run_id}) => {
            calls.reruns.push(run_id);
          },
        },
      },
    };
    const summary = {
      addHeading: () => summary,
      addRaw: () => summary,
      write: async () => {},
    };
    const core = {
      info: () => {},
      notice: message => calls.notices.push(message),
      summary,
    };
    const context = {ref, actor: 'owner', repo: {owner: 'o', repo: 'r'}};
    const saved = {...process.env};
    Object.assign(process.env, {
      SHA: sha,
      FAILED_ONLY: String(failedOnly),
      GITHUB_TRIGGERING_ACTOR: 'owner',
    });
    try {
      const script = recheck.jobs.recheck.steps[0].with.script;
      await new AsyncFunction('github', 'context', 'core', script)(
        github,
        context,
        core,
      );
    } finally {
      for (const key of ['SHA', 'FAILED_ONLY', 'GITHUB_TRIGGERING_ACTOR'])
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
    }
    return calls;
  }

  it("starts the release-check and the full unit run on main's tip, each taking its lane", async () => {
    const {dispatches} = await trigger();
    expect(dispatches).toEqual([
      {
        owner: 'o',
        repo: 'r',
        workflow_id: 'ci.yml',
        ref: 'main',
        inputs: {
          operation: 'release-check',
          'release-branch': 'main',
          'expected-head': TIP,
          recheck: 'true',
        },
      },
      {
        owner: 'o',
        repo: 'r',
        workflow_id: 'deploy.yml',
        ref: 'main',
        // Naming the tip, so the run is that commit's unit-run receipt
        // (spec:AST-030 FR21).
        inputs: {sha: TIP, recheck: 'true'},
      },
    ]);
  });

  it.each(['admin', 'maintain'])('lets the %s role re-check', async role => {
    expect((await trigger({role})).dispatches).toHaveLength(2);
  });

  it.each(['write', 'triage', 'read'])('refuses the %s role', async role => {
    await expect(trigger({role})).rejects.toThrow('Only a maintainer');
  });

  it("refuses another branch, a short SHA, and a commit that is not main's tip", async () => {
    await expect(trigger({ref: 'refs/heads/topic'})).rejects.toThrow(
      'from main',
    );
    await expect(trigger({sha: 'abc1234'})).rejects.toThrow(
      'full 40-character',
    );
    await expect(trigger({tip: 'b'.repeat(40)})).rejects.toThrow(
      "re-check main's tip",
    );
  });

  // The calls of the latest trigger, readable after one that throws.
  let lastCalls;
  /** A workflow-token dispatch of this commit; a re-check when its marker step ran. */
  const run = (
    id,
    conclusion,
    {status = 'completed', login = 'github-actions[bot]', recheck = true} = {},
  ) => ({
    id,
    status,
    conclusion,
    html_url: `run/${id}`,
    actor: {login},
    jobs: [
      {
        steps: [
          {
            name: 'Mark a release re-check',
            conclusion: recheck ? 'success' : 'skipped',
          },
        ],
      },
    ],
  });

  it("re-runs only the failed jobs of this commit's latest re-check runs", async () => {
    const calls = await trigger({
      failedOnly: true,
      runs: {
        'ci.yml': [
          // A person's release-check of the same commit is not a re-check,
          run(9, 'failure', {login: 'someone'}),
          // and neither is the hourly check the workflow token dispatched.
          run(10, 'failure', {recheck: false}),
          run(7, 'failure'),
        ],
        'deploy.yml': [run(11, 'failure', {recheck: false}), run(8, 'success')],
      },
    });
    expect(calls.reruns).toEqual([7]);
    expect(calls.dispatches).toEqual([]);
  });

  it("refuses to re-run an older commit's re-check, which would cancel the tip's checks", async () => {
    await expect(
      trigger({
        failedOnly: true,
        tip: 'b'.repeat(40),
        runs: {
          'ci.yml': [run(7, 'failure')],
          'deploy.yml': [run(8, 'failure')],
        },
      }),
    ).rejects.toThrow("re-check main's tip");
    expect(lastCalls.reruns).toEqual([]);
  });

  it('finds both re-check runs before it re-runs either', async () => {
    // The Main re-check is missing: nothing is re-run, ci.yml's failure included.
    await expect(
      trigger({failedOnly: true, runs: {'ci.yml': [run(7, 'failure')]}}),
    ).rejects.toThrow('No re-check');
    expect(lastCalls.reruns).toEqual([]);
    const pending = trigger({
      failedOnly: true,
      runs: {
        'ci.yml': [run(7, 'failure')],
        'deploy.yml': [run(8, null, {status: 'in_progress'})],
      },
    });
    await expect(pending).rejects.toThrow('still in_progress');
    expect(lastCalls.reruns).toEqual([]);
  });

  it('marks a re-check run with a step, not a run name', () => {
    const mark = (job, condition) => {
      const step = job.steps.find(
        item => item.name === 'Mark a release re-check',
      );
      expect(step.if).toBe(condition);
    };
    mark(ci.jobs['release-authority'], 'inputs.recheck');
    const main = read('deploy.yml');
    mark(
      main.jobs['main-commit'],
      "github.event_name == 'workflow_dispatch' && inputs.recheck",
    );
    expect(ci['run-name']).toBeUndefined();
    // Main names only a run that validates an older commit (FR22); a
    // re-check names none, so it keeps the default name.
    expect(main['run-name']).not.toContain('recheck');
  });
});
