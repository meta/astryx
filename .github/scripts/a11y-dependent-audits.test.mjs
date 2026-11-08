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

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {
  budgetFor,
  changedPrimitives,
  dependentAudits,
  LATER_MAX_LEGS,
  listAuditSpecs,
  MAX_LEGS,
  planDependentAudits,
  PRIMITIVES_FILE,
  readPrimitives,
  TOO_LARGE,
  UNDECIDED,
  undecidedMessage,
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

  it('plans nothing for a change to no component source', () => {
    for (const changed of [
      ['packages/core/src/Button/Button.test.tsx'],
      ['packages/core/src/Button/Button.doc.mjs'],
      [],
    ]) {
      expect(plan(changed)).toMatchObject({
        count: 0,
        files: [],
        shares: [],
        owed: [],
        complete: true,
      });
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

describe("a component's source change runs its own audits", () => {
  it("runs DropdownMenu's own audits for a DropdownMenu change", () => {
    const {components, primitives, files, deferred, complete} = plan([
      'packages/core/src/DropdownMenu/DropdownMenu.tsx',
    ]);
    expect(components).toEqual(['core/DropdownMenu']);
    expect(primitives).toEqual([]);
    expect(files).toEqual(
      expect.arrayContaining([
        'packages/core/src/DropdownMenu/__tests__/DropdownMenuRadioItemAudit.a11y.chromium.spec.ts',
        'packages/core/src/DropdownMenu/__tests__/DropdownMenuSubMenuAudit.a11y.chromium.spec.ts',
      ]),
    );
    expect(deferred).toEqual([]);
    expect(complete).toBe(true);
  });

  // Five components, each with one audit of about seven minutes: three fit
  // three legs of ten minutes on a first run.
  const wide = {
    changed: ['A', 'B', 'C', 'D', 'E'].map(
      name => `packages/core/src/${name}/${name}.tsx`,
    ),
    primitives: ['core/Button'],
    specs: ['A', 'B', 'C', 'D', 'E'].map(name => ({
      file: `packages/core/src/${name}/__tests__/${name}Audit.a11y.chromium.spec.ts`,
      mode: 'audit',
    })),
    importers: new Map(),
    seconds: Object.fromEntries(
      ['A', 'B', 'C', 'D', 'E'].map(name => [
        `packages/core/src/${name}/__tests__/${name}Audit.a11y.chromium.spec.ts`,
        420,
      ]),
    ),
  };

  it('gives an audit over ten minutes its own leg and still fits the rest', () => {
    const file = name =>
      `packages/core/src/${name}/__tests__/${name}Audit.a11y.chromium.spec.ts`;
    const long = {
      changed: ['A', 'B', 'C'].map(
        name => `packages/core/src/${name}/${name}.tsx`,
      ),
      primitives: ['core/Button'],
      specs: ['A', 'B', 'C'].map(name => ({file: file(name), mode: 'audit'})),
      importers: new Map(),
      seconds: {[file('A')]: 700, [file('B')]: 300, [file('C')]: 300},
    };
    const both = planDependentAudits(long);
    expect(both.files).toEqual([file('A'), file('B'), file('C')]);
    expect(both.deferred).toEqual([]);
    expect(both.shares).toContainEqual([file('A')]);
    // A lone long audit plans one leg, never an empty one.
    const alone = planDependentAudits({...long, changed: [long.changed[0]]});
    expect(alone.count).toBe(1);
    expect(alone.shares).toEqual([[file('A')]]);
  });

  it('names the audits a first run cannot fit, and runs them all later at the same head', () => {
    const first = planDependentAudits(wide);
    expect(first.owed).toHaveLength(5);
    expect(first.files).toHaveLength(3);
    expect(first.deferred).toEqual([
      'packages/core/src/D/__tests__/DAudit.a11y.chromium.spec.ts',
      'packages/core/src/E/__tests__/EAudit.a11y.chromium.spec.ts',
    ]);
    expect(first.complete).toBe(false);
    expect(first.count).toBeLessThanOrEqual(MAX_LEGS);
    expect(first.longestMs).toBeLessThanOrEqual(LEG_BUDGET_MS);
    const later = planDependentAudits({...wide, attempt: 2});
    expect(later.files).toEqual(later.owed);
    expect(later.deferred).toEqual([]);
    expect(later.complete).toBe(true);
    expect(later.count).toBeLessThanOrEqual(LATER_MAX_LEGS);
    expect(later.longestMs).toBeLessThanOrEqual(LEG_BUDGET_MS);
  });
});

describe('an undecided scope', () => {
  const everything = attempt =>
    planDependentAudits({
      changed: [],
      primitives: readPrimitives(root),
      specs,
      importers,
      seconds,
      attempt,
      everything: true,
    });

  it('owes every audit, runs what fits, and is never complete', () => {
    const expected = specs
      .filter(({mode}) => mode === 'audit')
      .map(({file}) => file)
      .sort();
    for (const attempt of [1, 2]) {
      const plan = everything(attempt);
      expect([...plan.owed].sort()).toEqual(expected);
      expect([...plan.files, ...plan.deferred].sort()).toEqual(expected);
      expect(plan.complete).toBe(false);
      expect(plan.count).toBeLessThanOrEqual(MAX_LEGS);
      expect(plan.longestMs).toBeLessThanOrEqual(
        budgetFor(plan.files, seconds),
      );
    }
  });

  it('asks for a split only when GitHub truncated the file list', () => {
    const plan = {deferred: ['a', 'b']};
    const truncated = undecidedMessage(plan, true);
    expect(truncated.annotation).toContain(
      'diff too large to scope (>3,000 files); split the PR',
    );
    expect(truncated.summary).toContain(TOO_LARGE);
    const unread = undecidedMessage(plan, false);
    expect(unread.annotation).toContain(
      'the changed files could not be read; re-run all jobs at this head',
    );
    expect(unread.annotation).not.toContain('split the PR');
    expect(unread.summary).toContain(UNDECIDED);
  });

  it('prints the message the scope calls for', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dependent-audits-'));
    try {
      const run = args =>
        execFileSync(
          process.execPath,
          [
            '.github/scripts/a11y-dependent-audits.mjs',
            ...args,
            '--out',
            path.join(dir, 'record.json'),
          ],
          {
            cwd: root,
            encoding: 'utf8',
            env: {...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: ''},
          },
        );
      expect(run(['--all', '--truncated'])).toContain(
        `::error title=Diff too large to scope::${TOO_LARGE}`,
      );
      expect(run(['--all'])).toContain(
        `::error title=Scope not decided::${UNDECIDED}`,
      );
      const record = JSON.parse(
        fs.readFileSync(path.join(dir, 'record.json'), 'utf8'),
      );
      expect(record.complete).toBe(false);
      // The last run here had no --truncated: the record says why it is undecided.
      expect(record.undecided).toBe('unreadable');
      run(['--all', '--truncated']);
      expect(
        JSON.parse(fs.readFileSync(path.join(dir, 'record.json'), 'utf8'))
          .undecided,
      ).toBe('truncated');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
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
    expect(run.run).toContain(
      'node .github/scripts/a11y-dependent-audits.mjs "${changes[@]}" --out "$RUNNER_TEMP/a11y-dependent-audits.json" --attempt "$RUN_ATTEMPT"',
    );
    // An undecided scope (a truncated diff) owes every audit; a decided
    // scope without its list stops.
    expect(run.run).toContain('changes=(--all)');
    // Only a truncated file list asks for a split.
    expect(run.env.TRUNCATED).toBe('${{ steps.scope.outputs.truncated }}');
    expect(run.run).toContain('elif [ "$TRUNCATED" = true ]; then');
    expect(run.run).toContain('changes=(--all --truncated)');
    expect(step(planJob, 'Require the changed-file list').if).toContain(
      "steps.scope.outputs.decided != 'false'",
    );
    expect(run.env.RUN_ATTEMPT).toBe('${{ github.run_attempt }}');
    expect(step(planJob, 'Require the changed-file list').run).toContain(
      'exit 1',
    );
  });

  it('give merge-guard the record of owed, ran, deferred and complete', () => {
    for (const key of ['owed', 'ran', 'deferred'])
      expect(planJob.outputs[key]).toBe(
        `\${{ steps.plan.outputs.${key} || '[]' }}`,
      );
    expect(planJob.outputs.complete).toBe(
      "${{ steps.plan.outputs.complete || 'true' }}",
    );
    // A run out of scope still writes a record that owes nothing.
    const skip = step(planJob, 'Skip the dependent audits outside their scope');
    expect(skip.run).toContain(
      '"owed": [], "ran": [], "deferred": [], "complete": true',
    );
    expect(skip.run).toContain('> "$RUNNER_TEMP/a11y-dependent-audits.json"');
    // It names the same fields as the planner's own record for a decided scope.
    const template = /printf '(\{.*\})\\n'/.exec(skip.run)[1];
    const outOfScope = JSON.parse(
      template.replace('"%s"', '"head"').replace('%s', '1'),
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dependent-record-'));
    try {
      fs.writeFileSync(path.join(dir, 'changed.txt'), 'README.md\n');
      execFileSync(
        process.execPath,
        [
          '.github/scripts/a11y-dependent-audits.mjs',
          '--changed',
          path.join(dir, 'changed.txt'),
          '--out',
          path.join(dir, 'record.json'),
        ],
        {
          cwd: root,
          env: {...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: ''},
        },
      );
      const planned = JSON.parse(
        fs.readFileSync(path.join(dir, 'record.json'), 'utf8'),
      );
      expect(Object.keys(outOfScope).sort()).toEqual(
        Object.keys(planned).sort(),
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
    const upload = step(planJob, 'Upload the dependent-audit record');
    // Every run uploads a record, and a run without one fails in CI.
    expect(upload.if).toBe('always()');
    expect(upload.with['if-no-files-found']).toBe('error');
    expect(upload.with.name).toBe(
      'a11y-dependent-audits-record-${{ github.run_attempt }}',
    );
    expect(upload.with.path).toBe(
      '${{ runner.temp }}/a11y-dependent-audits.json',
    );
  });

  it('run up to six legs, on a full runner only when a leg has a share', () => {
    expect(legs.strategy.matrix.leg).toEqual([1, 2, 3, 4, 5, 6]);
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
