// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {planLegs, recordLog} from './playwright-legs.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const durations = JSON.parse(
  fs.readFileSync(
    path.join(root, '.github/playwright-leg-durations.json'),
    'utf8',
  ),
);
const step = (job, name) => job.steps.find(each => each.name === name);

describe('planLegs', () => {
  const times = {a: 120, b: 100, c: 80, d: 50, e: 40, f: 30, g: 20, h: 10};
  const files = Object.keys(times);

  it('puts every spec file in exactly one leg', () => {
    for (const legs of [1, 2, 3, 5, 8, 11]) {
      const plan = planLegs(files, times, legs);
      expect(plan).toHaveLength(legs);
      expect(plan.flatMap(leg => leg.files).sort()).toEqual([...files].sort());
    }
  });

  it('balances the legs by recorded time, the longest file first', () => {
    const plan = planLegs(files, times, 3);
    const seconds = plan.map(leg => leg.seconds);
    // No leg is longer than the shortest by more than its longest file.
    expect(Math.max(...seconds) - Math.min(...seconds)).toBeLessThanOrEqual(
      120,
    );
    expect(seconds.reduce((sum, value) => sum + value, 0)).toBe(450);
    expect(plan.map(leg => leg.files)).toEqual([
      ['a', 'f'],
      ['b', 'e', 'h'],
      ['c', 'd', 'g'],
    ]);
  });

  it('gives the same split for the same files in any order', () => {
    const shuffled = ['h', 'c', 'a', 'f', 'b', 'g', 'd', 'e', 'a'];
    expect(planLegs(shuffled, times, 3)).toEqual(planLegs(files, times, 3));
  });

  it('counts a spec file with no recorded time as the median recorded time', () => {
    const plan = planLegs([...files, 'new.spec.ts'], times, 2);
    const leg = plan.find(each => each.files.includes('new.spec.ts'));
    const others = leg.files.filter(file => file !== 'new.spec.ts');
    expect(
      leg.seconds - others.reduce((sum, file) => sum + times[file], 0),
    ).toBe(50);
    expect(planLegs(['x', 'y'], {}, 2).map(each => each.seconds)).toEqual([
      1, 1,
    ]);
  });

  it('refuses a leg count that is not a positive integer', () => {
    expect(() => planLegs(files, times, 0)).toThrow(/positive integer/);
    expect(() => planLegs(files, times, 1.5)).toThrow(/positive integer/);
  });
});

describe('the list reader and recordLog', () => {
  it('reads the list report with the reader the accessibility contracts use', () => {
    const source = fs.readFileSync(
      path.join(root, '.github/scripts/playwright-legs.mjs'),
      'utf8',
    );
    expect(source).toContain(
      "import {listedFiles} from './a11y-pr-contracts.mjs';",
    );
    expect(source).not.toMatch(/function listedFiles/);
  });

  it("records each test's gap from the line before it, under its spec file and project", () => {
    const log = [
      '2026-11-03T17:05:40.000Z Running 3 tests using 1 worker',
      '2026-11-03T17:05:43.000Z   ✓    1 [chromium] › a.spec.ts:10:3 › first (2.9s)',
      '2026-11-03T17:05:44.500Z   ✓    2 [chromium] › a.spec.ts:20:3 › second (1.4s)',
      '2026-11-03T17:05:49.500Z   -    3 [chromium] › b.spec.ts:5:3 › skipped',
      '2026-11-03T17:05:59.000Z   ✓    1 [webkit] › c.spec.ts:5:3 › another project',
    ].join('\n');
    expect(recordLog(log, 'chromium')).toEqual({
      'a.spec.ts': 4.5,
      'b.spec.ts': 5,
    });
    expect(recordLog('no run here', 'chromium')).toEqual({});
  });

  it('reads a suite with one unnamed project, with its printed path made relative to its test directory', () => {
    const log = [
      '2026-11-03T20:04:07.000Z Running 2 tests using 1 worker',
      '2026-11-03T20:04:15.000Z   ✓   1 apps/docsite/e2e/a.spec.ts:37:5 › first (4.1s)',
      '2026-11-03T20:04:25.000Z   ✓   2 apps/docsite/e2e/b.spec.ts:65:7 › second (10.2s)',
    ].join('\n');
    expect(recordLog(log, undefined, 'apps/docsite/e2e/')).toEqual({
      'a.spec.ts': 8,
      'b.spec.ts': 10,
    });
    // A named project's lines never count for an unnamed one.
    expect(
      recordLog(
        '2026-11-03T20:04:07.000Z Running 1 test using 1 worker\n2026-11-03T20:04:15.000Z   ✓   1 [chromium] › a.spec.ts:3:5 › t',
        undefined,
      ),
    ).toEqual({});
  });
});

