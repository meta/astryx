// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the daily CLI run on its declared minimum Node reads that
 *   version from packages/cli's `engines.node`, runs only on main, and keeps
 *   one issue that a failure opens and a later pass closes.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {
  ISSUE_TITLE,
  minimumVersion,
  readLegVerdicts,
  reportIssue,
  runVerdict,
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
    const env = jobs.report.steps.at(-1).env;
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
    const read = jobs.report.steps.find(step =>
      String(step.uses ?? '').startsWith('actions/download-artifact'),
    );
    expect(read.with.pattern).toBe('cli-tests-verdict-*');
    expect(jobs.report.steps.at(-1).with.script).toContain(
      "readLegVerdicts('verdicts', 4)",
    );
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
