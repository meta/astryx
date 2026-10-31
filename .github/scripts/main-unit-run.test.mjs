// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Main's full unit run is about hourly and always finishes
 * (spec:AST-030 FR21, DEC-15).
 *
 * @input  deploy.yml (the Main workflow), parsed, and its join run in bash
 * @output proofs that a push runs only the fast checks, that a dispatched run
 *   runs every unit leg unscoped on its exact commit in a group no push
 *   cancels, and that the join reports that run's one pass or fail
 * @position Node contract for deploy.yml's unit lanes and join
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const main = yaml.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, '../workflows/deploy.yml'),
    'utf8',
  ),
);

describe("main's full unit run (spec:AST-030 FR21)", () => {
  it('runs the unit lanes only in a dispatched run, never on a push', () => {
    for (const lane of ['test-ui', 'test-node']) {
      expect(main.jobs[lane].if, lane).toBe("github.event_name != 'push'");
      // Every leg, unscoped: no --changed and no file list.
      const run = main.jobs[lane].steps.map(step => step.run ?? '').join('\n');
      expect(run, lane).not.toContain('--changed');
      expect(run, lane).toMatch(/--shard=\$\{\{ matrix\.shard \}\}/);
    }
  });

  it('keeps the fast checks on every push', () => {
    for (const job of ['main-commit', 'sync-exports', 'typecheck'])
      expect(main.jobs[job].if, job).toBeUndefined();
    expect(main.on).toMatchObject({
      push: {branches: ['main']},
      workflow_dispatch: null,
    });
  });

  it('tests the exact commit of its event', () => {
    const script = main.jobs['main-commit'].steps[0].with.script;
    expect(script).toContain("core.setOutput('sha', context.sha)");
    expect(script).not.toContain('getBranch');
  });

  it('gives the unit runs a group no push cancels', () => {
    expect(main.concurrency).toEqual({
      group:
        "${{ github.event_name == 'push' && 'main-validation' || 'main-unit-tests' }}",
      'cancel-in-progress': false,
    });
  });

  describe('the join reports one pass or fail', () => {
    const step = main.jobs.test.steps.find(
      candidate => candidate.name === 'Assert every push gate succeeded',
    );
    const run = env =>
      spawnSync('bash', ['-eo', 'pipefail', '-c', step.run], {
        encoding: 'utf8',
        env: {...process.env, ...env},
      }).status;

    it('needs every lane and always runs', () => {
      expect(main.jobs.test.needs).toEqual([
        'test-ui',
        'test-node',
        'typecheck',
      ]);
      expect(main.jobs.test.if).toBe('${{ always() && !cancelled() }}');
      expect(step.env).toEqual({
        EVENT: '${{ github.event_name }}',
        TEST_UI: '${{ needs.test-ui.result }}',
        TEST_NODE: '${{ needs.test-node.result }}',
        TYPECHECK: '${{ needs.typecheck.result }}',
      });
    });

    it.each([
      [
        'a push with the unit lanes skipped',
        {
          EVENT: 'push',
          TEST_UI: 'skipped',
          TEST_NODE: 'skipped',
          TYPECHECK: 'success',
        },
        0,
      ],
      [
        'a push whose typecheck failed',
        {
          EVENT: 'push',
          TEST_UI: 'skipped',
          TEST_NODE: 'skipped',
          TYPECHECK: 'failure',
        },
        1,
      ],
      [
        'a push that somehow ran a unit lane',
        {
          EVENT: 'push',
          TEST_UI: 'success',
          TEST_NODE: 'skipped',
          TYPECHECK: 'success',
        },
        1,
      ],
      [
        'a unit run where every lane passed',
        {
          EVENT: 'workflow_dispatch',
          TEST_UI: 'success',
          TEST_NODE: 'success',
          TYPECHECK: 'success',
        },
        0,
      ],
      [
        'a unit run with a failed leg',
        {
          EVENT: 'workflow_dispatch',
          TEST_UI: 'success',
          TEST_NODE: 'failure',
          TYPECHECK: 'success',
        },
        1,
      ],
      [
        'a unit run with a skipped lane',
        {
          EVENT: 'workflow_dispatch',
          TEST_UI: 'skipped',
          TEST_NODE: 'success',
          TYPECHECK: 'success',
        },
        1,
      ],
    ])('%s', (_, env, status) => {
      expect(run(env)).toBe(status);
    });
  });
});
