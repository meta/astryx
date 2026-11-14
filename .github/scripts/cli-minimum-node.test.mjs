// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the daily CLI run on its declared minimum Node reads that
 *   version from packages/cli's `engines.node`, runs only on main, and keeps
 *   one issue that a failure opens and a later pass closes.
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';
import yaml from 'yaml';

import {
  ISSUE_TITLE,
  minimumVersion,
  readLegTimes,
  readLegVerdicts,
  refreshRecord,
  reportIssue,
  runVerdict,
  slowFiles,
} from './cli-minimum-node.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.parse(
  fs.readFileSync(
    path.join(root, '.github/workflows/cli-minimum-node.yml'),
    'utf8',
  ),
);

describe('the minimum Node version', () => {
  it('is the lower bound of the range, never .nvmrc', () => {
    expect(minimumVersion('>=22.13.0')).toBe('22.13.0');
    expect(minimumVersion('^22.13.0')).toBe('22.13.0');
    expect(minimumVersion('~20.19')).toBe('20.19.0');
    expect(minimumVersion('22')).toBe('22.0.0');
    expect(minimumVersion('>=22.13.0 <27')).toBe('22.13.0');
    expect(minimumVersion('20.19.0 - 24')).toBe('20.19.0');
  });

  it('takes the lowest alternative, and the highest bound within one', () => {
    expect(minimumVersion('^20.19.0 || >=22.12.0')).toBe('20.19.0');
    expect(minimumVersion('>=22.12.0 || ^20.19.0')).toBe('20.19.0');
    expect(minimumVersion('>=18 >=20.1.0')).toBe('20.1.0');
  });

  it('fails rather than guessing', () => {
    for (const range of [undefined, '', '<24', '>22.0.0', '*nonsense*']) {
      expect(() => minimumVersion(range), String(range)).toThrow();
    }
  });

  it("matches the CLI's own engines.node", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'packages/cli/package.json'), 'utf8'),
    );
    expect(minimumVersion(pkg.engines.node)).toMatch(/^\d+\.\d+\.\d+$/);
    expect(minimumVersion(pkg.engines.node)).not.toBe(
      fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim(),
    );
  });
});

/** The report's issue step, by its name. */
const reportStep = () =>
  workflow.jobs.report.steps.find(
    step => step.name === 'Open, update or close the minimum-Node issue',
  );

