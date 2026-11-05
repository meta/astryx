// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract for the step that runs browser-gated script tests in CI.
 *
 * The Node test legs run before any browser is installed, so a test that
 * runs only where Chromium is installed skips there. Each such test file
 * needs a ci.yml step that runs it after a Chromium install, under that
 * install's own condition, with the file's browser switch set to '1' so a
 * missing browser fails instead of skipping.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const OFFLINE_MEDIA_TEST = '.github/scripts/lib/offline-media.test.mjs';
const INSTALLS_CHROMIUM = /\bplaywright install(?: --with-deps)? chromium\b/;
// A suite declared at the start of a line, so a fixture string in a test does not count.
const GATED_ON_CHROMIUM = /^describe\.runIf\([^)]*\bchromiumInstalled\b/m;
const BROWSER_SWITCH = /process\.env\.(ASTRYX_[A-Z_]+_BROWSER) === '1'/;

function scriptTests(dir) {
  return fs
    .readdirSync(path.join(root, dir), {withFileTypes: true})
    .flatMap(entry => {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) return scriptTests(rel);
      return entry.name.endsWith('.test.mjs') ? [rel] : [];
    });
}

/** Every step that runs `file`, with its job's steps and its index there. */
function stepsRunning(file) {
  const found = [];
  for (const [jobName, job] of Object.entries(ci.jobs)) {
    (job.steps ?? []).forEach((step, index) => {
      if (typeof step.run === 'string' && step.run.includes(file)) {
        found.push({jobName, steps: job.steps, index, step});
      }
    });
  }
  return found;
}

/** Problems with how ci.yml runs one browser-gated test file. */
function browserStepProblems(file, source) {
  const browserSwitch = BROWSER_SWITCH.exec(source)?.[1];
  if (browserSwitch == null) {
    return [`${file} has no ASTRYX_*_BROWSER switch to require its browser`];
  }
  const runs = stepsRunning(file).filter(
    ({step}) => step.env?.[browserSwitch] === '1',
  );
  if (runs.length === 0) {
    return [`no ci.yml step runs ${file} with ${browserSwitch}=1`];
  }
  const problems = [];
  for (const {jobName, steps, index, step} of runs) {
    const install = steps
      .slice(0, index)
      .findLast(earlier => INSTALLS_CHROMIUM.test(earlier.run ?? ''));
    if (install == null) {
      problems.push(
        `${jobName}: "${step.name}" runs before any Chromium install`,
      );
    } else if (install.if !== step.if) {
      problems.push(
        `${jobName}: "${step.name}" runs under a different condition than "${install.name}"`,
      );
    }
  }
  return problems;
}

describe('browser-gated script tests in ci.yml', () => {
  const gated = scriptTests('.github/scripts').filter(file =>
    GATED_ON_CHROMIUM.test(fs.readFileSync(path.join(root, file), 'utf8')),
  );

  it('finds the offline-media proof among them', () => {
    expect(gated).toContain(OFFLINE_MEDIA_TEST);
  });

  it.each(gated)(
    'runs %s after a Chromium install, under its condition, with its browser switch',
    file => {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(browserStepProblems(file, source)).toEqual([]);
    },
  );

  it('runs the offline-media cases in the Node test job, with the browser required', () => {
    const [run, ...more] = stepsRunning(OFFLINE_MEDIA_TEST);
    expect(more).toEqual([]);
    expect(run.jobName).toBe('test-node');
    expect(run.step.name).toBe('Offline-media browser cases');
    expect(run.step.env).toEqual({ASTRYX_OFFLINE_MEDIA_BROWSER: '1'});
    expect(run.step.run).toBe(
      `pnpm exec vitest run ${OFFLINE_MEDIA_TEST} --maxWorkers=1`,
    );
  });

  it('keeps the full suite, and so the install, for a change to offline-media', () => {
    for (const file of [
      '.github/scripts/lib/offline-media.js',
      OFFLINE_MEDIA_TEST,
    ]) {
      const result = spawnSync(
        'node',
        [path.join(root, '.github/scripts/change-scope.cjs')],
        {input: `M\t${file}\n`, encoding: 'utf8'},
      );
      const scope = JSON.parse(result.stdout);
      expect({file, ...scope}).toMatchObject({
        file,
        docsiteOnly: false,
        specOnly: false,
        toolingOnly: false,
        fullSuite: true,
      });
    }
  });

  describe('the check itself', () => {
    const source =
      "describe.runIf(process.env.ASTRYX_X_BROWSER === '1' || chromiumInstalled)";
    const install = {
      name: 'Install',
      if: 'a',
      run: 'npx playwright install chromium',
    };
    const runStep = (over = {}) => ({
      name: 'Run',
      if: 'a',
      env: {ASTRYX_X_BROWSER: '1'},
      run: 'pnpm exec vitest run x.test.mjs',
      ...over,
    });
    const withJobs = (steps, fn) => {
      const saved = ci.jobs;
      ci.jobs = {job: {steps}};
      try {
        return fn();
      } finally {
        ci.jobs = saved;
      }
    };

    it('accepts a run after the install under the same condition', () => {
      expect(
        withJobs([install, runStep()], () =>
          browserStepProblems('x.test.mjs', source),
        ),
      ).toEqual([]);
    });

    it.each([
      [
        'a run before the install',
        [runStep(), install],
        'runs before any Chromium install',
      ],
      [
        'a different condition',
        [install, runStep({if: 'b'})],
        'different condition',
      ],
      [
        'no browser switch on the step',
        [install, runStep({env: {}})],
        'no ci.yml step runs x.test.mjs',
      ],
      ['no step at all', [install], 'no ci.yml step runs x.test.mjs'],
    ])('flags %s', (_, steps, problem) => {
      expect(
        withJobs(steps, () => browserStepProblems('x.test.mjs', source)).join(
          '\n',
        ),
      ).toContain(problem);
    });

    it('flags a gated file with no browser switch', () => {
      expect(
        browserStepProblems('x.test.mjs', 'describe.runIf(chromiumInstalled)'),
      ).toEqual([
        'x.test.mjs has no ASTRYX_*_BROWSER switch to require its browser',
      ]);
    });
  });
});
