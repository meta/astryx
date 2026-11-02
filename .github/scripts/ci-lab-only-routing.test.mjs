// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-lab-only-routing.test.mjs
 * @description Pins the Lab-only lane (spec:AST-030 FR26): a pull request that
 *   changes only the Lab package runs the Lab package's tests, the Storybook
 *   build and the repository-wide guards, and every required context reports
 *   success with a Lab-only notice instead of skipping.
 * @input CI and lint workflow YAML, and the trusted scope classifier.
 * @output Mutation-sensitive assertions over each job's Lab-only steps.
 * @position Workflow contract beside ci-tooling-routing.test.mjs.
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const ci = yaml.parse(read('.github/workflows/ci.yml'));
const lint = read('.github/workflows/lint.yml');
const {classifyChanges} = createRequire(import.meta.url)('./change-scope.cjs');

const LAB_TRUE = "steps.scope.outputs.lab_only == 'true'";
const LAB_FALSE = "steps.scope.outputs.lab_only != 'true'";
const NOTICE = 'Lab-only: Lab tests + Storybook build';

const steps = name => ci.jobs[name].steps;
const step = (name, stepName) => steps(name).find(s => s.name === stepName);
const isScopeStep = s => s.id === 'scope' || s.with?.path === '.test-scope';
/** A step that does a job's work, after its gates and its scope step. */
const workAfterScope = name => {
  const all = steps(name);
  const scope = all.findIndex(s => s.id === 'scope');
  expect(scope, name).toBeGreaterThanOrEqual(0);
  return all
    .slice(scope + 1)
    .filter(s => s.name !== NOTICE && (s.run || s.uses));
};