describe('the workflow', () => {
  const {jobs} = workflow;
  const nodeSteps = job =>
    job.steps.filter(step =>
      String(step.uses ?? '').startsWith('actions/setup-node'),
    );

  it('runs daily and by hand, on main only, never on pull requests', () => {
    expect(Object.keys(workflow.on).sort()).toEqual([
      'schedule',
      'workflow_dispatch',
    ]);
    expect(workflow.on.schedule).toHaveLength(1);
    expect(jobs.version.if).toBe("github.ref == 'refs/heads/main'");
    expect(jobs.report.if).toContain("github.ref == 'refs/heads/main'");
    expect(workflow.permissions).toEqual({});
  });

  it('reads the version from packages/cli, not .nvmrc', () => {
    const read = jobs.version.steps.find(step => step.id === 'minimum');
    expect(read.run).toContain(
      'cli-minimum-node.mjs minimum --package packages/cli/package.json',
    );
    for (const name of ['cli-tests', 'smoke']) {
      const steps = nodeSteps(jobs[name]);
      expect(steps.at(-1).with['node-version'], name).toBe(
        '${{ needs.version.outputs.node }}',
      );
      expect(steps.at(-1).with['node-version-file'], name).toBeUndefined();
    }
  });

  it("runs the CLI's tests and the global-mode smoke on that version", () => {
    const tests = jobs['cli-tests'].steps.find(step => step.id === 'tests');
    expect(tests.run).toContain('pnpm -F @astryxdesign/cli test');
    expect(
      jobs.smoke.steps.find(step =>
        step.run?.includes('cli-global-mode-smoke.mjs'),
      ).run,
    ).toContain('--packs packs');
  });

  it('reports every outcome but a cancel, and only the report may write issues', () => {
    expect(jobs.report.needs).toEqual([
      'version',
      'cli-tests',
      'pack',
      'smoke',
    ]);
    expect(jobs.report.if).toContain('always() && !cancelled()');
    for (const [name, job] of Object.entries(jobs)) {
      expect(job.permissions.issues, name).toBe(
        name === 'report' ? 'write' : undefined,
      );
    }
    const env = reportStep().env;
    for (const need of ['version', 'pack', 'smoke'])
      expect(env[`${need.toUpperCase()}_RESULT`]).toBe(
        `\${{ needs.${need}.result }}`,
      );
  });

  it('runs the CLI tests in four legs, split by the recorded times, each stopped by name before its limit', () => {
    const cli = jobs['cli-tests'];
    expect(cli.strategy.matrix.shard).toEqual([1, 2, 3, 4]);
    expect(cli.strategy['fail-fast']).toBe(false);
    expect(cli['timeout-minutes']).toBe(30);
    const tests = cli.steps.find(step => step.id === 'tests');
    expect(tests.run).toContain('--shard="$SHARD/4"');
    expect(tests.run).toContain(
      '--reporter=./scripts/vitest-shard-watchdog.mjs',
    );
    expect(tests.run).toContain('VITEST_SHARD_WATCHDOG_SECONDS=$(( 28 * 60');
    expect(tests.run).toContain('set -o pipefail');
  });

  it('keeps each leg’s verdict for the report, which reads all four', () => {
    const cli = jobs['cli-tests'];
    const record = cli.steps.find(
      step => step.name === "Record this leg's verdict",
    );
    expect(record.if).toBe("always() && steps.tests.outcome != 'skipped'");
    expect(record.run).toContain('Node shard stuck');
    const keep = cli.steps.find(
      step => step.name === "Keep this leg's verdict",
    );
    expect(keep.with.name).toBe('cli-tests-verdict-${{ matrix.shard }}');
    const read = jobs.report.steps.find(
      step => step.name === "Read the legs' verdicts",
    );
    expect(read.with.pattern).toBe('cli-tests-verdict-*');
    expect(reportStep().with.script).toContain(
      'readLegVerdicts(process.env.VERDICTS, 4)',
    );
  });

  it('packs the legs by the minimum-Node record, and keeps every run’s times and a refreshed record', () => {
    const cli = jobs['cli-tests'];
    const tests = cli.steps.find(step => step.id === 'tests');
    expect(tests.env.VITEST_DURATIONS_FILE).toBe(
      'scripts/vitest-node-durations.min-node.json',
    );
    expect(tests.env.VITEST_SHARD_TIMES_FILE).toBe(
      '${{ runner.temp }}/min-node-times.json',
    );
    const slow = cli.steps.find(
      step => step.name === 'Name the files past their minimum-Node time',
    );
    expect(slow.run).toContain('cli-minimum-node.mjs slow --times');
    expect(slow['continue-on-error']).toBeUndefined();
    const keepTimes = cli.steps.find(
      step => step.name === "Keep this leg's times",
    );
    expect(keepTimes.with.name).toBe('min-node-times-${{ matrix.shard }}');
    const checkout = jobs.report.steps[0];
    expect(checkout.with['sparse-checkout']).toContain(
      'scripts/vitest-node-durations.min-node.json',
    );
    const keepRecord = jobs.report.steps.at(-1);
    expect(keepRecord.with.name).toBe('min-node-record');
    expect(keepRecord.if).toBe('always()');
    expect(
      fs.existsSync(path.join(root, tests.env.VITEST_DURATIONS_FILE)),
    ).toBe(true);
  });
});

