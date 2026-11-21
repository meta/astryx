// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Main's full unit run: its leg plan and its dispatch inputs.
 * @input The Main workflow (deploy.yml) and a mocked GitHub API
 * @output The shard plan every leg of a main validation runs, the commit a
 *   dispatch validates, and which dispatch may take the validation group
 * @position Node contracts for spec:AST-030 FR22. The
 *   Vitest routing over the same lanes is pinned in ci-test-routing.test.mjs.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const workflow = yaml.parse(
  fs.readFileSync(new URL('../workflows/deploy.yml', import.meta.url), 'utf8'),
);
const TIP = 'a'.repeat(40);
const OLDER = 'b'.repeat(40);

describe('main validation legs', () => {
  /** Every leg starts when the run does, inside the job budget. */
  const expectUnheld = job => {
    expect(job.strategy['max-parallel']).toBeUndefined();
    expect(job.strategy['fail-fast']).toBe(false);
    expect(job['timeout-minutes']).toBe(15);
    expect(job['runs-on']).toBe('ubuntu-latest');
  };

  it("test-node draws the theme editor's pages as a pull request does", () => {
    const job = workflow.jobs['test-node'];
    const run = job.steps.find(step =>
      /pnpm test:node --shard=/.test(step.run ?? ''),
    );
    // The legs are planned from times measured without real drawing
    // everywhere, so they run that way too.
    expect(run.env ?? {}).not.toHaveProperty('THEME_EDIT_REAL_RENDERS');
    expect(job.env ?? {}).not.toHaveProperty('THEME_EDIT_REAL_RENDERS');
    expect(workflow.env ?? {}).not.toHaveProperty('THEME_EDIT_REAL_RENDERS');
  });

  it('test-ui runs 6 legs at once, each inside the job budget', () => {
    const job = workflow.jobs['test-ui'];
    expect(job.strategy.matrix.shard).toEqual([1, 2, 3, 4, 5, 6]);
    expectUnheld(job);
  });

  it('test-node runs the legs main-commit plans from the recorded times, at most twelve, each inside the job budget', () => {
    const job = workflow.jobs['test-node'];
    expect(job.strategy.matrix.shard).toBe(
      "${{ fromJSON(needs.main-commit.outputs.node-shards || '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]') }}",
    );
    expectUnheld(job);
    const commit = workflow.jobs['main-commit'];
    expect(commit.outputs['node-shards']).toBe(
      '${{ steps.node-legs.outputs.shards }}',
    );
    const plan = commit.steps.find(step => step.id === 'node-legs');
    // Main's Node legs run the swizzle proof's slices too: `--main`.
    expect(plan).toMatchObject({
      if: "github.event_name != 'push'",
      'continue-on-error': true,
      'working-directory': '.ci-admission',
      run: 'node scripts/vitest-node-legs.mjs plan --main --github-output',
    });
    // The sparse checkout holds the planner and what it reads.
    const checkout = commit.steps.find(
      step => step.with?.path === '.ci-admission',
    );
    expect(checkout.with['sparse-checkout'].split('\n')).toEqual(
      expect.arrayContaining(['scripts/lib', '.github/scripts/lib']),
    );
    // Planned before the run waits for room, so the legs it starts are the
    // legs it planned.
    const names = commit.steps.map(step => step.name);
    expect(names.indexOf(plan.name)).toBeLessThan(
      names.indexOf('Wait for room under the CI ceiling'),
    );
  });
});

describe('main validation checkouts', () => {
  /** Every checkout step in a job, with the steps right after it. */
  const checkoutsOf = job =>
    job.steps
      .map((step, index) => ({step, index}))
      .filter(({step}) => step.uses?.startsWith('actions/checkout@'));

  it('bounds every checkout at five minutes, tries it once more, and stops with a named reason when both fail', () => {
    const jobs = Object.entries(workflow.jobs).filter(([, job]) =>
      job.steps?.some(step => step.uses?.startsWith('actions/checkout@')),
    );
    // Every job that checks out code: none is left unbounded.
    expect(jobs.map(([id]) => id).sort()).toEqual([
      'main-commit',
      'sync-exports',
      'test-node',
      'test-ui',
      'typecheck',
    ]);
    for (const [id, job] of jobs) {
      const checkouts = checkoutsOf(job);
      // One first try and one second try, each bounded.
      expect(
        checkouts.map(({step}) => step.id),
        id,
      ).toEqual(['checkout', 'checkout-again']);
      const [first, again] = checkouts;
      for (const {step} of checkouts) {
        expect(step['timeout-minutes'], id).toBe(5);
        expect(step['continue-on-error'], id).toBe(true);
      }
      // The second try checks out the same thing, only after the first failed.
      expect(again.step.with, id).toEqual(first.step.with);
      expect(again.index, id).toBe(first.index + 1);
      expect(String(again.step.if), id).toContain(
        "steps.checkout.outcome != 'success'",
      );
      // When both fail, the job stops at once with the reason.
      const stop = job.steps[again.index + 1];
      expect(stop.name, id).toBe('Stop when the checkout failed twice');
      expect(String(stop.if), id).toContain(
        "steps.checkout.outcome != 'success' && steps.checkout-again.outcome != 'success'",
      );
      expect(stop.run, id).toContain('checkout failed twice');
      expect(stop.run.trim().split('\n').at(-1), id).toBe('exit 1');
      // A condition the original step had applies to all three.
      if (first.step.if)
        for (const each of [again.step, stop])
          expect(String(each.if), id).toContain(
            String(first.step.if).replace(/^\$\{\{\s*|\s*\}\}$/g, ''),
          );
    }
  });
});

