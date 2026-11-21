// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-contract-shard-workflow.test.mjs
 * @input .github/workflows/a11y-contract-shard.yml and the release-check's
 *   a11y-contracts-shard job in .github/workflows/ci.yml
 * @output Proof that the contract leg holding one spec runs at a commit on
 *   main as the release-check runs it, counts the spec's cases, fails by name
 *   when the spec did not run, refuses other inputs, and keeps its results
 * @position Node coverage for the single-leg dispatch used to bisect a
 *   contract failure on CI runners
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => yaml.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const workflow = read('.github/workflows/a11y-contract-shard.yml');
const ci = read('.github/workflows/ci.yml');
const job = workflow.jobs.shard;
const room = workflow.jobs.room;
const step = name =>
  [...room.steps, ...job.steps].find(item => item.name === name);
const releaseLeg = ci.jobs['a11y-contracts-shard'];
const releaseStep = releaseLeg.steps.find(
  item => item.name === 'Run accessibility spec-test contracts',
);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const SPEC = 'MoreMenuAudit.a11y.chromium.spec.ts';

describe('the single contract-leg dispatch', () => {
  it('runs only on a dispatch, with read-only access', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual([
      'expected-head',
      'spec',
      'repeat',
    ]);
    expect(workflow.permissions).toEqual({});
    expect(job.permissions).toEqual({contents: 'read'});
    expect(room.permissions).toEqual({actions: 'read', contents: 'read'});
  });

  it('waits for room under the CI ceiling, yielding to a waiting main check or release re-check', () => {
    expect(job.needs).toEqual(['room']);
    // The inputs are checked before the wait.
    expect(room.steps[0].name).toBe('Check the inputs');
    const wait = step('Wait for room under the CI ceiling');
    expect(wait.uses).toBe('./.ci-admission/.github/actions/ci-admission');
    expect(wait.with).toEqual({
      phase: 'whole',
      peak: 2,
      main: 'false',
      'max-wait-minutes': 120,
      'max-looks': 30,
    });
    // The admission action comes from the dispatched ref (main), not the
    // commit under test.
    expect(step('Check out the admission action').with).toEqual({
      'sparse-checkout':
        '.github/actions/ci-admission\n.github/scripts/lib\nscripts/lib\n',
      path: '.ci-admission',
      'persist-credentials': false,
    });
    // The action turns away only a pull-request run; a dispatch starts after
    // its longest wait, so no step reads `full`.
    expect(JSON.stringify(workflow)).not.toContain('outputs.full');
    // A standard runner: the wait outlasts a slim job's fifteen minutes.
    expect(room['runs-on']).toBe('ubuntu-latest');
  });

  it('never puts an input into a script: each reaches it through the environment', () => {
    for (const item of [...room.steps, ...job.steps].filter(entry => entry.run))
      expect(item.run, item.name).not.toContain('${{');
  });

  it.each([
    ['a'.repeat(40), SPEC, '1', 0],
    [
      '0123456789abcdef0123456789abcdef01234567',
      'Link.a11y.chromium.spec.ts',
      '10',
      0,
    ],
    ['abc123', SPEC, '1', 1],
    ['a'.repeat(40) + '; echo x', SPEC, '1', 1],
    ['a'.repeat(40), 'MoreMenuAudit.ts', '1', 1],
    ['a'.repeat(40), '../x.spec.ts', '1', 1],
    ['a'.repeat(40), `${SPEC}; echo x`, '1', 1],
    ['a'.repeat(40), SPEC, '11', 1],
    ['a'.repeat(40), SPEC, '-1', 1],
  ])(
    'checks the inputs (expected-head=%s, spec=%s, repeat=%s → exit %i)',
    (sha, spec, repeat, status) => {
      const result = spawnSync('bash', ['-c', step('Check the inputs').run], {
        encoding: 'utf8',
        env: {...process.env, SHA: sha, SPEC: spec, REPEAT: repeat},
      });
      expect(result.status, result.stdout + result.stderr).toBe(status);
    },
  );

  it('checks out the commit itself and refuses one that is not on main', () => {
    const checkout = step('Checkout');
    expect(checkout.uses).toMatch(/^actions\/checkout@/);
    expect(checkout.with).toMatchObject({
      ref: '${{ inputs.expected-head }}',
      'fetch-depth': 0,
      'persist-credentials': false,
    });
    const onMain = step('Require a commit on main');
    expect(onMain.run).toContain('test "$(git rev-parse HEAD)" = "$SHA"');
    expect(onMain.run).toContain(
      'git merge-base --is-ancestor "$SHA" origin/main',
    );
  });

  it('runs the leg as the release-check does, on a free runner of the same size', () => {
    const run = step('Run accessibility spec-test contracts');
    // ubuntu-latest has the four vCPUs and 16 GB of the release pool's
    // 4-core-ubuntu (ci-free-runners.test.mjs).
    expect(job['runs-on']).toBe('ubuntu-latest');
    expect(releaseLeg['runs-on']).toContain("'4-core-ubuntu'");
    expect(step('Find the leg that holds the spec').run).toContain(
      'node .github/scripts/a11y-contract-shard.mjs --shard "$leg/6" > "leg-$leg.txt"',
    );
    expect(releaseStep.run).toContain(
      'node .github/scripts/a11y-contract-shard.mjs --shard "${{ matrix.shard }}/${{ strategy.job-total }}" > contract-tests.txt',
    );
    expect(releaseLeg.strategy.matrix.shard).toEqual([1, 2, 3, 4, 5, 6]);
    const release =
      'pnpm exec playwright test --test-list contract-tests.txt --config playwright.config.ts --project chromium';
    expect(releaseStep.run).toContain(release);
    // One pass after another, each with its own output: a component audit
    // writes one evidence folder that passes running together would share.
    expect(run.run).not.toContain('--repeat-each');
    expect(run.run).toContain('for pass in $(seq 1 "$REPEAT"); do');
    expect(run.run).toContain(
      `${release} --output "test-results/pass-$pass" --reporter=list,github,json || status=1`,
    );
    expect(run.run).toContain(
      'PLAYWRIGHT_JSON_OUTPUT_FILE="$PWD/pass-results/pass-$pass.json"',
    );
    expect(run.run).toContain('mv "$folder" "audit-evidence/pass-$pass/"');
    // Audits write evidence at the root or in their own folder under
    // test-results/ (pressed-state-evidence, markdown-table-narrow, …); every
    // folder but the passes' outputs moves.
    expect(run.run).toContain(
      'for folder in *-audit-evidence test-results/*; do',
    );
    expect(run.run).toContain(
      'case "$folder" in test-results/pass-*) continue ;; esac',
    );
    expect(run.run).toMatch(/exit "\$status"\s*$/);
    // The audits refuse a build without the source stamp ci.yml writes.
    const stamp = step('Stamp Storybook source revision');
    expect(stamp.run).toBe(
      'git rev-parse HEAD > apps/storybook/dist/astryx-build-sha.txt',
    );
    expect(job.steps.indexOf(stamp)).toBe(
      job.steps.indexOf(step('Build packages and Storybook')) + 1,
    );
    const ciStamp = ci.jobs['build-storybook'].steps.find(
      item => item.name === 'Stamp Storybook source revision',
    );
    expect(ciStamp.run).toBe(stamp.run);
    expect(run.env.A11Y_CONTRACT_WORKERS).toBe(
      releaseStep.env.A11Y_CONTRACT_WORKERS,
    );
    expect(run.env.ASTRYX_HEAD_SHA).toBe('${{ inputs.expected-head }}');
    // The Table timing receipt reports without gating, as off the release
    // runner path.
    expect(run.env.ASTRYX_TABLE_TIMING_GATE).toBe('0');
    expect(step('Build packages and Storybook').run).toBe(
      'node .github/scripts/build-packages-and-storybook.mjs',
    );
  });

  it("moves every evidence folder of a pass, at the root or under test-results/, but not the passes' outputs", () => {
    const run = step('Run accessibility spec-test contracts').run;
    const loop = run.slice(
      run.indexOf('for folder in'),
      run.indexOf('done', run.indexOf('for folder in')) + 'done'.length,
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-move-'));
    try {
      for (const folder of [
        'more-menu-audit-evidence',
        'test-results/pressed-state-evidence',
        'test-results/markdown-table-narrow',
        'test-results/drawer-audit-evidence',
        'test-results/pass-1',
      ])
        fs.mkdirSync(path.join(dir, folder), {recursive: true});
      fs.writeFileSync(path.join(dir, 'test-results/.last-run.json'), '{}');
      const result = spawnSync('bash', ['-c', `pass=1\n${loop}`], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      expect(
        fs.readdirSync(path.join(dir, 'audit-evidence/pass-1')).sort(),
      ).toEqual([
        'drawer-audit-evidence',
        'markdown-table-narrow',
        'more-menu-audit-evidence',
        'pressed-state-evidence',
      ]);
      expect(fs.readdirSync(path.join(dir, 'test-results')).sort()).toEqual([
        '.last-run.json',
        'pass-1',
      ]);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('gives the leg time for its repeats, with no arithmetic, which expressions lack', () => {
    const limit = job['timeout-minutes'];
    expect(limit).not.toMatch(/[+*/]|\s-\s/);
    // Evaluated as Actions would: && and || return an operand.
    const minutes = repeat =>
      new Function(
        'inputs',
        'fromJSON',
        `return ${limit.replace(/^\$\{\{\s*|\s*\}\}$/g, '')};`,
      )({repeat: String(repeat)}, JSON.parse);
    // About 20 minutes of install and build, then about 13 a pass.
    for (let repeat = 1; repeat <= 10; repeat += 1)
      expect(minutes(repeat), `repeat ${repeat}`).toBeGreaterThanOrEqual(
        20 + 13 * repeat,
      );
    expect(minutes(10)).toBeLessThanOrEqual(360);
  });

  /** Runs the leg-finding step with a fake `node` that lists each leg. */
  function findLegs(legs) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-legs-'));
    try {
      const bin = path.join(dir, 'bin');
      fs.mkdirSync(bin);
      fs.writeFileSync(
        path.join(bin, 'node'),
        `#!/bin/bash\nleg=\${3%%/*}\ncase "$leg" in\n${Object.entries(legs)
          .map(
            ([leg, lines]) =>
              `  ${leg}) printf '%s\\n' ${lines.map(line => `'${line}'`).join(' ')};;`,
          )
          .join(
            '\n',
          )}\n  *) printf 'packages/core/src/Other/__tests__/Other.a11y.chromium.spec.ts\\n';;\nesac\n`,
        {mode: 0o755},
      );
      const output = path.join(dir, 'output');
      const result = spawnSync(
        'bash',
        ['-c', step('Find the leg that holds the spec').run],
        {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            SPEC,
            SHA: 'a'.repeat(40),
            GITHUB_OUTPUT: output,
          },
        },
      );
      const read = file =>
        fs.existsSync(path.join(dir, file))
          ? fs.readFileSync(path.join(dir, file), 'utf8')
          : '';
      return {
        status: result.status,
        log: result.stdout + result.stderr,
        list: read('contract-tests.txt'),
        output: read('output'),
      };
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }

  const more = `packages/core/src/MoreMenu/__tests__/${SPEC}`;

  it("finds the spec's leg in the commit's own split, not by a fixed number", () => {
    const one = findLegs({
      5: [more, 'packages/core/src/Link/__tests__/Link.a11y.chromium.spec.ts'],
    });
    expect(one.status, one.log).toBe(0);
    expect(one.list).toBe(
      `${more}\npackages/core/src/Link/__tests__/Link.a11y.chromium.spec.ts\n`,
    );
    expect(one.output).toBe('legs=5\n');
    // A spec cut across two legs runs with both.
    const cut = findLegs({
      3: [
        `${more}:10`,
        'packages/core/src/A/__tests__/A.a11y.chromium.spec.ts',
      ],
      4: [`${more}:746`],
    });
    expect(cut.output).toBe('legs=3 4\n');
    expect(cut.list.split('\n').filter(Boolean)).toHaveLength(3);
  });

  it('fails by name when no leg lists the spec', () => {
    const none = findLegs({});
    expect(none.status).toBe(1);
    expect(none.log).toContain(
      `::error::${SPEC} did not run: no contract leg lists it at ${'a'.repeat(40)}.`,
    );
  });

  /** Runs the count step over pass reports; returns its log and failure. */
  async function count(reports) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-count-'));
    const cwd = process.cwd();
    try {
      if (reports) {
        fs.mkdirSync(path.join(dir, 'pass-results'));
        reports.forEach((report, i) =>
          fs.writeFileSync(
            path.join(dir, 'pass-results', `pass-${i + 1}.json`),
            JSON.stringify(report),
          ),
        );
      }
      process.chdir(dir);
      process.env.SPEC = SPEC;
      const info = [];
      let failed = null;
      const summary = {
        addHeading: () => summary,
        addList: () => summary,
        write: async () => {},
      };
      process.env.REPORT_READER = path.join(
        root,
        '.github/scripts/webkit-a11y-report.mjs',
      );
      await new AsyncFunction(
        'core',
        'require',
        'importModule',
        step("Count the spec's cases").with.script.replaceAll(
          'await import(',
          'await importModule(',
        ),
      )(
        {
          info: line => info.push(line),
          setFailed: message => (failed = message),
          summary,
        },
        createRequire(import.meta.url),
        specifier => import(specifier),
      );
      return {info, failed};
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }
  /** A Playwright JSON report with one spec's cases, by status. */
  const report = cases => ({
    suites: [
      {
        title: SPEC,
        file: `packages/core/src/MoreMenu/__tests__/${SPEC}`,
        suites: [
          {
            title: 'audit',
            specs: Object.entries(cases).map(([title, status]) => ({
              title,
              file: `packages/core/src/MoreMenu/__tests__/${SPEC}`,
              tests: [
                {
                  status,
                  results:
                    status === 'skipped'
                      ? []
                      : [
                          {
                            status:
                              status === 'unexpected' ? 'failed' : 'passed',
                          },
                        ],
                },
              ],
            })),
          },
        ],
      },
      {
        title: 'Link.a11y.chromium.spec.ts',
        specs: [
          {
            title: 'other',
            file: 'packages/core/src/Link/__tests__/Link.a11y.chromium.spec.ts',
            tests: [{status: 'unexpected', results: [{status: 'failed'}]}],
          },
        ],
      },
    ],
  });

  it("counts each case of the spec over the passes, and only the spec's", async () => {
    const step3 = await count([
      report({default: 'expected', sheet: 'unexpected'}),
      report({default: 'expected', sheet: 'expected'}),
      report({default: 'flaky', sheet: 'skipped'}),
    ]);
    expect(step3.failed).toBeNull();
    // Keyed by title path, as the shared report reader names a test.
    expect(step3.info).toEqual([
      `${SPEC} › audit › default: passed 3, failed 0, skipped 0`,
      `${SPEC} › audit › sheet: passed 1, failed 1, skipped 1`,
    ]);
    const reader = step('Check out the report reader');
    expect(reader.with).toEqual({
      ref: '${{ github.sha }}',
      'sparse-checkout': '.github/scripts',
      path: '.report-reader',
      'persist-credentials': false,
    });
  });

  it('fails by name when the spec ran zero times: every case skipped, or no report', async () => {
    const skipped = await count([
      report({default: 'skipped', sheet: 'skipped'}),
    ]);
    expect(skipped.failed).toBe(
      `${SPEC} did not run: every case was skipped or absent in 1 passes.`,
    );
    const absent = await count([report({})]);
    expect(absent.failed).toContain(`${SPEC} did not run`);
    const none = await count(null);
    expect(none.failed).toBe(
      `${SPEC} did not run: no pass wrote a report in 0 passes.`,
    );
    expect(step("Count the spec's cases").if).toBe(
      "always() && steps.contracts.outcome != 'skipped'",
    );
  });

  it("keeps the leg's Playwright results, passing or failing", () => {
    const keep = step("Keep the leg's Playwright results");
    expect(keep.if).toBe("always() && steps.contracts.outcome != 'skipped'");
    expect(keep.uses).toMatch(/^actions\/upload-artifact@/);
    expect(keep.with).toEqual({
      name: 'a11y-contract-shard-results-${{ inputs.expected-head }}-${{ inputs.spec }}-${{ github.run_attempt }}',
      path: 'test-results/\naudit-evidence/\npass-results/\ncontract-tests.txt\n',
      'retention-days': 14,
      'if-no-files-found': 'ignore',
    });
  });
});
