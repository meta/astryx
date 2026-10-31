// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A push that only merges the base branch carries the last passing run
 * forward (spec:AST-030 FR18). The scope step decides it
 * (test-scope-action.test.mjs); these cases hold the workflows to it: every
 * job that asks the scope step to carry forward does no work once it carries,
 * and every required context still reports and names the run it carries.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const dir = path.resolve(import.meta.dirname, '../workflows');
const load = name => yaml.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const workflows = {'ci.yml': load('ci.yml'), 'lint.yml': load('lint.yml')};

const isScopeStep = step =>
  step.uses?.startsWith('./') &&
  step.uses.endsWith('/.github/actions/test-scope');
const carryingJobs = Object.entries(workflows).flatMap(([file, workflow]) =>
  Object.entries(workflow.jobs)
    .filter(([, job]) =>
      job.steps?.some(
        step => isScopeStep(step) && step.with?.['carry-forward'] === 'true',
      ),
    )
    .map(([id, job]) => ({file, id, job})),
);

/** A value no step set: every property is blank, and it reads as ''. */
function blank() {
  return new Proxy(() => {}, {
    get: (_, key) => (key === Symbol.toPrimitive ? () => '' : blank()),
  });
}
const withDefault = (values, fallback) =>
  new Proxy(values, {
    get: (target, key) => (key in target ? target[key] : fallback(key)),
  });

/**
 * Evaluates a step condition as Actions would on a pull request push from a
 * branch in this repository, with the scope step reporting a carried result
 * and every other step skipped. A step with no condition runs.
 */
function runsWhenCarried(step, scopeId, job) {
  if (step.if == null) return true;
  const outputs = {
    carried: 'true',
    carried_from: 'run 1 at abc',
    applies: 'false',
  };
  const steps = withDefault(
    {
      [scopeId]: {
        outputs: withDefault(outputs, () => 'false'),
        outcome: 'success',
      },
    },
    () => ({outputs: blank(), outcome: 'skipped', conclusion: 'skipped'}),
  );
  const matrix = withDefault(
    Object.fromEntries(
      Object.entries(job.strategy?.matrix ?? {}).map(([key, values]) => [
        key,
        Array.isArray(values) ? values[0] : values,
      ]),
    ),
    () => '',
  );
  const github = {
    event_name: 'pull_request',
    repository: 'meta/astryx',
    base_ref: 'main',
    head_ref: 'fix/button',
    event: {
      action: 'synchronize',
      pull_request: {
        draft: false,
        head: {repo: {full_name: 'meta/astryx'}},
        labels: [],
      },
    },
  };
  const js = String(step.if)
    .replace(/^\$\{\{([\s\S]*)\}\}$/, '$1')
    .replace(/\.labels\.\*\.name/g, '.labels.map(l => l.name)')
    // `steps.merge-base.outputs` and similar hyphenated keys.
    .replace(/\.([A-Za-z_][\w]*(?:-[\w]+)+)/g, "['$1']");
  return Boolean(
    Function(
      'github',
      'steps',
      'matrix',
      'inputs',
      'needs',
      'always',
      'cancelled',
      'success',
      'failure',
      'contains',
      'startsWith',
      'hashFiles',
      `return (${js});`,
    )(
      github,
      steps,
      matrix,
      blank(),
      withDefault({}, () => ({result: 'success', outputs: blank()})),
      () => true,
      () => false,
      () => true,
      () => false,
      (list, item) => list.includes(item),
      (text, prefix) => String(text).startsWith(prefix),
      () => '',
    ),
  );
}

/** The steps a carried job still runs, by name or `uses`. */
function stepsRunWhenCarried({job}) {
  const scope = job.steps.find(
    step => isScopeStep(step) && step.with?.['carry-forward'] === 'true',
  );
  const after = job.steps.slice(job.steps.indexOf(scope) + 1);
  return after
    .filter(step => runsWhenCarried(step, scope.id, job))
    .map(step => step.name ?? step.uses ?? step.run);
}