describe('main validation dispatch', () => {
  const inputs = workflow.on.workflow_dispatch.inputs;

  it('takes an optional exact commit and a re-check flag', () => {
    expect(inputs.sha).toMatchObject({type: 'string', required: false});
    expect(inputs.recheck).toMatchObject({type: 'boolean', default: false});
    expect(Object.keys(inputs).sort()).toEqual(['recheck', 'sha']);
  });

  /** The concurrency group and cancel rule GitHub would compute for an event. */
  function concurrencyFor({
    event = 'workflow_dispatch',
    sha = '',
    recheck = false,
    actor = 'github-actions[bot]',
  }) {
    const evaluate = expression =>
      Function(
        'github',
        'inputs',
        'format',
        `return (${expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '')});`,
      )(
        {event_name: event, triggering_actor: actor, run_id: 77},
        event === 'workflow_dispatch' ? {sha, recheck} : {},
        (text, ...args) => text.replace(/\{(\d+)\}/g, (_, i) => args[i]),
      );
    return {
      group: evaluate(workflow.concurrency.group),
      cancel: Boolean(evaluate(workflow.concurrency['cancel-in-progress'])),
    };
  }

  it('keeps one full unit run of main at a time, apart from the fast checks of pushes, and lets only a workflow-token re-check cancel it', () => {
    // A push's fast checks queue among themselves (spec:AST-030 FR21).
    expect(concurrencyFor({event: 'push'})).toEqual({
      group: 'main-validation',
      cancel: false,
    });
    // The scheduler's unit run, which names main's tip, and a person's run of
    // the tip queue in the unit-run group, which no push cancels.
    for (const options of [{sha: OLDER}, {}, {actor: 'someone'}])
      expect(concurrencyFor(options)).toEqual({
        group: 'main-unit-tests',
        cancel: false,
      });
    // A release re-check names main's tip and takes the unit-run group.
    for (const options of [{recheck: true}, {recheck: true, sha: OLDER}])
      expect(concurrencyFor(options)).toEqual({
        group: 'main-unit-tests',
        cancel: true,
      });
    // A person's re-check waits like any other validation.
    expect(concurrencyFor({recheck: true, actor: 'someone'})).toEqual({
      group: 'main-unit-tests',
      cancel: false,
    });
  });

  it("runs a person's dispatch that names a commit in a group of its own, which cancels and replaces nothing", () => {
    for (const recheck of [false, true]) {
      const {group, cancel} = concurrencyFor({
        sha: OLDER,
        recheck,
        actor: 'someone',
      });
      expect(group).toBe('main-validation-sha-77');
      expect(cancel).toBe(false);
    }
  });

  // The commit of #9164, from which main keeps the size records the typecheck
  // lane writes.
  const FLOOR = /const FLOOR = '([0-9a-f]{40})';/.exec(
    workflow.jobs['main-commit'].steps[0].with.script,
  )?.[1];

  async function resolve({
    eventName,
    sha = '',
    status = 'ahead',
    recorded = 'ahead',
  }) {
    const calls = [];
    const github = {
      rest: {
        repos: {
          getBranch: async () => ({data: {commit: {sha: TIP}}}),
          compareCommitsWithBasehead: async ({basehead}) => {
            calls.push(basehead);
            // `<floor>...<sha>` asks whether the commit has the size records.
            return {
              data: {
                status: basehead.startsWith(`${FLOOR}...`) ? recorded : status,
              },
            };
          },
        },
      },
    };
    const outputs = {};
    const core = {setOutput: (name, value) => (outputs[name] = value)};
    const context = {
      eventName,
      sha: OLDER,
      repo: {owner: 'meta', repo: 'astryx'},
      payload: {inputs: {sha}},
    };
    const script = workflow.jobs['main-commit'].steps[0].with.script;
    await new AsyncFunction('github', 'context', 'core', script)(
      github,
      context,
      core,
    );
    return {sha: outputs.sha, calls};
  }

  it('validates the pushed commit on a push', async () => {
    expect(await resolve({eventName: 'push'})).toEqual({sha: OLDER, calls: []});
  });

  it("validates main's tip on a dispatch without a commit", async () => {
    expect(await resolve({eventName: 'workflow_dispatch'})).toEqual({
      sha: TIP,
      calls: [],
    });
  });

  it.each(['identical', 'ahead'])(
    "validates a requested commit in main's history (%s)",
    async status => {
      expect(
        await resolve({eventName: 'workflow_dispatch', sha: OLDER, status}),
      ).toEqual({
        sha: OLDER,
        calls: [`${OLDER}...${TIP}`, `${FLOOR}...${OLDER}`],
      });
    },
  );

  it.each(['behind', 'diverged'])(
    "refuses a commit outside main's history (%s)",
    async status => {
      await expect(
        resolve({eventName: 'workflow_dispatch', sha: OLDER, status}),
      ).rejects.toThrow("is not in main's history");
    },
  );

  it('refuses a commit from before the size records, naming why', async () => {
    expect(FLOOR).toMatch(/^[0-9a-f]{40}$/);
    // A commit between the package-size script (#9161) and the size records
    // (#9164) is behind the floor, and is refused.
    for (const recorded of ['behind', 'diverged']) {
      await expect(
        resolve({eventName: 'workflow_dispatch', sha: OLDER, recorded}),
      ).rejects.toThrow('predates the size records');
    }
    expect(
      (
        await resolve({
          eventName: 'workflow_dispatch',
          sha: FLOOR,
          recorded: 'identical',
        })
      ).sha,
    ).toBe(FLOOR);
  });

  it('names a run that validates an older commit after that commit', () => {
    const name = workflow['run-name'];
    const evaluate = (event, sha) =>
      Function(
        'github',
        'inputs',
        'format',
        `return (${name.replace(/^\$\{\{\s*|\s*\}\}$/g, '')});`,
      )({event_name: event}, {sha}, (text, value) =>
        text.replace('{0}', value),
      );
    expect(evaluate('workflow_dispatch', OLDER)).toBe(
      `Main validation of ${OLDER}`,
    );
    // An empty name keeps GitHub's default for every other run.
    expect(evaluate('workflow_dispatch', '')).toBe('');
    expect(evaluate('push', undefined)).toBe('');
  });

  it('checks every lane, sync-exports included, out at the resolved commit', () => {
    for (const lane of ['sync-exports', 'test-ui', 'test-node', 'typecheck']) {
      const job = workflow.jobs[lane];
      expect([job.needs].flat(), lane).toContain('main-commit');
      expect(
        job.steps.find(step => step.uses?.startsWith('actions/checkout@')).with
          .ref,
        lane,
      ).toBe('${{ needs.main-commit.outputs.sha }}');
    }
  });

  // Only spaces would otherwise read as no commit, yet run in a group of its own.
  it.each([
    'abc123',
    'B'.repeat(40),
    `${OLDER} `.repeat(2),
    '   ',
    ` ${OLDER}`,
  ])('refuses a commit that is not a full SHA (%s)', async sha => {
    await expect(
      resolve({eventName: 'workflow_dispatch', sha}),
    ).rejects.toThrow('full 40-character commit SHA');
  });
});

