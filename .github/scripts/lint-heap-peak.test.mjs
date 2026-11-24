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

/** One recorded process, as the preload writes it. */
const row = (command, peakUsed, heapLimit = 6 * GIB, maxRss = peakUsed * 1.4) =>
  JSON.stringify({pid: 1, command, peakUsed, heapLimit, maxRss});

describe('the report', () => {
  it('names the process nearest its heap limit, and warns at 80%', () => {
    const lines = [
      row('pnpm lint', 0.1 * GIB),
      row('eslint . --cache', 5.0 * GIB),
      row('provenance --check', 3.0 * GIB),
    ];
    const {summary, warning} = reportHeapPeaks(lines);
    expect(WARN_SHARE).toBe(0.8);
    expect(summary).toContain('eslint . --cache');
    expect(summary).toContain('5.00 GiB of a 6.00 GiB heap (83%)');
    expect(warning).toMatch(
      /^::warning title=Lint heap near its limit::eslint \. --cache peaked at 5\.00 GiB of its 6\.00 GiB heap \(83%\)/,
    );
  });

  it('only reports below 80%', () => {
    const {summary, warning} = reportHeapPeaks([
      row('eslint . --cache', 4.0 * GIB),
    ]);
    expect(summary).toContain('4.00 GiB of a 6.00 GiB heap (67%)');
    expect(warning).toBe('');
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

  it('records a real Node process through the preload', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-heap-'));
    const file = path.join(dir, 'peaks.jsonl');
    const run = spawnSync(
      process.execPath,
      [
        '--max-old-space-size=256',
        `--import=${path.join(root, '.github/scripts/lint-heap-peak.mjs')}`,
        '-e',
        'globalThis.keep = Array.from({length: 2e5}, (_, i) => ({i}));',
      ],
      {encoding: 'utf8', env: {...process.env, LINT_HEAP_PEAK_FILE: file}},
    );
    expect(run.status, run.stderr).toBe(0);
    const [recorded] = fs
      .readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(recorded.peakUsed).toBeGreaterThan(0);
    expect(recorded.heapLimit).toBeGreaterThan(200 * 1024 ** 2);
    expect(recorded.heapLimit).toBeLessThan(400 * 1024 ** 2);
    expect(recorded.maxRss).toBeGreaterThan(recorded.peakUsed);
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
    expect(report.if).toBe(`always() && ${step('Run ESLint').if}`);
    expect(report['continue-on-error']).toBe(true);
    expect(report.run).toBe(
      'node .github/scripts/lint-heap-peak.mjs report "$RUNNER_TEMP/lint-heap-peaks.jsonl"',
    );
  });
});
