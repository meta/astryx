// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {
  costsFor,
  countTests,
  estimateSeconds,
  folderSpecs,
  isInteractionSpec,
  legCount,
  legsFitMessage,
  nearCeilingMessage,
  planLegs,
  recordLog,
  selectProofs,
  testsReader,
} from './playwright-legs.mjs';
import {matrixFor} from './ci-matrix.mjs';

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

describe('nearCeilingMessage', () => {
  const limits = {setupSeconds: 90, maxSeconds: 600, maxLegs: 6};

  it('stays quiet while a whole leg of room is left', () => {
    expect(nearCeilingMessage({seconds: 2549, ...limits})).toBeNull();
  });

  it('names the room left once the proofs need the last leg', () => {
    expect(nearCeilingMessage({seconds: 2600, ...limits})).toBe(
      '2600 s of proofs need 6 of the 6 legs; 460 s of room is left before the ceiling',
    );
  });
});

describe('legsFitMessage', () => {
  const limits = {setupSeconds: 90, maxSeconds: 600, maxLegs: 3};
  const costs = {'a.spec.ts': 500, 'b.spec.ts': 500, 'c.spec.ts': 480};

  it('fits when the proofs need the last leg the matrix has', () => {
    expect(
      legsFitMessage({seconds: 1480, files: Object.keys(costs), costs, ...limits}),
    ).toBeNull();
  });

  it('names the heaviest specs when the proofs need more legs than the matrix has', () => {
    const more = {...costs, 'd.spec.ts': 400};
    const message = legsFitMessage({
      seconds: 1880,
      files: Object.keys(more),
      costs: more,
      ...limits,
    });
    expect(message).toContain('need 4 legs');
    expect(message).toContain('the matrix has 3');
    expect(message).toContain('a.spec.ts (500 s), b.spec.ts (500 s), c.spec.ts (480 s)');
  });

  it('names the spec when one spec alone outlasts a leg', () => {
    const one = {'huge.spec.ts': 700};
    expect(
      legsFitMessage({seconds: 700, files: ['huge.spec.ts'], costs: one, ...limits}),
    ).toContain('huge.spec.ts (700 s)');
  });
});

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

describe('estimateSeconds and legCount', () => {
  const times = {
    'internal/harness.spec.ts': 170,
    'packages/gestures/a.spec.ts': 50,
    'packages/List/row.spec.ts': 30,
  };

  const listed = Object.keys(times);

  it('adds the times of the listed files a filter selects and of each changed spec', () => {
    expect(
      estimateSeconds(times, ['internal/', 'packages/gestures/'], {listed}),
    ).toBe(220);
    // A changed spec already selected counts once.
    expect(
      estimateSeconds(times, ['internal/'], {
        listed,
        changed: ['internal/harness.spec.ts'],
      }),
    ).toBe(170);
    // A changed spec with no time of its own takes another browser's time,
    // then the median of this suite's times.
    expect(
      estimateSeconds(times, ['internal/'], {
        listed: [...listed, 'new.spec.ts'],
        changed: ['new.spec.ts'],
        fallback: {'new.spec.ts': 12},
      }),
    ).toBe(182);
    expect(
      estimateSeconds(times, ['internal/'], {
        listed: [...listed, 'other.spec.ts'],
        changed: ['other.spec.ts'],
      }),
    ).toBe(170 + 50);
    // A changed spec the merge commit no longer holds (deleted, or renamed
    // from) costs nothing, and its tests are never read.
    expect(
      estimateSeconds(times, ['internal/'], {
        listed,
        changed: ['gone.spec.ts'],
        testsOf: () => {
          throw new Error('read a deleted spec');
        },
        perTest: 1.5,
      }),
    ).toBe(170);
  });

  it('costs a spec with no recorded time by its tests at the mean time a test', () => {
    // A spec with 50 tests at 1.56 s a test, not the 10.7 s median file.
    const source = Array.from(
      {length: 50},
      (_, i) => `  test('case ${i}', async () => {});`,
    ).join('\n');
    expect(countTests(source)).toBe(50);
    expect(
      countTests(
        "test.describe('group', () => {\n  test.skip('a', () => {});\n  it('b', () => {});\n  test.use({});\n});",
      ),
    ).toBe(2);
    const estimate = estimateSeconds(times, ['packages/lab/'], {
      listed: [...listed, 'packages/lab/TabBar.spec.ts'],
      testsOf: file => (file === 'packages/lab/TabBar.spec.ts' ? 50 : 0),
      perTest: 1.56,
    });
    expect(estimate).toBeCloseTo(78, 5);
    // With no tests to count, the file median stands.
    expect(
      estimateSeconds(times, ['packages/lab/'], {
        listed: ['packages/lab/Empty.spec.ts'],
        testsOf: () => 0,
        perTest: 1.56,
      }),
    ).toBe(50);
  });

  it('counts a listed spec in the lane that has no recorded time yet', () => {
    expect(
      estimateSeconds(times, ['internal/'], {
        listed: [...listed, 'internal/pointer.spec.ts'],
      }),
    ).toBe(170 + 50);
  });

  it('plans one leg while setup and every proof fit the limit, and more past it', () => {
    const limits = {setupSeconds: 90, maxSeconds: 600, maxLegs: 2};
    expect(legCount({seconds: 0, ...limits})).toBe(1);
    expect(legCount({seconds: 510, ...limits})).toBe(1);
    expect(legCount({seconds: 511, ...limits})).toBe(2);
    // Never more legs than the matrix has.
    expect(legCount({seconds: 5000, ...limits})).toBe(2);
    expect(() =>
      legCount({seconds: 1, setupSeconds: 600, maxSeconds: 600, maxLegs: 2}),
    ).toThrow();
    // A broken estimate stops the leg rather than planning one leg.
    for (const seconds of [Number.NaN, Number.POSITIVE_INFINITY, -1])
      expect(() => legCount({seconds, ...limits})).toThrow(
        "the proofs' estimate is not a time",
      );
  });

  it('counts the spec files the interaction config runs, and no others', () => {
    const config = fs.readFileSync(
      path.join(root, 'playwright.interaction.config.ts'),
      'utf8',
    );
    // The config's patterns, which isInteractionSpec follows.
    for (const pattern of [
      "'internal/interaction-harness/src/**/*.interaction.browser.spec.ts'",
      "'packages/*/src/**/*.interaction.browser.spec.ts'",
      "'packages/core/src/gestures/__tests__/browser/*.browser.spec.ts'",
    ])
      expect(config).toContain(pattern);
    expect(
      isInteractionSpec(
        'packages/core/src/List/__tests__/ListRowPress.interaction.browser.spec.ts',
      ),
    ).toBe(true);
    expect(
      isInteractionSpec(
        'packages/core/src/gestures/__tests__/browser/flick.browser.spec.ts',
      ),
    ).toBe(true);
    expect(
      isInteractionSpec(
        'packages/core/src/List/__tests__/List.browser.spec.ts',
      ),
    ).toBe(false);
    expect(isInteractionSpec('packages/core/src/gestures/flick.ts')).toBe(
      false,
    );
  });
});

