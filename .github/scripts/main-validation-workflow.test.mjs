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

  it('keeps one validation of main at a time, and lets only a workflow-token re-check cancel it', () => {
    for (const event of ['push', 'workflow_dispatch'])
      expect(concurrencyFor({event})).toEqual({
        group: 'main-validation',
        cancel: false,
      });
    expect(concurrencyFor({recheck: true})).toEqual({
      group: 'main-validation',
      cancel: true,
    });
    // A person's re-check waits like any other validation.
    expect(concurrencyFor({recheck: true, actor: 'someone'})).toEqual({
      group: 'main-validation',
      cancel: false,
    });
  });

  it('runs a dispatch that names a commit in a group of its own, which cancels and replaces nothing', () => {
    for (const recheck of [false, true]) {
      const {group, cancel} = concurrencyFor({sha: OLDER, recheck});
      expect(group).toBe('main-validation-sha-77');
      expect(cancel).toBe(false);
    }
  });

  async function resolve({
    eventName,
    sha = '',
    status = 'ahead',
    measured = true,
  }) {
    const calls = [];
    const github = {
      rest: {
        repos: {
          getContent: async ({path, ref}) => {
            expect([path, ref]).toEqual([
              '.github/scripts/package-size.mjs',
              sha,
            ]);
            if (!measured)
              throw Object.assign(new Error('Not Found'), {status: 404});
            return {data: {}};
          },
          getBranch: async () => ({data: {commit: {sha: TIP}}}),
          compareCommitsWithBasehead: async ({basehead}) => {
            calls.push(basehead);
            return {data: {status}};
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
      ).toEqual({sha: OLDER, calls: [`${OLDER}...${TIP}`]});
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

  it('refuses a commit from before the package-size measurement, naming why', async () => {
    await expect(
      resolve({eventName: 'workflow_dispatch', sha: OLDER, measured: false}),
    ).rejects.toThrow('predates the package-size measurement');
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

  it.each(['abc123', 'B'.repeat(40), `${OLDER} `.repeat(2)])(
    'refuses a commit that is not a full SHA (%s)',
    async sha => {
      await expect(
        resolve({eventName: 'workflow_dispatch', sha}),
      ).rejects.toThrow('full 40-character commit SHA');
    },
  );
});