describe("main validation's Node watchdog", () => {
  it('names the files still running before the job limit without ending the leg, so an overrun stays incomplete and is run again', () => {
    const job = workflow.jobs['test-node'];
    const step = job.steps.find(each =>
      /pnpm test:node --shard=/.test(each.run ?? ''),
    );
    expect(step.run).toContain('VITEST_SHARD_WATCHDOG_SECONDS=$(( 14 * 60 - ');
    expect(step.run).toContain('export VITEST_SHARD_WATCHDOG_SECONDS');
    expect(step.run).toContain(
      '--reporter=default --reporter=github-actions --reporter=./scripts/vitest-shard-watchdog.mjs',
    );
    // Name-only: the reporter warns and the job limit cancels the leg.
    expect(step.env.VITEST_SHARD_WATCHDOG_NAME_ONLY).toBe('1');
    // The script holds only shell: an environment entry that slipped into it
    // would run as a command after the tests and fail every leg.
    const script = step.run.replace(/\$\{\{[^}]*\}\}/g, 'X');
    expect(
      script.split('\n').filter(line => /^\s*[A-Z_]+:\s/.test(line)),
    ).toEqual([]);
    const bash = spawnSync('bash', ['-n'], {input: script, encoding: 'utf8'});
    expect(bash.status, bash.stderr).toBe(0);
    expect(script.trim().split('\n').at(-1)).toMatch(
      /^pnpm test:node --shard=/,
    );
    expect(job['timeout-minutes']).toBe(15);
    // A cancelled unit run is incomplete to the scheduler, which dispatches
    // the next one and reports it (spec:AST-030 FR21).
    const heavy = fs.readFileSync(
      new URL('../workflows/main-heavy-lanes.yml', import.meta.url),
      'utf8',
    );
    const incomplete = /const INCOMPLETE = \[([^\]]+)\]/.exec(heavy)?.[1] ?? '';
    expect(incomplete).toContain("'cancelled'");
  });
});
