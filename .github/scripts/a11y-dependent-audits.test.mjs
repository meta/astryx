// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: a change to a shared primitive runs the audits of the
 *   components that use it (spec:AST-030 FR12, DEC-25).
 *
 * An `audit` spec runs only in its own component-audit pull request and in the
 * release check. A change to shared Button's disabled state once passed every
 * pull-request check and then failed the release check in ChatSendButton's
 * audit. The dependent-audits legs close that gap for the primitives the list
 * names, within at most three legs of about ten minutes each.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {
  changedPrimitives,
  dependentAudits,
  listAuditSpecs,
  MAX_LEGS,
  planDependentAudits,
  PRIMITIVES_FILE,
  readPrimitives,
} from './a11y-dependent-audits.mjs';
import {
  fileSeconds,
  importerGraph,
  LEG_BUDGET_MS,
} from './a11y-pr-contracts.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const seconds = fileSeconds(
  JSON.parse(
    fs.readFileSync(
      path.join(root, '.github/a11y-contract-durations.json'),
      'utf8',
    ),
  ),
);
const specs = listAuditSpecs(root);
const importers = importerGraph(root);
const plan = changed =>
  planDependentAudits({
    changed,
    primitives: readPrimitives(root),
    specs,
    importers,
    seconds,
  });

describe('the shared primitives', () => {
  it('start with Button and IconButton, in one versioned file', () => {
    expect(PRIMITIVES_FILE).toBe('.github/a11y-shared-primitives.json');
    expect(readPrimitives(root)).toEqual(['core/Button', 'core/IconButton']);
  });

  it("count only a primitive's own source, never a test, story, doc or note", () => {
    const primitives = ['core/Button', 'core/IconButton'];
    expect(
      changedPrimitives(primitives, ['packages/core/src/Button/Button.tsx']),
    ).toEqual(['core/Button']);
    expect(
      changedPrimitives(primitives, [
        'packages/core/src/Button/__tests__/Button.a11y.chromium.spec.ts',
        'packages/core/src/Button/Button.test.tsx',
        'packages/core/src/Button/Button.stories.tsx',
        'packages/core/src/Button/Button.doc.mjs',
        'packages/core/src/Button/README.md',
        'packages/core/src/ButtonGroup/ButtonGroup.tsx',
      ]),
    ).toEqual([]);
  });
});

describe("a Button change runs its dependents' audits", () => {
  it("includes ChatSendButton's audit, which the release check caught", () => {
    const {primitives, files} = plan(['packages/core/src/Button/Button.tsx']);
    expect(primitives).toEqual(['core/Button']);
    expect(files).toContain(
      'packages/core/src/Chat/__tests__/ChatSendButton.a11y.chromium.spec.ts',
    );
    // Only audits: the contract job already runs the other modes.
    const modeOf = new Map(specs.map(({file, mode}) => [file, mode]));
    for (const file of files) expect(modeOf.get(file), file).toBe('audit');
  });

  it("plans an IconButton change's own audit and its users' audits", () => {
    const {primitives, files} = plan([
      'packages/core/src/IconButton/IconButton.tsx',
    ]);
    expect(primitives).toEqual(['core/IconButton']);
    expect(files).toEqual(
      expect.arrayContaining([
        'packages/core/src/DateInput/__tests__/DateInputAudit.a11y.chromium.spec.ts',
        'packages/core/src/IconButton/__tests__/IconButtonAudit.a11y.chromium.spec.ts',
      ]),
    );
  });

  it('fits at most three legs of ten minutes at the recorded times', () => {
    const {count, shares, longestMs, files} = plan([
      'packages/core/src/Button/Button.tsx',
    ]);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(MAX_LEGS);
    expect(longestMs).toBeLessThanOrEqual(LEG_BUDGET_MS);
    expect(shares.flat().sort()).toEqual([...files].sort());
  });

  it('plans nothing for a change that touches no primitive', () => {
    for (const changed of [
      ['packages/core/src/Chat/ChatSendButton.tsx'],
      ['packages/core/src/Button/Button.test.tsx'],
      [],
    ]) {
      expect(plan(changed)).toMatchObject({count: 0, files: [], shares: []});
    }
  });

  it("selects only audit specs of the primitive's and its users' folders", () => {
    const sample = [
      {
        file: 'packages/core/src/Chat/__tests__/A.a11y.chromium.spec.ts',
        mode: 'audit',
      },
      {
        file: 'packages/core/src/Chat/__tests__/B.a11y.chromium.spec.ts',
        mode: 'scoped',
      },
      {
        file: 'packages/core/src/Tabs/__tests__/C.a11y.chromium.spec.ts',
        mode: 'audit',
      },
    ];
    expect(dependentAudits(sample, new Set(['core/Chat']))).toEqual([
      'packages/core/src/Chat/__tests__/A.a11y.chromium.spec.ts',
    ]);
  });
});

describe('the dependent-audits jobs', () => {
  const planJob = ci.jobs['a11y-dependent-audits-plan'];
  const legs = ci.jobs['pr-a11y-dependent-audits'];
  const step = (job, name) => job.steps.find(s => s.name === name);

  it('plan once on a slim runner, from the changed files at the merge commit', () => {
    expect(planJob['runs-on']).toBe('ubuntu-slim');
    expect(planJob.needs).toContain('build-storybook');
    const run = step(planJob, 'Plan the dependent audits');
    expect(run.run).toBe(
      'node .github/scripts/a11y-dependent-audits.mjs --changed "$CHANGED_FILES" --out "$RUNNER_TEMP/dependent-audits.json"',
    );
    expect(step(planJob, 'Require the changed-file list').run).toContain(
      'exit 1',
    );
  });

  it('run up to three legs, on a full runner only when a leg has a share', () => {
    expect(legs.strategy.matrix.leg).toEqual([1, 2, 3]);
    expect(legs.strategy['fail-fast']).toBe(false);
    expect(legs['runs-on']).toBe(
      "${{ needs.a11y-dependent-audits-plan.outputs.count >= matrix.leg && 'ubuntu-latest' || 'ubuntu-slim' }}",
    );
    expect(step(legs, 'Require the dependent-audit plan').if).toBe(
      "needs.a11y-dependent-audits-plan.result != 'success'",
    );
    const run = step(legs, "Run this leg's dependent audits");
    expect(run.run).toContain(
      'pnpm exec playwright test "${FILES[@]}" --config playwright.config.ts --project chromium',
    );
    // The head must carry the contract lane's environment.
    expect(
      step(legs, "Require this lane's environment in the branch").run,
    ).toContain('check --lane a11y-contracts');
    // Specs run at the head that built the Storybook.
    expect(
      step(legs, 'Check out the head that built the Storybook').with.ref,
    ).toBe('${{ github.event.pull_request.head.sha || github.sha }}');
  });

  it('block the merge through the test join', () => {
    expect(ci.jobs.test.needs).toContain('pr-a11y-dependent-audits');
    expect(
      ci.jobs.test.steps.find(
        s => s.name === 'Require expected test-owner outcomes',
      ).env.PR_A11Y_DEPENDENT_AUDITS_RESULT,
    ).toBe('${{ needs.pr-a11y-dependent-audits.result }}');
    expect(
      fs.readFileSync(
        path.join(root, '.github/scripts/ci-test-join.mjs'),
        'utf8',
      ),
    ).toContain(
      "['pr-a11y-dependent-audits', process.env.PR_A11Y_DEPENDENT_AUDITS_RESULT]",
    );
  });
});
