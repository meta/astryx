// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the audits-at-head dispatch runs every audit a pull request
 *   owes at its exact head, and its contract specs on request, as untrusted
 *   code under the CI ceiling, and writes the record merge-guard reads.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const text = fs.readFileSync(
  path.join(root, '.github/workflows/audits-at-head.yml'),
  'utf8',
);
const workflow = yaml.parse(text);
const counter = fs.readFileSync(
  path.join(root, '.github/actions/ci-admission/count.mjs'),
  'utf8',
);
const job = name => workflow.jobs[name];
const step = (jobName, name) => {
  const found = job(jobName).steps.find(candidate => candidate.name === name);
  if (!found) throw new Error(`${jobName} has no step "${name}"`);
  return found;
};

describe('the audits-at-head dispatch', () => {
  it('is titled for its pull request and exact head, which merge-guard filters on', () => {
    expect(workflow['run-name']).toBe(
      'audits-at-head #${{ inputs.pr }} ${{ inputs.head }}',
    );
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    const inputs = workflow.on.workflow_dispatch.inputs;
    expect(inputs.pr.required).toBe(true);
    expect(inputs.head.required).toBe(true);
    expect(inputs['include-contracts']).toMatchObject({
      type: 'boolean',
      default: false,
    });
  });

  it('runs from main for an open pull request at exactly that head', () => {
    const require = step(
      'gate',
      'Require a dispatch from main for one exact head',
    );
    expect(require.run).toContain('"$GITHUB_REF" != refs/heads/main');
    expect(require.run).toContain('^[0-9a-f]{40}$');
    const read = step('gate', 'Read the pull request at this head');
    expect(read.run).toContain(
      '[ "$state" != open ] || [ "$head" != "$HEAD_SHA" ]',
    );
    const list = step('gate', 'List the changed files');
    expect(list.run).toContain('.previous_filename // empty');
    expect(list.run).toContain(
      'diff too large to scope (>3,000 files); split the PR',
    );
  });

  it('treats the head as untrusted code: read-only, no secret, no cache, no credentials', () => {
    expect(workflow.permissions).toEqual({});
    for (const [name, definition] of Object.entries(workflow.jobs)) {
      for (const [scope, level] of Object.entries(
        definition.permissions ?? {},
      )) {
        expect(level, `${name} ${scope}`).toBe('read');
      }
      for (const candidate of definition.steps) {
        expect(candidate.uses ?? '', name).not.toMatch(/actions\/cache/);
        if (String(candidate.uses ?? '').startsWith('actions/checkout')) {
          expect(candidate.with?.['persist-credentials'], name).toBe(false);
        }
      }
    }
    expect(text).not.toMatch(/\$\{\{\s*secrets\./);
    for (const name of ['build-storybook', 'audits', 'contracts']) {
      const checkout = job(name).steps.find(candidate =>
        String(candidate.uses ?? '').startsWith('actions/checkout'),
      );
      expect(checkout.with.ref, name).toBe('${{ inputs.head }}');
    }
  });

  it('waits under the CI ceiling, and the counter counts its live jobs', () => {
    const wait = step('room', 'Wait for room under the CI ceiling');
    expect(wait.uses).toBe('./.ci-admission/.github/actions/ci-admission');
    expect(wait.with.phase).toBe('whole');
    // The most jobs it holds at once: six audit legs and three contract legs.
    const held =
      job('audits').strategy.matrix.leg.length +
      job('contracts').strategy.matrix.leg.length +
      1;
    expect(wait.with.peak).toBeGreaterThanOrEqual(held);
    expect(counter).toContain(
      `'.github/workflows/audits-at-head.yml': () => ${wait.with.peak},`,
    );
    expect(counter).toMatch(
      /const ADMITTED = \[[^\]]*'\.github\/workflows\/audits-at-head\.yml'/,
    );
    for (const name of ['plan', 'build-storybook']) {
      expect(job(name).needs, name).toContain('room');
    }
  });

  it("plans every owed audit with main's planner, in the head merged into main", () => {
    const steps = job('plan').steps.map(candidate => candidate.name);
    // main's planner code is kept before the head's tree is merged in.
    expect(steps.indexOf("Keep main's planner")).toBeLessThan(
      steps.indexOf('Merge the head into main'),
    );
    expect(step('plan', 'Check out main').with.ref).toBeUndefined();
    const merge = step('plan', 'Merge the head into main');
    expect(merge.run).toContain(
      'git fetch --quiet --no-tags origin "refs/pull/$PR/head"',
    );
    expect(merge.run).toContain(
      'test "$(git rev-parse FETCH_HEAD)" = "$HEAD_SHA"',
    );
    expect(merge.run).toContain('merge --quiet --no-ff --no-edit "$HEAD_SHA"');
    const plan = step('plan', 'Plan every owed audit');
    expect(plan.run).toContain(
      'node "$RUNNER_TEMP/planner/.github/scripts/a11y-dependent-audits.mjs"',
    );
    expect(plan.run).toContain('--attempt 2');
    expect(plan.env.ASTRYX_HEAD_SHA).toBe('${{ inputs.head }}');
    expect(job('audits').strategy.matrix.leg).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("selects the contract specs with main's runner, as a labelled pull request does", () => {
    const count = step('contracts', "Count this leg's contract specs");
    // main's runner code, with the merge's routing lines and axe config.
    expect(count.run).toContain(
      'git show "$MAIN_SHA:.github/scripts/a11y-pr-contracts.mjs"',
    );
    expect(count.env.MAIN_SHA).toBe('${{ github.sha }}');
    for (const name of [
      "Count this leg's contract specs",
      "Run this leg's contract specs",
    ]) {
      expect(step('contracts', name).env.WORKFLOW_SHA, name).toBe(
        '${{ steps.merge.outputs.sha }}',
      );
    }
    const merge = step('contracts', 'Build the head merged into main');
    expect(merge.run).toContain(
      'git merge-tree --write-tree "$MAIN_SHA" "$HEAD_SHA"',
    );
    expect(merge.run).toContain(
      'commit-tree "$tree" -p "$MAIN_SHA" -p "$HEAD_SHA"',
    );
    expect(count.run).toContain(
      'GITHUB_EVENT_NAME=pull_request node "$runner" --count-legs',
    );
    expect(count.env.BASE_SHA).toBe('${{ needs.gate.outputs.base }}');
    expect(count.env.PR_TITLE).toBe('${{ needs.gate.outputs.title }}');
    expect(job('contracts').if).toContain('inputs.include-contracts');
  });

  it('writes the record merge-guard reads, and fails unless every leg passed', () => {
    const record = job('record');
    expect(record.needs).toEqual(['gate', 'plan', 'audits', 'contracts']);
    const write = step('record', 'Write the record');
    for (const field of [
      'head: process.env.HEAD_SHA',
      'pr: Number(process.env.PR)',
      'source: "audits-at-head"',
      'complete: audited && plan.complete && plan.head === process.env.HEAD_SHA',
      'record.contracts = {',
    ]) {
      expect(write.run).toContain(field);
    }
    const upload = step('record', 'Upload the record');
    expect(upload.if).toBe('always()');
    expect(upload.with.name).toBe(
      'a11y-dependent-audits-record-${{ github.run_attempt }}',
    );
    expect(upload.with['if-no-files-found']).toBe('error');
    const gate = step('record', 'Require every audit and contract leg to pass');
    expect(gate.run).toContain('[ "$AUDITS" != success ]');
    expect(gate.run).toContain('[ "$CONTRACTS" != success ]');
  });
});
