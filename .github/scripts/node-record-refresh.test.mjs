// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The scheduled Node record refresh: its workflow shape, the coverage
 * check, regenerating the record from a run's logs, and the one pull request.
 * Also proves that no pull-request check fails on an unrecorded test file.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {
  BRANCH,
  MIN_RECORDED_SHARE,
  TITLE,
  coverage,
  openOrRefresh,
  prBody,
} from './node-record-refresh.mjs';
import {main as driftMain} from './node-time-drift.mjs';
import {nodeLegFiles} from '../../scripts/vitest-node-legs.mjs';
import {partitionByDuration} from '../../scripts/vitest-shard-sequencer.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const workflowFile = path.join(
  ROOT,
  '.github/workflows/node-record-refresh.yml',
);
const workflow = yaml.parse(fs.readFileSync(workflowFile, 'utf8'));
const job = workflow.jobs.refresh;
const step = name => job.steps.find(each => each.name === name);
const nodeFiles = nodeLegFiles();

describe('the Node record refresh workflow', () => {
  it('runs on a schedule and by hand, never on a pull request or push', () => {
    expect(Object.keys(workflow.on).sort()).toEqual([
      'schedule',
      'workflow_dispatch',
    ]);
    expect(workflow.on.schedule).toEqual([{cron: '41 */6 * * *'}]);
    expect(job.if).toBe("github.ref == 'refs/heads/main'");
    expect(workflow.concurrency).toEqual({
      group: 'node-record-refresh',
      'cancel-in-progress': false,
    });
  });

  it('grants write access to its one job only, and only for contents and pull requests', () => {
    expect(workflow.permissions).toEqual({});
    expect(Object.keys(workflow.jobs)).toEqual(['refresh']);
    expect(job.permissions).toEqual({
      actions: 'read',
      contents: 'write',
      'pull-requests': 'write',
    });
  });

  it('writes the record only after the check finds it below the bar', () => {
    const regenerate = step(
      "Regenerate the record from main's latest full unit run",
    );
    expect(regenerate.if).toBe("steps.check.outputs.fresh == 'false'");
    expect(regenerate.run).toContain(
      '--workflow deploy.yml --branch main --event workflow_dispatch --status success --limit 1',
    );
    expect(regenerate.run).toContain(
      'node scripts/vitest-shard-sequencer.mjs record "$RUNNER_TEMP/main-run.log"',
    );
  });

  it('force-pushes to the one fixed branch, never to main, as the Actions bot', () => {
    const publish = step(
      'Push the record to the refresh branch and open or refresh its pull request',
    );
    expect(publish.if).toBe("steps.record.outputs.changed == 'true'");
    const pushes = publish.run
      .split('\n')
      .filter(line => line.includes('git push'))
      .map(line => line.trim());
    expect(pushes).toEqual([
      `git push --force origin HEAD:refs/heads/${BRANCH}`,
    ]);
    expect(publish.run).toContain("user.name='github-actions[bot]'");
    // A branch that already carries the record is not pushed again.
    expect(publish.run).toMatch(
      /git fetch --quiet origin refs\/heads\/ci\/node-durations-refresh &&\s+git diff --quiet FETCH_HEAD -- scripts\/vitest-node-durations\.json; then[\s\S]*else[\s\S]*git push --force[\s\S]*fi/,
    );
    expect(publish.run).toContain('git add scripts/vitest-node-durations.json');
    expect(publish.run).toContain(
      'node .github/scripts/node-record-refresh.mjs pr',
    );
    // Only the script opens a pull request, and it reuses the open one.
    expect(fs.readFileSync(workflowFile, 'utf8')).not.toContain('gh pr create');
  });
});

describe('the coverage check', () => {
  it('keeps nine in ten as the bar', () => {
    expect(MIN_RECORDED_SHARE).toBe(0.9);
  });

  it('is fresh at exactly nine in ten, and stale below it', () => {
    const files = Array.from({length: 10}, (_, i) => `f${i}.test.mjs`);
    const nine = Object.fromEntries(files.slice(0, 9).map(file => [file, 1]));
    expect(coverage(files, nine)).toMatchObject({
      total: 10,
      recorded: 9,
      fresh: true,
      missing: ['f9.test.mjs'],
    });
    const eight = Object.fromEntries(files.slice(0, 8).map(file => [file, 1]));
    expect(coverage(files, eight)).toMatchObject({recorded: 8, fresh: false});
  });

  it('counts a file recorded at 0 s as recorded', () => {
    expect(coverage(['a.test.mjs'], {'a.test.mjs': 0}).fresh).toBe(true);
  });
});

