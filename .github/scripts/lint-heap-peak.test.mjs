// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the Lint job records the heap each type-aware lint process
 *   peaked at, shows it, and warns before it runs out.
 *
 * The full ESLint pass and the comment-provenance check load core's
 * TypeScript program, which grows with core. A preload records each Node
 * process's peak heap; a report step names the largest share of its heap
 * limit in the job summary and warns at 80%. It never fails the job.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {WARN_SHARE, reportHeapPeaks} from './lint-heap-peak.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const lint = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/lint.yml'), 'utf8'),
);
const steps = lint.jobs.lint.steps;
const step = name => steps.find(each => each.name === name);
const GIB = 1024 ** 3;

/** One process's record line, as the preload writes it. */
const row = (
  command,
  liveHeap,
  {pid = 1, done = true, heapLimit = 6 * GIB} = {},
) =>
  JSON.stringify({
    pid,
    command,
    done,
    liveHeap,
    heldHeap: liveHeap * 1.3,
    heapLimit,
    maxRss: liveHeap * 1.4,
  });
const PRELOAD = path.join(root, '.github/scripts/lint-heap-peak.mjs');

describe('the report', () => {
  it('names the process whose live heap is nearest its limit, and warns at 80%', () => {
    const lines = [
      row('pnpm lint', 0.1 * GIB, {pid: 1}),
      row('eslint . --cache', 5.0 * GIB, {pid: 2}),
      row('provenance --check', 3.0 * GIB, {pid: 3}),
    ];
    const {summary, warning} = reportHeapPeaks(lines);
    expect(WARN_SHARE).toBe(0.8);
    expect(summary).toContain('eslint . --cache');
    expect(summary).toContain(
      '`eslint . --cache` kept about 5.00 GiB of a 6.00 GiB heap (83%) live after a full garbage collection; V8 held at most 6.50 GiB',
    );
    expect(warning).toMatch(
      /^::warning title=Lint heap near its limit::eslint \. --cache kept about 5\.00 GiB of its 6\.00 GiB heap \(83%\) live, past 80%/,
    );
  });

  it('only reports below 80%', () => {
    const {summary, warning} = reportHeapPeaks([
      row('eslint . --cache', 4.0 * GIB),
    ]);
    expect(summary).toContain('about 4.00 GiB of a 6.00 GiB heap (67%) live');
    expect(warning).toBe('');
  });

  it('counts a process that finished with an error as finished, and once', () => {
    const {summary, warning} = reportHeapPeaks([
      row('eslint . --cache', 2.0 * GIB, {pid: 7, done: false}),
      JSON.stringify({
        pid: 7,
        command: 'eslint . --cache',
        done: true,
        error: 'x',
      }),
      JSON.stringify({
        pid: 7,
        command: 'eslint . --cache',
        done: true,
        error: 'x',
      }),
    ]);
    expect(summary).toBe(
      'Lint heap: `eslint . --cache` kept about 2.00 GiB of a 6.00 GiB heap (33%) live after a full garbage collection; V8 held at most 2.60 GiB, and its peak RSS was 2.80 GiB. 1 process could not record: x.',
    );
    expect(warning).toBe('');
  });

  it('skips a line it cannot read', () => {
    const {summary} = reportHeapPeaks([
      '{"pid": 9, "comm',
      row('eslint . --cache', 4.0 * GIB),
    ]);
    expect(summary).toContain('`eslint . --cache` kept about 4.00 GiB');
  });

  it('names a process that never finished, by its last reading, and warns', () => {
    // A process that runs out of heap never reaches its exit record: only the
    // readings it wrote after each full collection remain.
    const {summary, warning} = reportHeapPeaks([
      row('eslint . --cache', 2.0 * GIB, {pid: 7, done: false}),
      row('eslint . --cache', 3.5 * GIB, {pid: 7, done: false}),
      row('check-knowledge.mjs', 0.2 * GIB, {pid: 8}),
    ]);
    expect(summary).toBe(
      'Lint heap: `eslint . --cache` did not finish; its last reading kept about 3.50 GiB of a 6.00 GiB heap (58%) live after a full garbage collection; V8 held at most 4.55 GiB, and its peak RSS was 4.90 GiB.',
    );
    expect(warning).toMatch(
      /^::warning title=Lint heap near its limit::eslint \. --cache did not finish, with about 3\.50 GiB of its 6\.00 GiB heap \(58%\) live at its last reading\. If it ran out of heap: /,
    );
  });

  it('says so when nothing was recorded, and still passes', () => {
    expect(reportHeapPeaks([])).toEqual({
      summary: 'Lint heap: no process recorded its peak.',
      warning: '',
    });
    // A run with no record file exits 0.
    const out = spawnSync(
      process.execPath,
      [
        path.join(root, '.github/scripts/lint-heap-peak.mjs'),
        'report',
        path.join(os.tmpdir(), 'no-such-lint-heap-record.jsonl'),
      ],
      {encoding: 'utf8', env: {...process.env, GITHUB_STEP_SUMMARY: ''}},
    );
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('no process recorded its peak');
  });

  it('exits 0 whatever its record holds', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-heap-'));
    const file = path.join(dir, 'peaks.jsonl');
    fs.writeFileSync(file, 'not json\n{"pid":\n');
    for (const record of [file, dir]) {
      const out = spawnSync(process.execPath, [PRELOAD, 'report', record], {
        encoding: 'utf8',
        env: {...process.env, GITHUB_STEP_SUMMARY: ''},
      });
      expect(out.status, record).toBe(0);
    }
  });

  it('keeps the last reading of a real process that runs out of heap', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-heap-'));
    const file = path.join(dir, 'peaks.jsonl');
    const run = spawnSync(
      process.execPath,
      [
        '--max-old-space-size=64',
        `--import=${PRELOAD}`,
        '-e',
        // Grows until the heap runs out, and yields between batches as a
        // linter does between files.
        "globalThis.keep = []; (async () => { for (;;) { for (let i = 0; i < 5e4; i++) keep.push({i, s: 'x'.repeat(16) + i}); await new Promise(resolve => setImmediate(resolve)); } })();",
      ],
      {encoding: 'utf8', env: {...process.env, LINT_HEAP_PEAK_FILE: file}},
    );
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('heap out of memory');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines.map(line => JSON.parse(line).done)).not.toContain(true);
    const {summary, warning} = reportHeapPeaks(lines);
    expect(summary).toMatch(/^Lint heap: `node[^`]*` did not finish; /);
    expect(warning).toContain('did not finish');
  });

  it('records a real Node process through the preload', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-heap-'));
    const file = path.join(dir, 'peaks.jsonl');
    const run = spawnSync(
      process.execPath,
      [
        '--max-old-space-size=256',
        '--expose-gc',
        `--import=${PRELOAD}`,
        '-e',
        // Keeps about 40 MB live through a full collection; the observer
        // reads the heap when the collection's entry arrives.
        'globalThis.keep = Array.from({length: 4e5}, (_, i) => ({i, s: String(i)})); gc(); setTimeout(() => {}, 50);',
      ],
      {encoding: 'utf8', env: {...process.env, LINT_HEAP_PEAK_FILE: file}},
    );
    expect(run.status, run.stderr).toBe(0);
    // A reading after the full collection, then the exit record.
    const recorded = fs
      .readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
      .at(-1);
    expect(recorded.done).toBe(true);
    expect(recorded.liveHeap).toBeGreaterThan(20 * 1024 ** 2);
    expect(recorded.heldHeap).toBeGreaterThanOrEqual(recorded.liveHeap);
    // The limit follows --max-old-space-size (plus the young generation,
    // whose size varies by platform), far below Node's default.
    expect(recorded.heapLimit).toBeGreaterThanOrEqual(256 * 1024 ** 2);
    expect(recorded.heapLimit).toBeLessThan(1024 ** 3);
    expect(recorded.maxRss).toBeGreaterThan(recorded.liveHeap);
  });
});

describe('a preload that fails', () => {
  // A module loaded before the preload that breaks the heap reads it uses.
  const BREAK_V8 =
    "data:text/javascript,import v8 from 'node:v8'; v8.getHeapStatistics = () => { throw new Error('heap read broken'); };";
  // A script with its own output, a full collection and an exit code.
  const SCRIPT =
    "console.log('out'); console.error('err'); globalThis.keep = Array.from({length: 2e5}, (_, i) => ({i})); setTimeout(() => { process.exitCode = 3; }, 250);";
  const run = (imports, file) =>
    spawnSync(
      process.execPath,
      [...imports.map(each => `--import=${each}`), '-e', SCRIPT],
      {encoding: 'utf8', env: {...process.env, LINT_HEAP_PEAK_FILE: file}},
    );

  it('changes no output and no exit code when its heap reads throw, and logs the error in its record', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-heap-'));
    const file = path.join(dir, 'peaks.jsonl');
    const without = run([BREAK_V8], file);
    const withPreload = run([BREAK_V8, PRELOAD], file);
    expect(without.status).toBe(3);
    expect(withPreload.status).toBe(without.status);
    expect(withPreload.stdout).toBe(without.stdout);
    expect(withPreload.stderr).toBe(without.stderr);
    // The whole record: one error line, marked finished.
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const logged = JSON.parse(lines[0]);
    expect(logged.error).toContain('heap read broken');
    expect(logged.done).toBe(true);
    // The report counts it once and still passes.
    expect(reportHeapPeaks(lines)).toEqual({
      summary:
        'Lint heap: no process recorded its peak. 1 process could not record: heap read broken.',
      warning: '',
    });
  });

  it('changes no output and no exit code when it cannot write its record', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-heap-'));
    // A folder where the record file should be: every write fails.
    const without = run([], dir);
    const withPreload = run([PRELOAD], dir);
    expect(withPreload.status).toBe(without.status);
    expect(withPreload.stdout).toBe(without.stdout);
    expect(withPreload.stderr).toBe(without.stderr);
  });
});

describe('the Lint job', () => {
  it('preloads the recorder into both type-aware steps, and reports after ESLint without failing', () => {
    const preload =
      '--import=${{ github.workspace }}/.github/scripts/lint-heap-peak.mjs';
    for (const name of [
      'Check the comment-provenance baseline',
      'Run ESLint',
    ]) {
      expect(step(name).env.NODE_OPTIONS, name).toBe(
        `--max-old-space-size=6144 ${preload}`,
      );
      expect(step(name).env.LINT_HEAP_PEAK_FILE, name).toBe(
        '${{ runner.temp }}/lint-heap-peaks.jsonl',
      );
    }
    const report = step('Report the lint heap peak');
    expect(steps.indexOf(report)).toBe(steps.indexOf(step('Run ESLint')) + 1);
    // It runs after a failed lint, but only where setup ran: a fork without
    // its ci:run label has no checkout, and the docs and spec lanes skip
    // setup and both type-aware steps.
    const setup = steps.find(each => each.uses === './.github/actions/setup');
    expect(setup.id).toBe('setup');
    expect(report.if).toBe(
      "${{ !cancelled() && steps.setup.outcome == 'success' }}",
    );
    expect(report['continue-on-error']).toBe(true);
    expect(report.run).toBe(
      'node .github/scripts/lint-heap-peak.mjs report "$RUNNER_TEMP/lint-heap-peaks.jsonl"',
    );
  });
});
