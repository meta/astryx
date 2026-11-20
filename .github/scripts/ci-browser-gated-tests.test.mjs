// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract for the steps that run browser-gated script tests in CI.
 *
 * Test runs that install no browser skip a test whose browser cases run only
 * behind a switch (`ASTRYX_<NAME>_BROWSER=1`) or only where Chromium is
 * installed. Each such test file under .github/scripts needs a workflow step
 * that runs it after a Chromium install in the same job, under that install's
 * condition or a narrower one that adds to it, with the file's switch set to
 * '1' so a missing browser fails instead of skipping.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const WORKFLOWS = Object.fromEntries(
  fs
    .readdirSync(path.join(root, '.github/workflows'))
    .filter(name => /\.ya?ml$/.test(name))
    .map(name => [
      name,
      yaml.parse(
        fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'),
      ),
    ]),
);
const OFFLINE_MEDIA_TEST = '.github/scripts/lib/offline-media.test.mjs';
const CDN_BROWSER_TEST = '.github/scripts/lib/cdn-page-render.browser.test.mjs';
const RTL_D7_TEST = '.github/scripts/rtl-audit-coarse-hit.browser.test.mjs';
const THEME_REAL_BASES_TEST =
  'packages/cli/api/theme-edit/theme-real-bases.test.mjs';
const INSTALLS_CHROMIUM = /\bplaywright install(?: --with-deps)? chromium\b/;
const BROWSER_SWITCH = /process\.env\.(ASTRYX_[A-Z_]+_BROWSER) === '1'/;
// A suite declared at the start of a line, so a fixture string in a test
// does not count.
const RUN_IF_SUITE = /^describe\.runIf\(/m;

/** Whether a test file's browser cases run only behind a switch or an installed Chromium. */
function browserGated(source) {
  return (
    RUN_IF_SUITE.test(source) &&
    (BROWSER_SWITCH.test(source) || /\bchromiumInstalled\b/.test(source))
  );
}

function scriptTests(dir) {
  return fs
    .readdirSync(path.join(root, dir), {withFileTypes: true})
    .flatMap(entry => {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) return scriptTests(rel);
      return entry.name.endsWith('.test.mjs') ? [rel] : [];
    });
}

/** Every step that runs `file`, with its workflow, job, the job's steps and its index. */
function stepsRunning(file, workflows) {
  const found = [];
  for (const [workflow, parsed] of Object.entries(workflows)) {
    for (const [jobName, job] of Object.entries(parsed?.jobs ?? {})) {
      (job.steps ?? []).forEach((step, index) => {
        if (typeof step.run === 'string' && step.run.includes(file)) {
          found.push({workflow, jobName, steps: job.steps, index, step});
        }
      });
    }
  }
  return found;
}

/** Whether one pair of parentheses wraps the whole expression. */
function wrapped(expression) {
  if (!expression.startsWith('(') || !expression.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === '(') depth++;
    else if (expression[i] === ')') depth--;
    if (depth === 0 && i < expression.length - 1) return false;
  }
  return depth === 0;
}

/**
 * The install's condition, or a narrower one that ANDs a parenthesised part
 * onto it. Unparenthesised, `X || Y && <install>` reads as `X || (Y && ...)`,
 * which runs without the install whenever X holds.
 */
function sameOrNarrower(stepIf, installIf) {
  if (installIf == null) return true;
  if (stepIf === installIf) return true;
  if (typeof stepIf !== 'string') return false;
  const safeInstall = wrapped(installIf) || !installIf.includes('||');
  const tail = ` && ${installIf}`;
  const head = `${installIf} && `;
  if (stepIf.endsWith(tail)) {
    return safeInstall && wrapped(stepIf.slice(0, -tail.length));
  }
  if (stepIf.startsWith(head)) {
    return safeInstall && wrapped(stepIf.slice(head.length));
  }
  return false;
}

/** Problems with how the workflows run one browser-gated test file. */
function browserStepProblems(file, source, workflows) {
  const browserSwitch = BROWSER_SWITCH.exec(source)?.[1];
  if (browserSwitch == null) {
    return [`${file} has no ASTRYX_*_BROWSER switch to require its browser`];
  }
  const runs = stepsRunning(file, workflows).filter(
    ({step}) => step.env?.[browserSwitch] === '1',
  );
  if (runs.length === 0) {
    return [`no workflow step runs ${file} with ${browserSwitch}=1`];
  }
  const problems = [];
  for (const {workflow, jobName, steps, index, step} of runs) {
    const where = `${workflow} ${jobName}: "${step.name}"`;
    const install = steps
      .slice(0, index)
      .findLast(earlier => INSTALLS_CHROMIUM.test(earlier.run ?? ''));
    if (install == null) {
      problems.push(`${where} runs before any Chromium install`);
    } else if (!sameOrNarrower(step.if, install.if)) {
      problems.push(
        `${where} runs under a condition that is not "${install.name}"'s or narrower`,
      );
    }
  }
  return problems;
}