describe('the minimum-Node times', () => {
  it('names a file past 1.5 times its record and more than 10 s over it, and judges no file the record lacks', () => {
    const recorded = {'a.test.mjs': 10, 'b.test.mjs': 30, 'c.test.mjs': 2};
    const times = {
      'a.test.mjs': 30,
      'b.test.mjs': 40,
      'c.test.mjs': 11,
      'new.test.mjs': 90,
    };
    expect(slowFiles(times, recorded)).toEqual([
      {file: 'a.test.mjs', recorded: 10, measured: 30},
    ]);
  });

  it('refreshes the record with this run’s times and keeps every other entry', () => {
    const record = {source: 's', seconds: {'b.test.mjs': 3, 'a.test.mjs': 1}};
    expect(refreshRecord(record, {'b.test.mjs': 4, 'c.test.mjs': 5})).toEqual({
      source: 's',
      seconds: {'a.test.mjs': 1, 'b.test.mjs': 4, 'c.test.mjs': 5},
    });
  });

  it('reads every leg’s times, skipping a file it cannot read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'times-'));
    try {
      // Each artifact downloads into its own folder, under the same file name.
      for (const [leg, text] of [
        [1, '{"a.test.mjs": 1}'],
        [2, '{"b.test.mjs": 2}'],
        [3, 'not json'],
      ]) {
        fs.mkdirSync(path.join(dir, `min-node-times-${leg}`));
        fs.writeFileSync(
          path.join(dir, `min-node-times-${leg}`, 'min-node-times.json'),
          text,
        );
      }
      expect(readLegTimes(dir)).toEqual({'a.test.mjs': 1, 'b.test.mjs': 2});
      expect(readLegTimes(path.join(dir, 'missing'))).toEqual({});
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('the run verdict', () => {
  const parts = (
    legs,
    pack = 'success',
    smoke = 'success',
    version = 'success',
  ) => ({
    version,
    legs,
    pack,
    smoke,
  });

  it('passes only when every leg and both jobs pass', () => {
    expect(runVerdict(parts(['pass', 'pass', 'pass', 'pass']))).toBe('pass');
  });

  it('fails when any leg or job fails, even beside a leg with no verdict', () => {
    expect(runVerdict(parts(['pass', 'fail', 'none', 'pass']))).toBe('fail');
    expect(runVerdict(parts(['pass', 'pass', 'pass', 'pass'], 'failure'))).toBe(
      'fail',
    );
  });

  it('has no verdict when a leg was stopped or cancelled, or a job was cancelled or skipped', () => {
    expect(runVerdict(parts(['pass', 'none', 'pass', 'pass']))).toBe('none');
    expect(
      runVerdict(
        parts(['pass', 'pass', 'pass', 'pass'], 'success', 'cancelled'),
      ),
    ).toBe('none');
    expect(
      runVerdict(
        parts(
          ['pass', 'pass', 'pass', 'pass'],
          'success',
          'success',
          'failure',
        ),
      ),
    ).toBe('none');
  });

  it('reads each leg’s file, and a missing or broken file as no verdict', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdicts-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'leg-1.json'),
        '{"shard": 1, "verdict": "pass"}',
      );
      fs.writeFileSync(
        path.join(dir, 'leg-3.json'),
        '{"shard": 3, "verdict": "fail"}',
      );
      fs.writeFileSync(path.join(dir, 'leg-4.json'), 'not json');
      expect(readLegVerdicts(dir, 4)).toEqual(['pass', 'none', 'fail', 'none']);
      expect(readLegVerdicts(path.join(dir, 'missing'), 2)).toEqual([
        'none',
        'none',
      ]);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

function fakeGithub(openIssues = []) {
  const calls = [];
  return {
    calls,
    rest: {
      search: {
        issuesAndPullRequests: async ({q}) => {
          calls.push(['search', q]);
          return {data: {items: openIssues}};
        },
      },
      issues: {
        create: async args => calls.push(['create', args]),
        createComment: async args => calls.push(['comment', args]),
        update: async args => calls.push(['update', args]),
      },
    },
  };
}
const context = {repo: {owner: 'meta', repo: 'astryx'}};
const ours = {
  number: 7,
  title: ISSUE_TITLE,
  user: {login: 'github-actions[bot]'},
};

describe('the one issue', () => {
  it('a failure opens it, or comments on the open one', async () => {
    const fresh = fakeGithub();
    expect(
      await reportIssue({
        github: fresh,
        context,
        verdict: 'fail',
        version: '22.13.0',
        runUrl: 'u',
      }),
    ).toBe('created');
    expect(fresh.calls.at(-1)[1].title).toBe(ISSUE_TITLE);
    expect(fresh.calls.at(-1)[1].body).toContain('Node 22.13.0');
    const open = fakeGithub([ours]);
    expect(
      await reportIssue({
        github: open,
        context,
        verdict: 'fail',
        version: '22.13.0',
        runUrl: 'u',
      }),
    ).toBe('commented');
  });

  it("a pass closes an issue this job opened, and leaves a person's alone", async () => {
    const open = fakeGithub([ours]);
    expect(
      await reportIssue({
        github: open,
        context,
        verdict: 'pass',
        version: '22.13.0',
        runUrl: 'u',
      }),
    ).toBe('closed');
    expect(open.calls.at(-1)).toEqual([
      'update',
      expect.objectContaining({issue_number: 7, state: 'closed'}),
    ]);
    const persons = fakeGithub([{...ours, user: {login: 'someone'}}]);
    expect(
      await reportIssue({
        github: persons,
        context,
        verdict: 'pass',
        version: '22.13.0',
        runUrl: 'u',
      }),
    ).toBe('none');
    expect(
      await reportIssue({
        github: fakeGithub(),
        context,
        verdict: 'pass',
        version: '22.13.0',
        runUrl: 'u',
      }),
    ).toBe('none');
  });
});

describe('a run with no verdict', () => {
  it('only notes it on the open issue: no close, no claim of failure', async () => {
    const github = fakeGithub([ours]);
    const done = await reportIssue({
      github,
      context,
      verdict: 'none',
      version: '22.13.0',
      runUrl: 'https://example.test/run',
    });
    expect(done).toBe('no verdict noted');
    const writes = github.calls.filter(([kind]) => kind !== 'search');
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('comment');
    expect(writes[0][1].body).toMatch(/^No verdict on Node 22\.13\.0:/);
    expect(writes[0][1].body).not.toMatch(/failed|pass/);
  });

  it('writes nothing when no issue is open', async () => {
    const github = fakeGithub([]);
    expect(
      await reportIssue({
        github,
        context,
        verdict: 'none',
        version: '22.13.0',
        runUrl: 'https://example.test/run',
      }),
    ).toBe('none');
    expect(github.calls.filter(([kind]) => kind !== 'search')).toEqual([]);
  });
});

describe('the report step, run as the workflow runs it', () => {
  const ASYNC_FUNCTION = Object.getPrototypeOf(
    async function () {},
  ).constructor;
  const step = reportStep();
  const dirs = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of dirs.splice(0))
      fs.rmSync(dir, {recursive: true, force: true});
  });

  /** Runs the step's script with these legs' verdict files (null: no file). */
  async function report(legs, openIssues) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdicts-'));
    dirs.push(dir);
    legs.forEach((verdict, i) => {
      if (verdict)
        fs.writeFileSync(
          path.join(dir, `leg-${i + 1}.json`),
          JSON.stringify({shard: i + 1, verdict}),
        );
    });
    // A workspace of its own: the step writes the refreshed record into it.
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-'));
    dirs.push(workspace);
    fs.mkdirSync(path.join(workspace, 'scripts'));
    fs.writeFileSync(
      path.join(workspace, 'scripts/vitest-node-durations.min-node.json'),
      JSON.stringify({seconds: {'slow.test.mjs': 10, 'same.test.mjs': 5}}),
    );
    const times = path.join(workspace, 'times');
    fs.mkdirSync(path.join(times, 'min-node-times-1'), {recursive: true});
    fs.writeFileSync(
      path.join(times, 'min-node-times-1/min-node-times.json'),
      JSON.stringify({'slow.test.mjs': 40, 'same.test.mjs': 5}),
    );
    vi.stubEnv('GITHUB_WORKSPACE', workspace);
    vi.stubEnv('TIMES', times);
    vi.stubEnv('VERDICTS', dir);
    vi.stubEnv('VERSION_RESULT', 'success');
    vi.stubEnv('PACK_RESULT', 'success');
    vi.stubEnv('SMOKE_RESULT', 'success');
    vi.stubEnv('NODE_VERSION', '22.13.0');
    const github = fakeGithub(openIssues);
    const summary = [];
    const core = {
      info: vi.fn(),
      setFailed: vi.fn(),
      summary: {
        addHeading: text => (summary.push(text), core.summary),
        addRaw: text => (summary.push(text), core.summary),
        write: async () => core.summary,
      },
    };
    // A function built from text has no module loader of its own, so the
    // script's dynamic import goes through this module's.
    const script = step.with.script.replaceAll('await import(', 'await load(');
    await new ASYNC_FUNCTION(
      'github',
      'context',
      'core',
      'require',
      'load',
      script,
    )(
      github,
      {...context, serverUrl: 'https://github.com', runId: 1},
      core,
      createRequire(import.meta.url),
      () =>
        import(path.join(root, '.github/scripts/cli-minimum-node.mjs')),
    );
    return {
      summary: summary.join('\n'),
      refreshed: JSON.parse(
        fs.readFileSync(
          path.join(workspace, 'refreshed/vitest-node-durations.min-node.json'),
          'utf8',
        ),
      ),
      writes: github.calls.filter(([kind]) => kind !== 'search'),
      failed: core.setFailed.mock.calls.map(([message]) => message),
    };
  }

  it('a leg cancelled at its limit: notes no verdict, leaves the issue open, and the run stays red', async () => {
    const {writes, failed} = await report(
      ['pass', 'pass', null, 'pass'],
      [ours],
    );
    expect(writes.map(([kind]) => kind)).toEqual(['comment']);
    expect(writes[0][1].body).toMatch(/^No verdict on Node 22\.13\.0:/);
    expect(failed).toEqual([
      'No verdict on Node 22.13.0: a part of the run stopped or was cancelled before it judged anything.',
    ]);
  });

  it('a failed leg: says the CLI failed', async () => {
    const {writes, failed} = await report(
      ['pass', 'fail', 'pass', 'pass'],
      [ours],
    );
    expect(writes.map(([kind]) => kind)).toEqual(['comment']);
    expect(writes[0][1].body).toMatch(/failed on Node 22\.13\.0/);
    expect(failed).toEqual(['The CLI failed on Node 22.13.0.']);
  });

  it('lists the files past their minimum-Node time in the summary, and refreshes the record', async () => {
    const {summary, refreshed} = await report(
      ['pass', 'pass', 'pass', 'pass'],
      [],
    );
    expect(summary).toContain('Files past their minimum-Node time');
    expect(summary).toContain('`slow.test.mjs`: 40 s (recorded 10 s)');
    expect(summary).not.toContain('same.test.mjs');
    expect(refreshed.seconds).toEqual({
      'same.test.mjs': 5,
      'slow.test.mjs': 40,
    });
  });

  it('every leg passes: closes the issue, and the run is green', async () => {
    const {writes, failed} = await report(
      ['pass', 'pass', 'pass', 'pass'],
      [ours],
    );
    expect(writes.map(([kind]) => kind)).toEqual(['comment', 'update']);
    expect(writes[1][1]).toMatchObject({state: 'closed'});
    expect(failed).toEqual([]);
  });
});
