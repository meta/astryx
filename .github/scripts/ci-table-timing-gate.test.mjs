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

  it('is set on the contract shards that run the release proof', () => {
    expect(step).toBeDefined();
  });

  /** The condition's value for one dispatch. */
  const holds = (condition, {event, operation, actor, evidence}) =>
    Function(
      'github',
      'inputs',
      `return Boolean(${condition});`,
    )({event_name: event, triggering_actor: actor}, {operation, evidence});

  it("gates a person's release-check; the bot's runs, cut evidence included, report timing (DEC-17)", () => {
    const condition = conditionFor(step.env.ASTRYX_TABLE_TIMING_GATE, '1');
    const dispatch = {event: 'workflow_dispatch', operation: 'release-check'};
    const bot = 'github-actions[bot]';
    // The release owner's or the release tooling's own release-check.
    expect(
      holds(condition, {...dispatch, actor: 'someone', evidence: false}),
    ).toBe(true);
    // The pre-cut release-check and the release re-check stay on standard
    // runners while DEC-17 holds.
    expect(holds(condition, {...dispatch, actor: bot, evidence: true})).toBe(
      false,
    );
    // The three-hourly monitoring check reports timing only.
    expect(holds(condition, {...dispatch, actor: bot, evidence: false})).toBe(
      false,
    );
    expect(
      holds(condition, {
        event: 'pull_request',
        operation: '',
        actor: 'someone',
        evidence: false,
      }),
    ).toBe(false);
  });

  it('gates on exactly the condition that picks 4-core-ubuntu', () => {
    expect(conditionFor(step.env.ASTRYX_TABLE_TIMING_GATE, '1')).toBe(
      conditionFor(job['runs-on'], '4-core-ubuntu'),
    );
  });
});