describe('Lab-only lane (spec:AST-030 FR26)', () => {
  it('takes the fast path only for a change confined to the Lab package', () => {
    const files = names => names.map(filename => ({filename}));
    expect(
      classifyChanges(
        files(['packages/lab/src/Tour/Tour.tsx', '.changeset/x.md']),
      ).labOnly,
    ).toBe(true);
    expect(
      classifyChanges(
        files(['packages/lab/src/Tour/Tour.tsx', 'packages/core/src/index.ts']),
      ).labOnly,
    ).toBe(false);
  });

  it('reports success with a Lab-only notice on every required context', () => {
    // docsite-test and test read their own scope; build reads it from the
    // Storybook build, which runs on a Lab-only change.
    for (const name of ['docsite-test', 'test']) {
      const notice = step(name, NOTICE);
      expect(notice?.if, name).toBe(LAB_TRUE);
      expect(notice.run, name).toContain(
        '::notice title=Lab-only::Lab-only: Lab tests + Storybook build',
      );
      expect(notice.run, name).not.toMatch(/exit [1-9]/);
    }
    expect(step('build', NOTICE).if).toBe(
      "needs.build-storybook.outputs.lab_only == 'true'",
    );
    expect(ci.jobs['build-storybook'].outputs.lab_only).toBe(
      '${{ steps.scope.outputs.lab_only }}',
    );
    // No required context is skipped for it: none names the lane at job level.
    for (const name of ['build', 'test', 'docsite-test']) {
      expect(String(ci.jobs[name].if), name).not.toContain('lab_only');
    }
  });

  it('keeps every owner the required joins wait on green while skipping its work', () => {
    for (const name of [
      'docsite-test',
      'test-node',
      'test-build',
      'typecheck',
    ]) {
      expect(step(name, NOTICE)?.if, name).toBe(LAB_TRUE);
      expect(String(ci.jobs[name].if), name).not.toContain('lab_only');
      for (const work of workAfterScope(name)) {
        if (work.name === 'Validate spec records') continue;
        if (work.name === 'Skip docsite work for Node tooling') continue;
        if (/^Skip /.test(work.name ?? '')) continue;
        // A step gated on an earlier work step's outcome follows that step.
        if (
          /steps\.(?!scope\.)[\w-]+\.(?:outcome|outputs)/.test(String(work.if))
        )
          continue;
        expect(
          work.if,
          `${name}: ${work.name ?? work.uses ?? work.run}`,
        ).toContain(LAB_FALSE);
      }
    }
    // The test join requires a decided Lab-only scope like the others.
    const join = step('test', 'Require expected test-owner outcomes');
    expect(join.env.LAB_ONLY).toBe('${{ steps.scope.outputs.lab_only }}');
    expect(read('.github/scripts/ci-test-join.mjs')).toContain(
      "['lab_only', process.env.LAB_ONLY]",
    );
  });

  it('runs every Lab test, and only those, on the UI legs, with the repository guards', () => {
    const suite = step('test-ui', 'Run this shard of the UI tests');
    expect(suite.env.LAB_ONLY).toBe('${{ steps.scope.outputs.lab_only }}');
    expect(suite.if).not.toContain('lab_only');
    const labBranch = suite.run.split('elif')[0];
    expect(labBranch).toContain('if [ "$LAB_ONLY" = true ]; then');
    expect(labBranch).toContain(
      'pnpm test:ui --passWithNoTests --shard=${{ matrix.shard }}/${{ strategy.job-total }} packages/lab/\n',
    );
    expect(labBranch).not.toContain('--changed');
    // Checkout, setup and the repository-wide guards still run: a guard break
    // that landed would turn every later pull request red.
    for (const name of [
      'Check knowledge schema history',
      'Check copyright headers',
      'Check package.json exports are in sync',
      'Verify the published CLI ./api type surface',
      'Check token docs are in sync',
      'Check lab readiness manifest is current',
    ]) {
      expect(step('test-ui', name).if, name).not.toContain('lab_only');
    }
    for (const s of steps('test-ui').filter(
      s =>
        s.uses === 'actions/checkout@v7' ||
        s.uses === './.github/actions/setup',
    )) {
      if (isScopeStep(s)) continue;
      expect(String(s.if)).not.toContain('lab_only');
    }
    // The core Markdown benchmark is not a Lab test.
    expect(step('test-ui', 'Run the isolated Markdown benchmark').if).toContain(
      LAB_FALSE,
    );
  });

  it('builds Storybook as on any pull request, then typechecks Lab and its stories', () => {
    // A Lab type error that landed would fail every later pull request's
    // typecheck, so the Lab package and the stories are checked against the
    // packages this job built.
    const typecheck = step(
      'build-storybook',
      'Lab-only: typecheck Lab and its stories',
    );
    // Spelled out beside the lane, as every build command in this job is.
    expect(typecheck.if).toBe(
      `steps.scope.outputs.spec_only != 'true' && ${LAB_TRUE}`,
    );
    expect(typecheck.run).toBe(
      'pnpm -F @astryxdesign/lab -F @astryxdesign/storybook typecheck',
    );
    const all = steps('build-storybook');
    expect(all.indexOf(typecheck)).toBeGreaterThan(
      all.findIndex(s => s.name === 'Build packages and Storybook'),
    );
    for (const s of all.filter(s => s !== typecheck)) {
      expect(String(s.if ?? ''), s.name ?? s.uses ?? s.run).not.toContain(
        'lab_only',
      );
    }
  });

  it('runs no heavy suite, and defers nothing for an agent push', () => {
    // Interaction proofs and native Swift read `applies`, which a Lab-only
    // change turns false in the scope action itself.
    expect(read('.github/actions/test-scope/action.yml')).toContain(
      "['spec_only', 'docsite_only', 'tooling_only', 'lab_only'].some(key => classified[key] === 'true')",
    );
    expect(String(ci.jobs['pr-touched-components'].if)).toContain(
      "needs.build-storybook.outputs.lab_only != 'true'",
    );
    for (const name of ['visual-scout', 'pr-visual']) {
      const specialized = steps(name).find(s => s.env?.SPECIALIZED)?.env
        .SPECIALIZED;
      expect(specialized, name).toContain(LAB_TRUE);
    }
    const decide = step(
      'heavy-ci',
      'Defer the heavy suites unless the change is spec-only or Lab-only',
    );
    expect(decide.env.LAB_ONLY).toBe('${{ steps.scope.outputs.lab_only }}');
    expect(decide.run).toContain(
      'if [ "$SPEC_ONLY" = true ] || [ "$LAB_ONLY" = true ]; then',
    );
  });

  it('keeps full lint for a Lab-only change', () => {
    expect(lint).not.toContain('lab_only');
  });
});
