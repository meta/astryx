// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Main's full unit run: its leg plan and its dispatch inputs.
 * @input The Main workflow (deploy.yml) and a mocked GitHub API
 * @output The shard plan every leg of a main validation runs, the commit a
 *   dispatch validates, and which dispatch may take the validation group
 * @position Node contracts for spec:AST-030 FR22. The
 *   Vitest routing over the same lanes is pinned in ci-test-routing.test.mjs.
 */

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
  it.each([
    ['test-ui', 6],
    ['test-node', 6],
  ])('%s runs %i legs at once, each inside the job budget', (lane, legs) => {
    const job = workflow.jobs[lane];
    expect(job.strategy.matrix.shard).toEqual(
      Array.from({length: legs}, (_, index) => index + 1),
    );
    // No hold: every leg starts when the run does.
    expect(job.strategy['max-parallel']).toBeUndefined();
    expect(job.strategy['fail-fast']).toBe(false);
    expect(job['timeout-minutes']).toBe(15);
    expect(job['runs-on']).toBe('ubuntu-latest');
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
