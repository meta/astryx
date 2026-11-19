// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interaction-record-refresh.test.mjs
 * @input interaction-record-refresh.mjs and its workflow.
 * @output The coverage share and its early warning at nine in ten, the
 *   refresh pull request's body, one open pull request at most, and the
 *   workflow's weekly schedule, permissions, run names and recorder calls.
 * @position A Node test beside the script.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {
  BRANCH,
  earlyWarning,
  medianTimes,
  prBody,
  specCoverage,
} from './interaction-record-refresh.mjs';
import {openOrRefresh} from './node-record-refresh.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const workflow = yaml.parse(
  fs.readFileSync(
    path.join(root, '.github/workflows/interaction-record-refresh.yml'),
    'utf8',
  ),
);
const job = workflow.jobs.refresh;
const step = name => job.steps.find(each => each.name === name);

describe('specCoverage and earlyWarning', () => {
  const specs = Array.from({length: 10}, (_, i) => `s${i}.spec.ts`);

  it('warns under nine in ten timed spec files', () => {
    const recorded = Object.fromEntries(specs.slice(0, 8).map(s => [s, 1]));
    const covered = specCoverage(specs, recorded);
    expect(covered).toMatchObject({total: 10, recorded: 8, fresh: false});
    expect(earlyWarning('interaction-chromium', covered)).toContain(
      'times 8 of 10 interaction spec files (80%)',
    );
  });

  it('stays quiet at nine in ten', () => {
    const recorded = Object.fromEntries(specs.slice(0, 9).map(s => [s, 1]));
    expect(earlyWarning('k', specCoverage(specs, recorded))).toBe('');
  });
});

describe('medianTimes', () => {
  it("takes each spec's median over the runs that timed it", () => {
    expect(
      medianTimes([
        {a: 100, b: 10, c: 5},
        {a: 400, b: 12},
        {a: 180, b: 11.04},
      ]),
    ).toEqual({a: 180, b: 11, c: 5});
  });

  it('averages the middle two of an even count', () => {
    expect(medianTimes([{a: 10}, {a: 20}])).toEqual({a: 15});
  });
});

describe('openOrRefresh', () => {
  it('opens the pull request when none is open, on the fixed branch', () => {
    const calls = [];
    const gh = args => (
      calls.push(args),
      args[1] === 'list' ? '[]' : 'https://x/pr/1\n'
    );
    expect(openOrRefresh(gh, {title: 't', body: 'b', branch: BRANCH})).toEqual({
      action: 'created',
      url: 'https://x/pr/1',
    });
    expect(calls[1]).toContain(BRANCH);
  });

  it('edits the open one instead of opening another', () => {
    const calls = [];
    const gh = args => (
      calls.push(args),
      args[1] === 'list' ? '[{"number": 7, "url": "https://x/pr/7"}]' : ''
    );
    expect(
      openOrRefresh(gh, {title: 't', body: 'b', branch: BRANCH}).action,
    ).toBe('refreshed');
    expect(calls.map(args => args[1])).toEqual(['list', 'edit']);
  });
});

describe('prBody', () => {
  it('names each run and coverage line', () => {
    const body = prBody({
      runs: ['https://x/runs/1', 'https://x/runs/2'],
      lines: ['interaction-chromium: 127 of 127 spec files timed (100%)'],
    });
    expect(body).toContain('- https://x/runs/1');
    expect(body).toContain('- https://x/runs/2');
    expect(body).toContain('127 of 127');
    expect(body).toContain(`fixed branch \`${BRANCH}\``);
    expect(body).toContain('median');
    expect(body).toContain('someone with write access reopens it');
  });
});

describe('the workflow', () => {
  it('runs weekly or on demand, on main, one at a time', () => {
    expect(workflow.on.schedule).toHaveLength(1);
    expect(workflow.on.schedule[0].cron.split(' ')[4]).toBe('1');
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(workflow.permissions).toEqual({});
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    expect(job.if).toBe("github.ref == 'refs/heads/main'");
    expect(job.permissions).toEqual({
      actions: 'read',
      contents: 'write',
      'pull-requests': 'write',
    });
  });

  it("records each lane's three latest full runs by ci.yml's run names, then their median", () => {
    const ci = fs.readFileSync(
      path.join(root, '.github/workflows/ci.yml'),
      'utf8',
    );
    expect(ci).toContain("format('Interaction proofs of {0}', github.sha)");
    expect(ci).toContain("format('WebKit weekly of {0}', github.sha)");
    const run = step('Re-record each lane from its latest full runs').run;
    expect(run).toContain('--limit 600');
    expect(run).toContain('[:3][].databaseId');
    expect(run).toContain('perTest: d["seconds-per-test"]?.[key]');
    expect(run).toContain(
      "record_lane chromium interaction-chromium chromium 'Interaction proofs of ' '^pr-interaction \\\\([0-9]+/[0-9]+\\\\)$'",
    );
    expect(run).toContain(
      "record_lane webkit interaction-webkit webkit 'WebKit weekly of ' '^pr-interaction-webkit \\\\([0-9]+/[0-9]+\\\\)$'",
    );
    expect(run).toContain(
      'playwright-legs.mjs" record --key "$key" --project "$project"',
    );
    expect(run).toContain(
      'interaction-record-refresh.mjs median --key "$key" "${times[@]}"',
    );
  });

  it('reports coverage without failing, and never pushes to main', () => {
    const report = step("Report the record's coverage");
    expect(report['continue-on-error']).toBeUndefined();
    expect(report.run).toContain(
      'coverage --key interaction-chromium --key interaction-webkit',
    );
    const push = step(
      'Push the record to the refresh branch and open or refresh its pull request',
    ).run;
    expect(push).toContain(`HEAD:refs/heads/${BRANCH}`);
    expect(push).not.toMatch(/refs\/heads\/main/);
  });
});
