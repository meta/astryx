// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The RTL scorecard reports every failure and coverage gap it is given
 * (its declared-exclusion disclosure is in rtl-scorecard-summary.test.mjs).
 *
 * INV3 (rtl-audit-evidence): a behavior failure has no allowlist. A known
 * not-RTL component is still listed, labelled, beside surprises; every D5 and
 * D6 failure, every error, and every coverage gap or stale verified N/A gets a
 * row in the job summary.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const script = path.join(import.meta.dirname, 'rtl-scorecard-summary.mjs');

function scorecard(report) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-scorecard-'));
  try {
    const file = path.join(dir, 'report.json');
    if (report) fs.writeFileSync(file, JSON.stringify(report));
    return execFileSync(
      process.execPath,
      [script, '--report', file, '--scope', 'core'],
      {encoding: 'utf8'},
    );
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

const report = {
  knownNotRtl: ['Slider'],
  autoDiscovery: {
    pass: 1,
    fail: 2,
    na: 0,
    total: 4,
    surprises: ['Tabs'],
    results: [
      {component: 'Button', verdict: 'pass'},
      {component: 'Slider', verdict: 'fail', notes: ['arrow not mirrored']},
      {component: 'Tabs', verdict: 'fail', notes: ['chevron not mirrored']},
      {component: 'Menu', verdict: 'ERROR', notes: ['story threw']},
    ],
  },
  positionalMirror: {
    tolerancePx: 2,
    pass: 0,
    fail: 2,
    na: 0,
    total: 2,
    results: [
      {
        storyId: 'core-drawer--default',
        verdict: 'fail',
        fails: [
          {
            cls: 'panel',
            ltrRelCenterX: 10,
            rtlRelCenterX: 10,
            expectedRtlCenterX: 90,
            delta: 80,
          },
        ],
      },
      {storyId: 'core-toast--default', verdict: 'ERROR', notes: ['timeout']},
    ],
  },
  directionalDecorations: {
    pass: 0,
    fail: 1,
    na: 0,
    total: 1,
    results: [
      {storyId: 'core-link--external', verdict: 'fail', notes: ['icon side']},
    ],
  },
  coverage: {
    measured: 1,
    verifiedNa: 0,
    gaps: 1,
    staleVerifiedNa: 1,
    results: [
      {component: 'Badge', status: 'coverage-gap'},
      {component: 'Chip', status: 'stale-verified-na', note: 'D2 now applies'},
    ],
  },
  curated: {results: []},
};

describe('RTL scorecard', () => {
  it('lists every not-RTL result, labelling known ones beside surprises', () => {
    const summary = scorecard(report);
    expect(summary).toContain(
      '| Slider | fail | known-not-rtl | arrow not mirrored |',
    );
    expect(summary).toContain(
      '| Tabs | fail | ⚠️ surprise | chevron not mirrored |',
    );
    expect(summary).toContain('| Menu | ERROR | ⚠️ surprise | story threw |');
  });

  it('gives every positional and decoration failure, errors included, a row', () => {
    const summary = scorecard(report);
    expect(summary).toContain('| core-drawer--default | `panel` | 10 |');
    expect(summary).toContain('| core-toast--default | (error) |');
    expect(summary).toContain('| core-link--external | fail | icon side |');
  });

  it('reports every coverage gap and stale verified N/A', () => {
    const summary = scorecard(report);
    expect(summary).toContain(
      '| Badge | coverage-gap | unexplained all-N/A result |',
    );
    expect(summary).toContain('| Chip | stale-verified-na | D2 now applies |');
  });

  it('says so when the audit wrote no report', () => {
    expect(scorecard(null)).toContain('_No report produced');
  });
});