describe('the interaction proof legs in ci.yml', () => {
  const lanes = [
    {
      id: 'pr-interaction',
      project: 'chromium',
      legs: [1, 2],
      run: 'Run interaction proofs',
      plan: "Plan this leg's interaction proofs",
      evidence: 'interaction-evidence-${{ matrix.leg }}',
    },
    {
      id: 'pr-interaction-webkit',
      project: 'webkit',
      legs: [1, 2],
      run: 'Run WebKit interaction proofs',
      plan: "Plan this leg's WebKit interaction proofs",
      evidence: 'interaction-evidence-webkit-${{ matrix.leg }}',
    },
  ];

  for (const lane of lanes) {
    it(`${lane.id} runs as ${lane.legs.length} legs that each plan their share and run only it`, () => {
      const job = ci.jobs[lane.id];
      expect(job.strategy).toEqual({
        'fail-fast': false,
        matrix: {leg: lane.legs},
      });
      expect(job.name).toBe(
        `${lane.id} (\${{ matrix.leg }}/\${{ strategy.job-total }})`,
      );
      const plan = step(job, lane.plan);
      expect(plan.id).toBe('plan');
      expect(plan.if).toBe("steps.scope.outputs.applies == 'true'");
      // A head cut before the legs has neither the planner nor the times,
      // so both come from the scope checkout: the workflow's own commit.
      const scope = job.steps[0];
      expect(scope.name).toBe('Check out the scope action');
      expect(scope.with.ref).toBeUndefined();
      expect(scope.with.path).toBe('.test-scope');
      expect(scope.with['sparse-checkout'].trim().split('\n')).toEqual([
        '.github/actions/test-scope',
        '.github/scripts',
        'scripts/lib',
      ]);
      // The head checkout replaces the workspace, so a step before it keeps
      // the three files in the runner's temporary directory.
      const keep = step(job, "Keep the leg planner from the workflow's commit");
      const checkout = job.steps.findIndex(
        each =>
          each.name === 'Checkout' &&
          String(each.with?.ref).includes('pull_request.head.sha'),
      );
      expect(job.steps.indexOf(keep)).toBeGreaterThan(1);
      expect(job.steps.indexOf(keep)).toBeLessThan(checkout);
      expect(keep.if).toBe("steps.scope.outputs.applies == 'true'");
      for (const [file, dir] of [
        ['.github/scripts/playwright-legs.mjs', '.github/scripts/'],
        ['.github/scripts/a11y-pr-contracts.mjs', '.github/scripts/'],
        ['scripts/lib/duration-split.mjs', 'scripts/lib/'],
        ['.github/playwright-leg-durations.json', '.github/'],
      ])
        expect(keep.run).toContain(
          `cp .test-scope/${file} "$RUNNER_TEMP/interaction-legs/${dir}"`,
        );
      expect(plan.run).toContain(
        `--key interaction-${lane.project} --config playwright.interaction.config.ts --project ${lane.project}`,
      );
      expect(plan.run).toContain(
        '--durations "$RUNNER_TEMP/interaction-legs/.github/playwright-leg-durations.json"',
      );
      expect(plan.run).not.toMatch(/git (fetch|show)/);
      expect(plan.run).toContain(
        '--leg ${{ matrix.leg }} --of ${{ strategy.job-total }}',
      );
      expect(plan.run).toContain('--out "$RUNNER_TEMP/interaction-leg.txt"');
      const run = step(job, lane.run);
      expect(job.steps.indexOf(plan)).toBeLessThan(job.steps.indexOf(run));
      expect(run.if).toBe(
        "steps.scope.outputs.applies == 'true' && steps.plan.outputs.files != '0'",
      );
      expect(run.run).toContain(
        '--test-list "$RUNNER_TEMP/interaction-leg.txt"',
      );
      expect(run.run).toContain(`--project ${lane.project}`);
      // One worker per runner: the proofs measure frame timing.
      expect(run.run).not.toMatch(/--workers|INTERACTION_WORKERS|--shard/);
      expect(
        job.steps.find(each =>
          each.uses?.startsWith('actions/upload-artifact@'),
        ).with.name,
      ).toBe(lane.evidence);
    });
  }

  it('a change to the planner, its modules or the recorded times runs both lanes', () => {
    for (const id of ['pr-interaction', 'pr-interaction-webkit']) {
      const scope = ci.jobs[id].steps.find(each => each.id === 'scope');
      const pattern = new RegExp(scope.with.paths);
      for (const file of [
        '.github/scripts/playwright-legs.mjs',
        '.github/scripts/a11y-pr-contracts.mjs',
        'scripts/lib/duration-split.mjs',
        '.github/playwright-leg-durations.json',
      ])
        expect(pattern.test(file), `${id} ${file}`).toBe(true);
    }
  });

  it('the WebKit legs plan only the paths the WebKit lane covers', () => {
    const plan = step(
      ci.jobs['pr-interaction-webkit'],
      "Plan this leg's WebKit interaction proofs",
    ).run;
    const filters = plan
      .slice(plan.indexOf(' -- ') + 4)
      .replaceAll('\\', '')
      .trim()
      .split(/\s+/);
    expect(filters).toEqual([
      'packages/core/src/gestures/',
      'packages/core/src/motion/__tests__/animatedLayout.interaction',
      'packages/core/src/motion/__tests__/animator.interaction',
      'packages/core/src/hooks/__tests__/usePager.interaction',
      'internal/interaction-harness/',
      // Plus the interaction specs this pull request changes.
      '"${CHANGED_SPECS[@]}"',
    ]);
  });

  it("the test join reads each lane's whole result, so a failed, cancelled or skipped leg fails it", () => {
    const test = ci.jobs.test;
    expect(test.needs).toEqual(
      expect.arrayContaining(['pr-interaction', 'pr-interaction-webkit']),
    );
    const join = test.steps.find(each =>
      String(each.run ?? '').includes('ci-test-join.mjs'),
    );
    expect(join.env.PR_INTERACTION_RESULT).toBe(
      '${{ needs.pr-interaction.result }}',
    );
    expect(join.env.PR_INTERACTION_WEBKIT_RESULT).toBe(
      '${{ needs.pr-interaction-webkit.result }}',
    );
    // Build the all-passing environment from the join step itself, so a lane
    // added to the join cannot leave this fixture behind it.
    const laneResults = Object.entries(join.env).flatMap(([name, value]) => {
      const lane = /^\$\{\{ needs\.([\w-]+)\.result \}\}$/.exec(value)?.[1];
      return lane && lane !== 'release-bump' ? [[name, lane]] : [];
    });
    expect(laneResults.map(([, lane]) => lane)).toEqual(
      expect.arrayContaining([
        'pr-interaction',
        'pr-interaction-webkit',
        'pr-component-a11y-contracts',
      ]),
    );
    for (const [name, lane] of laneResults) {
      expect(test.needs, name).toContain(lane);
    }
    const scopes = Object.keys(join.env).filter(name =>
      /^\$\{\{ steps\.scope\.outputs\.\w+_only \}\}$/.test(join.env[name]),
    );
    const passing = {
      ...Object.fromEntries(laneResults.map(([name]) => [name, 'success'])),
      ...Object.fromEntries(scopes.map(name => [name, 'false'])),
      RELEASE_BUMP: 'false',
      RELEASE_BUMP_RESULT: 'skipped',
    };
    expect(Object.keys(passing).sort()).toEqual(Object.keys(join.env).sort());
    const joinExit = env =>
      spawnSync(
        process.execPath,
        [path.join(root, '.github/scripts/ci-test-join.mjs')],
        {env: {PATH: process.env.PATH, ...env}},
      ).status;
    expect(joinExit(passing)).toBe(0);
    // GitHub reports a matrix job's result as success only when every leg
    // succeeded; any other aggregate fails the join. A lane that has no work
    // for the pull request still runs and reports success, so a skipped lane
    // fails the join too.
    for (const [lane] of laneResults) {
      for (const result of ['failure', 'cancelled', 'skipped', '']) {
        expect(
          joinExit({...passing, [lane]: result}),
          `${lane}=${result}`,
        ).toBe(1);
      }
    }
  });

  it('records the docsite browser contracts too, one leg inside the same budget', () => {
    const times = durations.docsite;
    expect(Object.keys(times).length).toBeGreaterThan(0);
    const legs = ci.jobs['docsite-browser'].strategy.matrix.leg.length;
    for (const leg of planLegs(Object.keys(times), times, legs))
      expect(leg.seconds).toBeLessThanOrEqual(6 * 60);
  });

  it('records a time for each project the legs plan, each under the legs\u2019 per-runner budget', () => {
    for (const lane of lanes) {
      const times = durations[`interaction-${lane.project}`];
      expect(Object.keys(times).length, lane.project).toBeGreaterThan(0);
      const plan = planLegs(Object.keys(times), times, lane.legs.length);
      // About six minutes a leg under load; the recorded run was a loaded one.
      for (const leg of plan)
        expect(leg.seconds, lane.project).toBeLessThanOrEqual(6 * 60);
    }
  });

  it('plans from a copy outside the checkout, run in its root, with the times it is given', () => {
    const out = path.join(
      fs.mkdtempSync(path.join(root, 'node_modules/.cache-playwright-legs-')),
      'leg.txt',
    );
    try {
      const fake = path.join(path.dirname(out), 'pnpm');
      // A stand-in pnpm that writes a list report for two spec files.
      fs.writeFileSync(
        fake,
        // With a test list it lists only the files the list names, unless
        // the list names z.spec.ts, which matches nothing.
        [
          `#!${process.execPath}`,
          "const fs = require('node:fs');",
          "const at = process.argv.indexOf('--test-list');",
          "let files = (process.env.FAKE_FILES || 'x.spec.ts,y.spec.ts').split(',');",
          "if (at !== -1) files = fs.readFileSync(process.argv[at + 1], 'utf8').split('\\n').filter(f => f && f !== 'z.spec.ts');",
          'fs.writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, JSON.stringify({suites: files.map(file => ({specs: [{file}]}))}));',
          '',
        ].join('\n'),
        {mode: 0o755},
      );
      const output = path.join(path.dirname(out), 'github-output');
      // CI runs the workflow commit's copies of the planner and the splitter
      // it imports, laid out as in the tree, outside the checkout.
      const copies = path.join(path.dirname(out), 'legs');
      for (const file of [
        '.github/scripts/playwright-legs.mjs',
        '.github/scripts/a11y-pr-contracts.mjs',
        'scripts/lib/duration-split.mjs',
      ]) {
        fs.mkdirSync(path.dirname(path.join(copies, file)), {recursive: true});
        fs.copyFileSync(path.join(root, file), path.join(copies, file));
      }
      const copy = path.join(copies, '.github/scripts/playwright-legs.mjs');
      const times = path.join(path.dirname(out), 'durations.json');
      fs.writeFileSync(
        times,
        JSON.stringify({
          'interaction-chromium': {'x.spec.ts': 1, 'y.spec.ts': 100},
        }),
      );
      execFileSync(
        process.execPath,
        [
          copy,
          'plan',
          '--key',
          'interaction-chromium',
          '--config',
          'playwright.interaction.config.ts',
          '--project',
          'chromium',
          '--leg',
          '2',
          '--of',
          '2',
          '--durations',
          times,
          '--out',
          out,
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: `${path.dirname(fake)}:${process.env.PATH}`,
            GITHUB_OUTPUT: output,
          },
          encoding: 'utf8',
        },
      );
      // y is the long file, so it takes leg 1 and x is leg 2's.
      expect(fs.readFileSync(out, 'utf8')).toBe('x.spec.ts\n');
      expect(fs.readFileSync(output, 'utf8')).toBe('files=1\n');
      // A leg whose test list matches none of its files fails the plan.
      expect(() =>
        execFileSync(
          process.execPath,
          [
            copy,
            'plan',
            '--key',
            'interaction-chromium',
            '--config',
            'playwright.interaction.config.ts',
            '--project',
            'chromium',
            '--leg',
            '1',
            '--of',
            '1',
            '--durations',
            times,
            '--out',
            out,
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              PATH: `${path.dirname(fake)}:${process.env.PATH}`,
              FAKE_FILES: 'z.spec.ts',
            },
            stdio: 'pipe',
          },
        ),
      ).toThrow(/selects 0 spec files, not its 1/);
      expect(() =>
        execFileSync(
          process.execPath,
          [
            path.join(root, '.github/scripts/playwright-legs.mjs'),
            'plan',
            '--key',
            'interaction-chromium',
            '--config',
            'playwright.interaction.config.ts',
            '--project',
            'chromium',
            '--leg',
            '3',
            '--of',
            '2',
            '--out',
            out,
          ],
          {stdio: 'pipe'},
        ),
      ).toThrow();
    } finally {
      fs.rmSync(path.dirname(out), {recursive: true, force: true});
    }
  });
});