describe('the list reader and recordLog', () => {
  it("reads the list report and the component folder with the accessibility contracts' own helpers", () => {
    const source = fs.readFileSync(
      path.join(root, '.github/scripts/playwright-legs.mjs'),
      'utf8',
    );
    expect(source).toMatch(
      /import \{[^}]*\bisComponentPath\b[^}]*\blistedFiles\b[^}]*\bspecOwners\b[^}]*\} from '\.\/a11y-pr-contracts\.mjs';/,
    );
    expect(source).not.toMatch(/function listedFiles/);
    // No folder rule of its own.
    expect(source).not.toMatch(/const FOLDER =/);
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

describe('the interaction leg count job in ci.yml', () => {
  const counter = ci.jobs['interaction-legs'];
  const lanes = [
    {id: 'pr-interaction', key: 'chromium', count: "Count this run's legs", mine: 'Count the Chromium legs'},
    {id: 'pr-interaction-webkit', key: 'webkit', count: "Count this run's WebKit legs", mine: 'Count the WebKit legs'},
  ];

  it('runs beside the Storybook build, behind the gate the lanes share', () => {
    expect(counter.needs).toEqual(['room', 'admission', 'heavy-ci', 'webkit-weekly-request']);
    // The WebKit lane's gate, which also admits the weekly full run.
    expect(counter.if).toBe(ci.jobs['pr-interaction-webkit'].if);
    expect(counter.env).toEqual(ci.jobs['pr-interaction-webkit'].env);
    expect(counter.outputs).toEqual({
      chromium: '${{ steps.matrix.outputs.chromium }}',
      webkit: '${{ steps.matrix.outputs.webkit }}',
    });
  });

  it('checks out and keeps the planner exactly as each lane does', () => {
    // A file the lanes' planner needs but this job did not copy would fail
    // its count and send every run back to the ten-leg fallback.
    for (const lane of lanes) {
      const job = ci.jobs[lane.id];
      expect(counter.steps[0]).toEqual(job.steps[0]);
      const keep = "Keep the leg planner from the workflow's commit";
      expect(step(counter, keep).run).toBe(step(job, keep).run);
    }
  });

  for (const lane of lanes) {
    it(`counts the ${lane.key} lane the way its legs do`, () => {
      const job = ci.jobs[lane.id];
      const scope = step(job, "Decide this job's scope");
      const myScope = counter.steps.find(each => each.id === `scope-${lane.key}`);
      expect(myScope.uses).toBe(scope.uses);
      expect(myScope.with).toEqual(scope.with);
      const theirs = step(job, lane.count);
      const mine = step(counter, lane.mine);
      expect(mine.id).toBe(`count-${lane.key}`);
      expect(mine.if).toBe(`steps.scope-${lane.key}.outputs.applies == 'true'`);
      // A failed count falls back to ten legs that each decide for themselves.
      expect(mine['continue-on-error']).toBe(true);
      expect(mine.env ?? {}).toEqual(
        JSON.parse(
          JSON.stringify(theirs.env ?? {}).replaceAll('steps.scope.', `steps.scope-${lane.key}.`),
        ),
      );
      expect(mine.run).toBe(theirs.run.replaceAll('${{ matrix.leg }}', '1'));
      expect(theirs.run).toContain('--max-legs 10');
    });
  }

  it('names each lane one leg out of scope, its count in scope, and ten when the count failed', () => {
    const name = step(counter, "Name each lane's legs");
    expect(name.id).toBe('matrix');
    const outputs = (chromium, webkit) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interaction-legs-'));
      try {
        const output = path.join(dir, 'output.txt');
        fs.writeFileSync(output, '');
        execFileSync('bash', ['-e', '-c', name.run], {
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_OUTPUT: output,
            CHROMIUM_OUTCOME: chromium[0],
            CHROMIUM_COUNT: chromium[1],
            WEBKIT_OUTCOME: webkit[0],
            WEBKIT_COUNT: webkit[1],
          },
        });
        return fs.readFileSync(output, 'utf8');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    };
    expect(outputs(['success', '3'], ['success', '0'])).toBe('chromium=[1, 2, 3]\nwebkit=[1]\n');
    expect(outputs(['skipped', ''], ['failure', ''])).toBe(
      'chromium=[1]\nwebkit=[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\n',
    );
    expect(outputs(['success', '12'], ['success', '6'])).toBe(
      'chromium=[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\nwebkit=[1, 2, 3, 4, 5, 6]\n',
    );
  });

  it('caps every count at the ceiling the lanes\' fallback matrix lists, ten legs', () => {
    const ceiling = matrixFor(ci.jobs['pr-interaction'].strategy.matrix.leg, 'pull_request').length;
    expect(ceiling).toBe(10);
    expect(matrixFor(ci.jobs['pr-interaction-webkit'].strategy.matrix.leg, 'pull_request')).toHaveLength(ceiling);
    for (const lane of lanes) {
      expect(step(ci.jobs[lane.id], lane.count).run).toContain(`--max-legs ${ceiling}`);
      expect(step(counter, lane.mine).run).toContain(`--max-legs ${ceiling}`);
    }
    const name = step(counter, "Name each lane's legs").run;
    expect(name).toContain(`*) count=${ceiling} ;;`);
    expect(name).toContain(`[ "$count" -le ${ceiling} ] || count=${ceiling}`);
  });

  it('reads a counted matrix as its fallback list, the most legs it starts', () => {
    expect(
      matrixFor(
        "${{ fromJSON(needs.interaction-legs.outputs.webkit || '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]') }}",
        'pull_request',
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('the interaction proof legs in ci.yml', () => {
  const lanes = [
    {
      id: 'pr-interaction',
      project: 'chromium',
      legs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      matrix: 'chromium',
      run: 'Run interaction proofs',
      plan: "Plan this leg's interaction proofs",
      evidence: 'interaction-evidence-${{ matrix.leg }}',
      // As few legs as fit; see the leg counts below.
      gate: "steps.scope.outputs.applies == 'true' && steps.legs.outputs.runs == 'true'",
      leg: '${{ steps.legs.outputs.leg }}',
      of: '${{ steps.legs.outputs.count }}',
      count: "Count this run's legs",
      fallback: 'webkit',
    },
    {
      id: 'pr-interaction-webkit',
      project: 'webkit',
      legs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      matrix: 'webkit',
      run: 'Run WebKit interaction proofs',
      plan: "Plan this leg's WebKit interaction proofs",
      evidence: 'interaction-evidence-webkit-${{ matrix.leg }}',
      // One leg runs every proof while they fit; see the leg count below.
      gate: "steps.scope.outputs.applies == 'true' && steps.legs.outputs.runs == 'true'",
      leg: '${{ steps.legs.outputs.leg }}',
      of: '${{ steps.legs.outputs.count }}',
      count: "Count this run's WebKit legs",
      fallback: 'chromium',
    },
  ];

  for (const lane of lanes) {
    it(`${lane.id} runs as the legs interaction-legs counts, at most ${lane.legs.length}, that each plan their share and run only it`, () => {
      const job = ci.jobs[lane.id];
      expect(job.strategy).toEqual({
        'fail-fast': false,
        matrix: {
          leg: `\${{ fromJSON(needs.interaction-legs.outputs.${lane.matrix} || '${JSON.stringify(lane.legs).replaceAll(',', ', ')}') }}`,
        },
      });
      expect(job.name).toBe(
        `${lane.id} (\${{ matrix.leg }}/\${{ strategy.job-total }})`,
      );
      const plan = step(job, lane.plan);
      expect(plan.id).toBe('plan');
      expect(plan.if).toBe(lane.gate);
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
        `--key interaction-${lane.project} --fallback-key interaction-${lane.fallback} --tests "$RUNNER_TEMP/interaction-legs/tests.json"`,
      );
      expect(plan.run).toContain(
        `--config playwright.interaction.config.ts --project ${lane.project}`,
      );
      expect(plan.run).toContain(
        '--durations "$RUNNER_TEMP/interaction-legs/.github/playwright-leg-durations.json"',
      );
      expect(plan.run).not.toMatch(/git (fetch|show)/);
      expect(plan.run).toContain(`--leg ${lane.leg} --of ${lane.of}`);
      expect(plan.run).toContain('--out "$RUNNER_TEMP/interaction-leg.txt"');
      const run = step(job, lane.run);
      expect(job.steps.indexOf(plan)).toBeLessThan(job.steps.indexOf(run));
      expect(run.if).toBe(`${lane.gate} && steps.plan.outputs.files != '0'`);
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

  describe("the WebKit legs' count", () => {
    const job = ci.jobs['pr-interaction-webkit'];
    const count = step(job, "Count this run's WebKit legs");

    it('decides before any setup, from the workflow commit’s planner and times', () => {
      expect(count.id).toBe('legs');
      expect(count.if).toBe("steps.scope.outputs.applies == 'true'");
      const at = job.steps.indexOf(count);
      expect(at).toBeGreaterThan(
        job.steps.indexOf(
          step(job, "Keep the leg planner from the workflow's commit"),
        ),
      );
      expect(at).toBeLessThan(
        job.steps.indexOf(step(job, 'Check out the heavy-suite caps')),
      );
      expect(count.env.CHANGED_FILES).toBe(
        '${{ steps.scope.outputs.changed_files_path }}',
      );
      for (const part of [
        '--key interaction-webkit --fallback-key interaction-chromium',
        '--durations "$RUNNER_TEMP/interaction-legs/.github/playwright-leg-durations.json"',
        '--setup-seconds 90 --max-seconds 600',
        '--leg ${{ matrix.leg }} --max-legs 10',
        // Every spec file in the merge commit, recorded or not.
        'git -C .test-scope ls-tree -r --name-only HEAD > "$RUNNER_TEMP/interaction-legs/listed.txt"',
        '--listed "$RUNNER_TEMP/interaction-legs/listed.txt" --source .test-scope',
        // The changed files, except for the release check, which plans every
        // spec already.
        'CHANGED=(--changed "${CHANGED_FILES:-}")',
        'if [ "${WEBKIT_ALL_SPECS:-}" = true ]; then CHANGED=(); fi',
        '"${CHANGED[@]}"',
      ])
        expect(count.run).toContain(part);
    });

    // Runs the count step with the real planner on these recorded times.
    // A shared-code change: the lane's own paths count.
    const gestureChange = ['packages/core/src/gestures/GestureHost.ts'];
    function countFor(
      leg,
      webkitTimes,
      changed = gestureChange,
      unrecorded = [],
      {deleted = [], sources = {}, perTest, env = {}} = {},
    ) {
      // The real path: the planner runs only when invoked as its own file.
      const dir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'webkit-legs-')),
      );
      try {
        const copy = path.join(dir, 'interaction-legs');
        fs.mkdirSync(path.join(copy, '.github/scripts'), {recursive: true});
        fs.mkdirSync(path.join(copy, 'scripts/lib'), {recursive: true});
        for (const file of [
          '.github/scripts/playwright-legs.mjs',
          '.github/scripts/a11y-pr-contracts.mjs',
          'scripts/lib/duration-split.mjs',
        ])
          fs.copyFileSync(path.join(root, file), path.join(copy, file));
        fs.writeFileSync(
          path.join(copy, '.github/playwright-leg-durations.json'),
          JSON.stringify({
            'interaction-webkit': webkitTimes,
            'interaction-chromium': {},
            ...(perTest
              ? {'seconds-per-test': {'interaction-webkit': perTest}}
              : {}),
          }),
        );
        // The scope checkout: a repository whose tree holds the spec files.
        const scope = path.join(dir, '.test-scope');
        // A changed spec is in the merge commit too, unless it was deleted.
        const present = (changed ?? []).filter(
          file => isInteractionSpec(file) && !deleted.includes(file),
        );
        for (const file of [
          ...Object.keys(webkitTimes),
          ...unrecorded,
          ...present,
        ]) {
          fs.mkdirSync(path.join(scope, path.dirname(file)), {recursive: true});
          fs.writeFileSync(path.join(scope, file), sources[file] ?? '');
        }
        const git = args =>
          execFileSync('git', ['-C', scope, ...args], {stdio: 'ignore'});
        git(['init', '-q']);
        git(['add', '-A']);
        git([
          '-c',
          'user.name=t',
          '-c',
          'user.email=t@example.com',
          'commit',
          '-qm',
          'scope',
          '--no-verify',
        ]);
        // A null list stands for a scope step that could not list the files.
        const list = changed == null ? '' : path.join(dir, 'changed.txt');
        if (list)
          fs.writeFileSync(list, changed.map(file => `${file}\n`).join(''));
        const output = path.join(dir, 'output.txt');
        execFileSync(
          'bash',
          [
            '-e',
            '-c',
            count.run
              .replaceAll('${{ matrix.leg }}', String(leg))
              .replaceAll(
                '${{ strategy.job-total }}',
                '6',
              ),
          ],
          {
            cwd: dir,
            encoding: 'utf8',
            env: {
              ...process.env,
              RUNNER_TEMP: dir,
              CHANGED_FILES: list,
              GITHUB_OUTPUT: output,
              WEBKIT_SPEC_PATHS: job.env.WEBKIT_SPEC_PATHS,
              WEBKIT_SHARED_PATHS: job.env.WEBKIT_SHARED_PATHS,
              ...env,
            },
          },
        );
        const result = Object.fromEntries(
          fs
            .readFileSync(output, 'utf8')
            .trim()
            .split('\n')
            .map(line => line.split('=')),
        );
        // The counts the plan step reads after the head checkout.
        const testsFile = path.join(dir, 'interaction-legs/tests.json');
        if (fs.existsSync(testsFile))
          Object.defineProperty(result, 'tests', {
            value: JSON.parse(fs.readFileSync(testsFile, 'utf8')),
          });
        return result;
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    }

    it("decides the WebKit scope only for the release tooling's interaction-check/ pull request", () => {
      expect(job.env.WEBKIT_RELEASE_CHECK).toBe(
        "${{ startsWith(github.head_ref, 'interaction-check/') && github.event.pull_request.user.login == 'cixzhang' && github.event.pull_request.head.repo.full_name == github.repository }}",
      );
      // The expression's three conditions, read against a pull request.
      const fullScope = pr =>
        job.env.WEBKIT_RELEASE_CHECK.slice(3, -2)
          .trim()
          .split(' && ')
          .every(condition => {
            const value = name =>
              name.startsWith("'") ? name.slice(1, -1) : pr[name];
            const prefix = /^startsWith\(([\w.]+), '([^']+)'\)$/.exec(
              condition,
            );
            if (prefix) return String(value(prefix[1])).startsWith(prefix[2]);
            const [left, right] = condition.split(' == ');
            return value(left) === value(right);
          });
      const tooling = {
        'github.head_ref': 'interaction-check/3bd5a4c1b4',
        'github.event.pull_request.user.login': 'cixzhang',
        'github.event.pull_request.head.repo.full_name': 'meta/astryx',
        'github.repository': 'meta/astryx',
      };
      expect(fullScope(tooling)).toBe(true);
      // The same branch prefix from another author, or from a fork, keeps
      // the normal scope; so does the tooling account on another branch.
      expect(
        fullScope({
          ...tooling,
          'github.event.pull_request.user.login': 'someone',
        }),
      ).toBe(false);
      expect(
        fullScope({
          ...tooling,
          'github.event.pull_request.head.repo.full_name': 'someone/astryx',
        }),
      ).toBe(false);
      expect(
        fullScope({...tooling, 'github.head_ref': 'fix/interaction-check'}),
      ).toBe(false);
      // A spec outside the WebKit paths, long enough for two legs.
      const times = {
        'packages/core/src/Button/__tests__/Button.interaction.browser.spec.ts': 700,
      };
      expect(countFor(1, times)).toEqual({count: '1', runs: 'true', leg: '1'});
      expect(
        countFor(1, times, [], [], {env: {WEBKIT_ALL_SPECS: 'true'}}),
      ).toEqual({count: '2', runs: 'true', leg: '1'});
      // Without it, a change that touches nothing WebKit covers plans none.
      expect(
        countFor(1, times, [], [], {env: {WEBKIT_ALL_SPECS: 'false'}}),
      ).toEqual({count: '0', runs: 'false', leg: '1'});
    });

    it('writes the test counts it read for the plan, and skips a deleted spec', () => {
      const times = {
        'internal/interaction-harness/src/harness.interaction.browser.spec.ts': 100,
      };
      const fresh =
        'internal/interaction-harness/src/fresh.interaction.browser.spec.ts';
      const gone =
        'packages/core/src/List/__tests__/Gone.interaction.browser.spec.ts';
      const result = countFor(2, times, [fresh, gone], [], {
        deleted: [gone],
        sources: {[fresh]: "test('a', () => {});\ntest('b', () => {});\n"},
        perTest: 2,
      });
      expect(result).toEqual({count: '1', runs: 'false', leg: '2'});
      expect(result.tests).toEqual({[fresh]: 2});
    });

    it('gives the whole suite to the first leg at today’s recorded times', () => {
      const times = durations['interaction-webkit'];
      expect(countFor(1, times)).toEqual({count: '1', runs: 'true', leg: '1'});
      expect(countFor(2, times)).toEqual({count: '1', runs: 'false', leg: '2'});
    });

    it('adds the second leg once setup and the proofs pass ten minutes', () => {
      const times = {
        'internal/interaction-harness/src/harness.interaction.browser.spec.ts': 400,
        'packages/core/src/gestures/__tests__/browser/gestures.interaction.browser.spec.ts': 111,
      };
      expect(countFor(2, times)).toEqual({count: '2', runs: 'true', leg: '2'});
      // A changed spec counts too: here it tips one leg into two.
      const near = {
        'internal/interaction-harness/src/harness.interaction.browser.spec.ts': 500,
      };
      expect(countFor(2, near)).toEqual({count: '1', runs: 'false', leg: '2'});
      // So does a planned spec with no recorded time: here the median, 500 s.
      expect(
        countFor(2, near, gestureChange, [
          'internal/interaction-harness/src/pointer.interaction.browser.spec.ts',
        ]),
      ).toEqual({count: '2', runs: 'true', leg: '2'});
      expect(
        countFor(2, near, [
          'packages/core/src/List/__tests__/ListRowPress.interaction.browser.spec.ts',
          'packages/core/src/List/ListRow.tsx',
        ]),
      ).toEqual({count: '2', runs: 'true', leg: '2'});
    });

    it('splits the whole suite for the release check even without a changed-file list', () => {
      // With every spec planned, a missing list must not make each leg run
      // the whole suite on its own.
      const times = {
        'packages/core/src/Button/__tests__/Button.interaction.browser.spec.ts': 700,
      };
      for (const leg of [1, 2])
        expect(
          countFor(leg, times, null, [], {env: {WEBKIT_ALL_SPECS: 'true'}}),
        ).toEqual({count: '2', runs: 'true', leg: String(leg)});
    });

    it('runs every proof in a leg that has no changed-file list, as a leg of its own', () => {
      // Whatever the other leg counts, every proof then runs in some leg.
      for (const leg of [1, 2])
        expect(countFor(leg, durations['interaction-webkit'], null)).toEqual({
          count: '1',
          runs: 'true',
          leg: '1',
        });
    });
  });

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
    const job = ci.jobs['pr-interaction-webkit'];
    expect(job.env.WEBKIT_SPEC_PATHS.split(' ')).toEqual([
      'packages/core/src/gestures/',
      'packages/core/src/motion/__tests__/animatedLayout.interaction',
      'packages/core/src/motion/__tests__/animator.interaction',
      'packages/core/src/hooks/__tests__/usePager.interaction',
      'internal/interaction-harness/',
    ]);
    // The leg count selects from the lane's paths once, and the count and
    // the plan both read that selection, so the two legs agree. The release
    // interaction check selects every spec.
    const count = step(job, "Count this run's WebKit legs").run;
    expect(count).toContain(
      'if [ "${WEBKIT_ALL_SPECS:-}" = true ]; then SPEC_PATHS=(packages/ internal/); else read -ra SPEC_PATHS <<< "$WEBKIT_SPEC_PATHS"; fi',
    );
    expect(count).toContain('-- "${SPEC_PATHS[@]}" > "$selected"');
    expect(count).toContain('-- "${SELECTED[@]}"');
    const plan = step(job, "Plan this leg's WebKit interaction proofs").run;
    expect(plan).toContain(
      'done < "$RUNNER_TEMP/interaction-legs/selected.txt"',
    );
    expect(
      plan
        .slice(plan.indexOf(' -- ') + 4)
        .replaceAll('\\', '')
        .trim()
        .split(/\s+/),
    ).toEqual(['"${PLANNED[@]}"']);
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

  it("pins the Chromium count's arguments: every spec, the matrix's legs, the shared costs", () => {
    const job = ci.jobs['pr-interaction'];
    const count = step(job, "Count this run's legs");
    expect(count.id).toBe('legs');
    expect(count.if).toBe("steps.scope.outputs.applies == 'true'");
    for (const part of [
      'git -C .test-scope ls-tree -r --name-only HEAD > "$RUNNER_TEMP/interaction-legs/listed.txt"',
      '--listed "$RUNNER_TEMP/interaction-legs/listed.txt" --source .test-scope',
      '--tests-out "$RUNNER_TEMP/interaction-legs/tests.json"',
      '--key interaction-chromium --fallback-key interaction-webkit',
      '--durations "$RUNNER_TEMP/interaction-legs/.github/playwright-leg-durations.json"',
      '--setup-seconds 90 --max-seconds 600',
      '--leg ${{ matrix.leg }} --max-legs 10',
    ])
      expect(count.run).toContain(part);
    // No path filter: the Chromium lane counts every spec.
    expect(count.run).not.toContain(' -- ');
    const at = job.steps.indexOf(count);
    expect(at).toBeGreaterThan(
      job.steps.indexOf(
        step(job, "Keep the leg planner from the workflow's commit"),
      ),
    );
    expect(at).toBeLessThan(
      job.steps.indexOf(step(job, 'Check out the heavy-suite caps')),
    );
    // Both plans cost an unrecorded spec as their counts do, from the
    // counts the count step wrote: the head checkout has replaced the scope
    // checkout by then.
    expect(step(job, "Plan this leg's interaction proofs").run).toContain(
      '--key interaction-chromium --fallback-key interaction-webkit --tests "$RUNNER_TEMP/interaction-legs/tests.json"',
    );
    const webkit = ci.jobs['pr-interaction-webkit'];
    expect(step(webkit, "Count this run's WebKit legs").run).toContain(
      '--tests-out "$RUNNER_TEMP/interaction-legs/tests.json"',
    );
    expect(
      step(webkit, "Plan this leg's WebKit interaction proofs").run,
    ).toContain(
      '--key interaction-webkit --fallback-key interaction-chromium --tests "$RUNNER_TEMP/interaction-legs/tests.json"',
    );
    // The scope checkout is gone by the plan step.
    for (const [id, name] of [
      ['pr-interaction', "Plan this leg's interaction proofs"],
      ['pr-interaction-webkit', "Plan this leg's WebKit interaction proofs"],
    ])
      expect(step(ci.jobs[id], name).run).not.toContain('.test-scope');
  });

  it('splits by the same costs it counts, and stops on a spec it cannot read', () => {
    const times = {'a.spec.ts': 100};
    expect(
      costsFor(['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'd.spec.ts'], times, {
        fallback: {'b.spec.ts': 40},
        testsOf: file => (file === 'c.spec.ts' ? 10 : 0),
        perTest: 1.5,
      }),
    ).toEqual({'a.spec.ts': 100, 'b.spec.ts': 40, 'c.spec.ts': 15});
    const read = testsReader(root);
    expect(read('.github/scripts/playwright-legs.test.mjs')).toBeGreaterThan(5);
    expect(() => read('no/such.spec.ts')).toThrow(
      /cannot read no\/such\.spec\.ts/,
    );
    expect(testsReader(undefined)('anything.spec.ts')).toBe(0);
  });

  it('fits every leg in ten minutes at today’s recorded times, within the matrix', () => {
    // Every interaction spec in the tree, as the count steps list them.
    const specs = execFileSync('git', ['ls-files'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(isInteractionSpec);
    for (const lane of lanes) {
      const times = durations[`interaction-${lane.project}`];
      const fallback = durations[`interaction-${lane.fallback}`];
      const count = step(ci.jobs[lane.id], lane.count);
      const filters =
        lane.project === 'webkit'
          ? ci.jobs[lane.id].env.WEBKIT_SPEC_PATHS.split(' ')
          : [];
      const perTest =
        durations['seconds-per-test'][`interaction-${lane.project}`];
      const testsOf = file =>
        countTests(fs.readFileSync(path.join(root, file), 'utf8'));
      const limits = {
        setupSeconds: 90,
        maxSeconds: 600,
        maxLegs: lane.legs.length,
      };
      expect(count.run, lane.id).toContain(
        '--setup-seconds 90 --max-seconds 600',
      );
      // WebKit also runs every changed spec: a release-wide change, which
      // touches them all, must fit too.
      const changes = lane.project === 'webkit' ? [[], specs] : [[]];
      for (const changed of changes) {
        const label = `${lane.id}, ${changed.length} changed specs`;
        const seconds = estimateSeconds(times, filters, {
          listed: specs,
          changed,
          fallback,
          testsOf,
          perTest,
        });
        // The planner fits the matrix: no more legs than it has, and no leg
        // over ten minutes (plus one spec's slack). It fails naming the
        // heaviest specs, not by a margin under the matrix.
        // Within one leg of the ceiling: a warning in the log, not a failure,
        // so the next step is proposed before the guard trips.
        const near = nearCeilingMessage({seconds, ...limits});
        if (near)
          console.log(`::warning title=Interaction legs near the ceiling::${label}: ${near}`);
        expect(
          legsFitMessage({
            seconds,
            files: specs.filter(
              file =>
                filters.length === 0 ||
                filters.some(each => file.includes(each)) ||
                changed.includes(file),
            ),
            costs: Object.fromEntries(
              specs.map(file => [
                file,
                times[file] ?? fallback[file] ?? testsOf(file) * perTest,
              ]),
            ),
            ...limits,
          }),
          label,
        ).toBeNull();
      }
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

describe('what a WebKit run covers for a change', () => {
  const listed = [
    'packages/core/src/DateInput/DateInput.tsx',
    'packages/core/src/DateInput/__tests__/DateInputWheel.interaction.browser.spec.ts',
    'packages/core/src/DateInput/__tests__/DateInputTouch.interaction.browser.spec.ts',
    'packages/core/src/Switch/__tests__/Switch.interaction.browser.spec.ts',
    'packages/lab/src/RefreshControl/__tests__/RefreshControl.interaction.browser.spec.ts',
    'packages/core/src/utils/__tests__/press.interaction.browser.spec.ts',
    'packages/core/src/gestures/__tests__/browser/gestures.interaction.browser.spec.ts',
  ];
  const shared =
    /^(packages\/core\/src\/gestures\/|\.github\/workflows\/ci\.yml$)/;
  const filters = ['packages/core/src/gestures/'];
  const select = changed => selectProofs({listed, changed, shared, filters});

  it('runs every interaction spec in a component folder whose code changes, in any package', () => {
    expect(select(['packages/core/src/DateInput/DateInput.tsx'])).toEqual([
      'packages/core/src/DateInput/__tests__/DateInputTouch.interaction.browser.spec.ts',
      'packages/core/src/DateInput/__tests__/DateInputWheel.interaction.browser.spec.ts',
    ]);
    expect(
      select(['packages/lab/src/RefreshControl/useRefreshControl.ts']),
    ).toEqual([
      'packages/lab/src/RefreshControl/__tests__/RefreshControl.interaction.browser.spec.ts',
    ]);
  });

  it('runs nothing for files that put no code on a page, or a folder without specs', () => {
    for (const file of [
      'packages/core/src/DateInput/DateInput.test.tsx',
      'packages/core/src/DateInput/__tests__/DateInput.calendar.test.tsx',
      'packages/core/src/DateInput/DateInput.doc.mjs',
      'packages/core/src/DateInput/DateInput.stories.tsx',
      'packages/core/src/DateInput/README.md',
      'packages/core/src/Selector/Selector.tsx',
      // A shared folder is the shared-code pattern's to decide.
      'packages/core/src/utils/focusReturn.ts',
    ]) {
      expect(select([file]), file).toEqual([]);
    }
  });

  it("runs the lane's own paths for shared code, and each spec a change edits", () => {
    expect(select(['packages/core/src/gestures/GestureHost.ts'])).toEqual(
      filters,
    );
    const edited =
      'packages/core/src/Switch/__tests__/Switch.interaction.browser.spec.ts';
    expect(select([edited])).toEqual([edited]);
    expect(
      select([
        '.github/workflows/ci.yml',
        'packages/core/src/DateInput/DateInput.tsx',
      ]),
    ).toEqual([
      ...filters,
      'packages/core/src/DateInput/__tests__/DateInputTouch.interaction.browser.spec.ts',
      'packages/core/src/DateInput/__tests__/DateInputWheel.interaction.browser.spec.ts',
    ]);
  });

  it("runs only the lane's own paths when the changed files are unknown", () => {
    expect(selectProofs({listed, changed: null, shared, filters})).toEqual(
      filters,
    );
  });

  it('lists only interaction specs of the folder', () => {
    expect(
      folderSpecs(listed, ['packages/core/src/DateInput/DateInput.tsx']),
    ).not.toContain('packages/core/src/DateInput/DateInput.tsx');
  });
});