describe('regenerating the record from a run log', () => {
  it("records the Node legs' files from a Main run log and lifts the share over the bar", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-record-refresh-'));
    try {
      const record = path.join(dir, 'durations.json');
      // A stale record: one Node file in five.
      const kept = nodeFiles.filter((_, i) => i % 5 === 0);
      fs.writeFileSync(
        record,
        JSON.stringify({
          $comment: 'kept',
          seconds: Object.fromEntries(kept.map(file => [file, 1])),
        }),
      );
      expect(
        coverage(nodeFiles, JSON.parse(fs.readFileSync(record, 'utf8')).seconds)
          .fresh,
      ).toBe(false);
      const legLine = (file, i) =>
        `test-node (${(i % 6) + 1})\tRun pnpm test:node --shard=${(i % 6) + 1}/6\t2026-01-01T00:00:00.0000000Z  ^[[32m✓^[[39m ^[[30m^[[43m node ^[[49m^[[39m ${file} ^[[2m(^[[22m^[[2m3 tests^[[22m^[[2m)^[[22m^[[33m 2.5s^[[39m`;
      const log = [
        ...nodeFiles.map(legLine),
        // The build job's own Node tests book no leg time.
        `build\tRun tests\t2026-01-01T00:00:00.0000000Z  ✓  node  ${nodeFiles[1]} (3 tests) 99.0s`,
      ].join('\n');
      const logFile = path.join(dir, 'main-run.log');
      fs.writeFileSync(logFile, log);
      execFileSync(
        process.execPath,
        ['scripts/vitest-shard-sequencer.mjs', 'record', logFile],
        {
          cwd: ROOT,
          env: {...process.env, VITEST_DURATIONS_FILE: record},
          stdio: 'pipe',
        },
      );
      const after = JSON.parse(fs.readFileSync(record, 'utf8'));
      expect(after.$comment).toBe('kept');
      expect(after.seconds[nodeFiles[1]]).toBe(2.5);
      expect(coverage(nodeFiles, after.seconds)).toMatchObject({
        fresh: true,
        missing: [],
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('the one refresh pull request', () => {
  /** A fake `gh` over a list of open pull requests on BRANCH. */
  function fakeGh(open) {
    const calls = [];
    const gh = args => {
      calls.push(args);
      if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(open);
      if (args[0] === 'pr' && args[1] === 'create') {
        const url = `https://example.test/pull/${open.length + 1}`;
        open.push({number: open.length + 1, url});
        return `${url}\n`;
      }
      return '';
    };
    return {gh, calls};
  }
  const body = prBody({
    before: 0.8,
    after: coverage(['a.test.mjs'], {'a.test.mjs': 1}),
    runUrl: 'https://example.test/run/1',
  });

  it('opens one when none is open, from the fixed branch', () => {
    const {gh, calls} = fakeGh([]);
    expect(openOrRefresh(gh, {title: TITLE, body})).toEqual({
      action: 'created',
      url: 'https://example.test/pull/1',
    });
    expect(calls[0]).toEqual(expect.arrayContaining(['--head', BRANCH]));
    expect(calls[1]).toEqual(
      expect.arrayContaining(['create', '--head', BRANCH, '--base', 'main']),
    );
  });

  it('edits the open one and never opens a second, however often it runs', () => {
    const open = [];
    const {gh, calls} = fakeGh(open);
    for (let tick = 0; tick < 3; tick++)
      openOrRefresh(gh, {title: TITLE, body});
    expect(open).toHaveLength(1);
    expect(calls.filter(args => args[1] === 'create')).toHaveLength(1);
    expect(calls.filter(args => args[1] === 'edit')).toHaveLength(2);
  });

  it('describes a durations-only change with the shares before and after', () => {
    expect(body).toContain('80%');
    expect(body).toContain('1 of 1 recorded (100%)');
    expect(body).toContain('Durations only.');
    expect(body).toContain('- CI impact (for a change to workflows');
  });
});

describe('pull requests never fail on a missing recorded time', () => {
  it('runs every Node file in exactly one leg with no record at all', () => {
    const legs = partitionByDuration(nodeFiles, 6, {});
    expect(legs.flat().sort()).toEqual([...nodeFiles].sort());
  });

  it("passes the changed files' time check for an unrecorded slow file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-record-refresh-'));
    try {
      const times = path.join(dir, 'times.json');
      fs.writeFileSync(times, JSON.stringify({'new.test.mjs': 900}));
      const log = console.log;
      console.log = () => {};
      try {
        expect(
          driftMain(['--times', times, '--changed', 'base'], {
            diff: () => 'A\tnew.test.mjs\n',
          }),
        ).toBe(0);
      } finally {
        console.log = log;
      }
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('keeps the coverage bar off every pull-request test', () => {
    // The scheduled job is the bar's one reader.
    const readers = execFileSync(
      'git',
      [
        'grep',
        '--untracked',
        '-l',
        'MIN_RECORDED_SHARE',
        '--',
        '*.mjs',
        '*.yml',
      ],
      {cwd: ROOT, encoding: 'utf8'},
    )
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(readers).toEqual([
      '.github/scripts/node-record-refresh.mjs',
      '.github/scripts/node-record-refresh.test.mjs',
    ]);
    expect(
      fs.readFileSync(
        path.join(ROOT, 'scripts/vitest-shard-sequencer.test.mjs'),
        'utf8',
      ),
    ).not.toContain('nodeLegFiles');
  });
});