// Joins keep their checks: a carried join still requires its lanes' results,
// which carried lanes report as success.
const JOIN_STEPS = {
  test: ['actions/checkout@v7', 'Require expected test-owner outcomes'],
};

describe('carrying a passing result forward (spec:AST-030 FR18)', () => {
  it('is asked for by every job that joins a required context', () => {
    expect(carryingJobs.map(({file, id}) => `${file}:${id}`).sort()).toEqual(
      [
        'ci.yml:build-storybook',
        'ci.yml:docsite-test',
        'ci.yml:native-swift-runner',
        'ci.yml:pr-interaction',
        'ci.yml:pr-interaction-webkit',
        'ci.yml:size-base',
        'ci.yml:test',
        'ci.yml:test-build',
        'ci.yml:test-node',
        'ci.yml:test-ui',
        'ci.yml:typecheck',
        'lint.yml:lint',
      ].sort(),
    );
  });

  it.each(carryingJobs.map(entry => [`${entry.file}:${entry.id}`, entry]))(
    "%s reads its pull request's earlier runs",
    (_, {job}) => {
      expect(job.permissions?.actions).toBe('read');
    },
  );

  it.each(carryingJobs.map(entry => [`${entry.file}:${entry.id}`, entry]))(
    '%s does no work once it carries',
    (_, entry) => {
      const ran = stepsRunWhenCarried(entry);
      const echoes = entry.job.steps
        .filter(
          step => /^echo\b/.test(String(step.run ?? '').trim()) && !step.uses,
        )
        .map(step => step.name);
      expect(
        ran.filter(
          name =>
            !echoes.includes(name) &&
            !(JOIN_STEPS[entry.id] ?? []).includes(name),
        ),
      ).toEqual([]);
    },
  );

  it('still runs the work when the scope step does not carry', () => {
    // The evaluator itself: with nothing carried the suites run.
    const testUi = carryingJobs.find(({id}) => id === 'test-ui').job;
    const shard = testUi.steps.find(
      step => step.name === 'Run this shard of the UI tests',
    );
    const notCarried = {
      ...shard,
      if: shard.if.replace(/carried != 'true'/g, "carried != 'false'"),
    };
    expect(runsWhenCarried(shard, 'scope', testUi)).toBe(false);
    expect(runsWhenCarried(notCarried, 'scope', testUi)).toBe(true);
  });

  it('names the carried run on every required context', () => {
    // test, docsite-test and lint run the scope step, which leaves the notice.
    for (const [file, id] of [
      ['ci.yml', 'test'],
      ['ci.yml', 'docsite-test'],
      ['lint.yml', 'lint'],
    ]) {
      expect(
        carryingJobs.some(entry => entry.file === file && entry.id === id),
      ).toBe(true);
    }
    // build joins build-storybook, which hands it the carried run.
    const {jobs} = workflows['ci.yml'];
    expect(jobs['build-storybook'].outputs.carried_from).toBe(
      '${{ steps.scope.outputs.carried_from }}',
    );
    const notice = jobs.build.steps.find(step =>
      String(step.run ?? '').includes(
        '::notice title=Result carried forward::',
      ),
    );
    expect(notice.if).toBe("needs.build-storybook.outputs.carried_from != ''");
    expect(notice.env.CARRIED_FROM).toBe(
      '${{ needs.build-storybook.outputs.carried_from }}',
    );
  });

  it('leaves the label opt-in owners to run as they do', () => {
    const {jobs} = workflows['ci.yml'];
    for (const id of [
      'pr-a11y-guards',
      'pr-a11y-specs',
      'visual-scout',
      'pr-visual',
      'pr-rtl-shard',
      'pr-rtl-merge',
      'pr-rtl',
    ]) {
      const scope = jobs[id].steps.find(isScopeStep);
      expect(scope?.with?.['carry-forward'] ?? 'false').toBe('false');
    }
  });
});
