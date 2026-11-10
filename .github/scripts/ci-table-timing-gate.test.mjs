// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the Table release timing gate follows the release runner.
 * @input .github/workflows/ci.yml
 * @output The contract shards' runner condition against the timing gate's
 * @position Node contract for the release check's Table timing proof
 *
 * The Table release proof gates its timing budgets only on 4-core-ubuntu.
 * The job picks that runner and sets ASTRYX_TABLE_TIMING_GATE from one
 * condition each, so the two conditions must stay identical.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const workflow = yaml.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, '../workflows/ci.yml'),
    'utf8',
  ),
);

/** The condition `X` in an expression `${{ (X) && 'value' || 'other' }}`. */
function conditionFor(expression, value) {
  const match = String(expression).match(
    new RegExp(`^\\$\\{\\{\\s*\\((.+)\\)\\s*&&\\s*'${value}'\\s*\\|\\|`),
  );
  if (match == null) {
    throw new Error(`No condition for '${value}' in ${expression}`);
  }
  return match[1].trim();
}

describe('Table release timing gate', () => {
  const job = workflow.jobs['a11y-contracts-shard'];
  const step = job.steps.find(
    candidate => candidate.env?.ASTRYX_TABLE_TIMING_GATE !== undefined,
  );
  const condition = conditionFor(job['runs-on'], '4-core-ubuntu');
  const gates = ({actor = 'github-actions[bot]', timingGate = false} = {}) =>
    Boolean(
      Function(
        'github',
        'inputs',
        `return (${condition});`,
      )(
        {
          event_name: 'workflow_dispatch',
          triggering_actor: actor,
        },
        {
          operation: 'release-check',
          'timing-gate': timingGate,
        },
      ),
    );

  it('is set on the contract shards that run the release proof', () => {
    expect(step).toBeDefined();
  });

  it('gates on exactly the condition that picks 4-core-ubuntu', () => {
    expect(conditionFor(step.env.ASTRYX_TABLE_TIMING_GATE, '1')).toBe(
      condition,
    );
  });

  it('gates a person or release-tooling dispatch', () => {
    expect(gates({actor: 'maintainer'})).toBe(true);
  });

  it('gates a bot re-check or pre-cut evidence dispatch', () => {
    expect(gates({timingGate: true})).toBe(true);
  });

  it('keeps a bot monitoring dispatch report-only', () => {
    expect(gates()).toBe(false);
  });
});