describe('browser-gated script tests in the workflows', () => {
  const gated = scriptTests('.github/scripts').filter(file =>
    browserGated(fs.readFileSync(path.join(root, file), 'utf8')),
  );

  it('finds every browser-gated script test', () => {
    expect(gated).toEqual(
      expect.arrayContaining([
        OFFLINE_MEDIA_TEST,
        CDN_BROWSER_TEST,
        RTL_D7_TEST,
      ]),
    );
  });

  it.each(gated)(
    'runs %s after a Chromium install, under its condition, with its browser switch',
    file => {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(browserStepProblems(file, source, WORKFLOWS)).toEqual([]);
    },
  );

  it('runs the offline-media cases in the Node browser contracts job, with the browser required', () => {
    const [run, ...more] = stepsRunning(OFFLINE_MEDIA_TEST, WORKFLOWS);
    expect(more).toEqual([]);
    expect([run.workflow, run.jobName]).toEqual([
      'ci.yml',
      'node-browser-contracts',
    ]);
    expect(run.step.name).toBe('Offline-media browser cases');
    expect(run.step.env).toEqual({ASTRYX_OFFLINE_MEDIA_BROWSER: '1'});
    expect(run.step.run).toBe(
      `pnpm exec vitest run ${OFFLINE_MEDIA_TEST} --maxWorkers=1`,
    );
  });

  it("runs theme-real-bases' text-direction render case in the Node browser contracts job, after the browser install, with the browser required", () => {
    const source = fs.readFileSync(
      path.join(root, THEME_REAL_BASES_TEST),
      'utf8',
    );
    // It renders in the Chromium Playwright pins, never a system browser.
    expect(source).toContain("createRequire(import.meta.url)('playwright')");
    expect(source).not.toMatch(/chromium-browser|google-chrome|--dump-dom/);
    expect(
      browserStepProblems(THEME_REAL_BASES_TEST, source, WORKFLOWS),
    ).toEqual([]);
    const [run, ...more] = stepsRunning(THEME_REAL_BASES_TEST, WORKFLOWS);
    expect(more).toEqual([]);
    expect(run.jobName).toBe('node-browser-contracts');
    expect(run.step.env).toEqual({ASTRYX_THEME_EDITOR_BROWSER: '1'});
    expect(run.step.run).toContain(
      "-t 'renders own and editor sides|names what it waited on'",
    );
    // The case cannot vanish from both runs: the Node legs skip it by name
    // (it.runIf on the switch), and this step, with the switch set, runs it.
    expect(source).toContain(
      "const BROWSER_STEP = process.env.ASTRYX_THEME_EDITOR_BROWSER === '1';",
    );
    expect(source).toMatch(
      /it\.runIf\(BROWSER_STEP\)\(\s*'renders own and editor sides in each text direction \(butter\)'/,
    );
    expect(source).not.toContain('the render check did not run');
  });

  it('runs the CDN page render cases in the CLI smoke test, beside the CDN smoke test', () => {
    const [run, ...more] = stepsRunning(CDN_BROWSER_TEST, WORKFLOWS);
    expect(more).toEqual([]);
    expect([run.workflow, run.jobName]).toEqual([
      'cli-smoke-test.yml',
      'smoke-test',
    ]);
    expect(run.step.env).toEqual({ASTRYX_CDN_SMOKE_BROWSER: '1'});
    expect(run.step.run).toBe(
      `pnpm exec vitest run --config .github/scripts/vitest.browser-scripts.config.mjs ${CDN_BROWSER_TEST} --maxWorkers=1`,
    );
    // The workflow starts for a change to the page renderer, its tests or
    // the config the step runs (spec:AST-030 FR14).
    const paths = WORKFLOWS['cli-smoke-test.yml'].on.pull_request.paths;
    expect(paths).toContain('.github/scripts/lib/cdn-*.mjs');
    expect(paths).toContain(
      '.github/scripts/vitest.browser-scripts.config.mjs',
    );
  });

  it('runs the CDN file under a config with no global setup, which still finds it', async () => {
    const {default: config} =
      await import('./vitest.browser-scripts.config.mjs');
    expect(config.test.globalSetup).toBeUndefined();
    expect(config.test.projects).toBeUndefined();
    expect(
      config.test.include.some(glob =>
        path.matchesGlob(CDN_BROWSER_TEST, glob),
      ),
    ).toBe(true);
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
      expect({file, ...JSON.parse(result.stdout)}).toMatchObject({
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
    const check = steps =>
      browserStepProblems('x.test.mjs', source, {
        'w.yml': {jobs: {job: {steps}}},
      });

    it('accepts a run after the install under the same condition, or a narrower one', () => {
      expect(check([install, runStep()])).toEqual([]);
      expect(check([install, runStep({if: '(b) && a'})])).toEqual([]);
    });

    it.each([
      [
        'a run before the install',
        [runStep(), install],
        'runs before any Chromium install',
      ],
      ['a different condition', [install, runStep({if: 'b'})], 'not "Install"'],
      [
        'a wider condition',
        [install, runStep({if: 'a || b'})],
        'not "Install"',
      ],
      [
        'an unparenthesised narrower part',
        [install, runStep({if: 'x || y && a'})],
        'not "Install"',
      ],
      [
        'no browser switch on the step',
        [install, runStep({env: {}})],
        'no workflow step runs x.test.mjs',
      ],
      ['no step at all', [install], 'no workflow step runs x.test.mjs'],
    ])('flags %s', (_, steps, problem) => {
      expect(check(steps).join('\n')).toContain(problem);
    });

    it('flags a gated file with no browser switch', () => {
      expect(
        browserStepProblems(
          'x.test.mjs',
          'describe.runIf(chromiumInstalled)',
          {},
        ),
      ).toEqual([
        'x.test.mjs has no ASTRYX_*_BROWSER switch to require its browser',
      ]);
    });

    it('counts a suite gated on a switch or on an installed Chromium, not a fixture string', () => {
      expect(
        browserGated("describe.runIf(process.env.ASTRYX_Y_BROWSER === '1')("),
      ).toBe(true);
      expect(
        browserGated('const ok = chromiumInstalled;\ndescribe.runIf(ok)('),
      ).toBe(true);
      expect(
        browserGated(
          'const s = "describe.runIf(process.env.ASTRYX_Y_BROWSER === \'1\')";',
        ),
      ).toBe(false);
      expect(browserGated("describe('x', () => {});")).toBe(false);
    });
  });
});
