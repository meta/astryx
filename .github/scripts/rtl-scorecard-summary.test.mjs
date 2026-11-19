// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Review-facing RTL scorecard disclosure tests.
 * @input Audit reports with declared D1 exclusions.
 * @output Markdown that names every exclusion and its rationale.
 * @position INV16 regression coverage for rtl-scorecard-summary.mjs.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterEach, describe, expect, it} from 'vitest';

const SCRIPT = path.resolve('.github/scripts/rtl-scorecard-summary.mjs');
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

function runSummary(report) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-scorecard-summary-'));
  dirs.push(dir);
  const reportPath = path.join(dir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report));
  return spawnSync(
    process.execPath,
    [SCRIPT, '--report', reportPath, '--scope', 'lab/SVGIcon'],
    {encoding: 'utf8'},
  );
}

function reportWith(exclusions) {
  return {
    declaredD1Exclusions: exclusions,
    autoDiscovery: {
      total: 1,
      pass: 0,
      fail: 0,
      na: 1,
      surprises: [],
      results: [
        {
          component: 'lab/SVGIcon',
          storyId: 'lab-svgicon--default',
          verdict: 'N-A',
        },
      ],
    },
    curated: {results: []},
  };
}

describe('RTL scorecard D1 exclusion disclosure', () => {
  it('lists every declared exclusion, including a non-representative story', () => {
    const result = runSummary(
      reportWith([
        {
          component: 'lab/SVGIcon',
          storyId: 'lab-svgicon--default-registry-icons',
          dimension: 'D1',
          reason:
            'The samples are caller-supplied data, not directional controls.',
        },
        {
          component: 'lab/SVGIcon',
          storyId: 'lab-svgicon--inherited-reference',
          dimension: 'D1',
          reason: 'Inherited fixture | rationale.\nReviewed as data.',
        },
      ]),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      '### Declared D1 exclusions (human review required)',
    );
    expect(result.stdout).toContain(
      '| lab/SVGIcon | lab-svgicon--default-registry-icons | D1 | The samples are caller-supplied data, not directional controls. |',
    );
    expect(result.stdout).toContain(
      '| lab/SVGIcon | lab-svgicon--inherited-reference | D1 | Inherited fixture \\| rationale. Reviewed as data. |',
    );
    expect(result.stdout).toContain('RTL-ready (D1 pass): —.');
  });
});

describe('RTL scorecard D5 physical-region disclosure', () => {
  it('lists every declared physical region with its story and selector', () => {
    const report = reportWith([]);
    report.declaredD5PhysicalRegions = [
      {
        component: 'lab/charttheming-recharts',
        storyId: 'lab-charttheming-recharts--theme-tokens',
        physical: 'chart',
        within: '[aria-label="Quarterly performance chart"]',
      },
    ];
    const result = runSummary(report);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      '### Declared D5 physical regions (human review required)',
    );
    expect(result.stdout).toContain(
      '| lab/charttheming-recharts | lab-charttheming-recharts--theme-tokens | chart | [aria-label="Quarterly performance chart"] |',
    );
  });

  it('says so when no physical region is declared', () => {
    const result = runSummary(reportWith([]));
    expect(result.stdout).toContain(
      '_No declared D5 physical regions in this audit scope._',
    );
  });
});

describe('RTL scorecard retries after an ERROR', () => {
  it('counts every retried story with its first reason and outcome, on one greppable line', () => {
    const report = reportWith([]);
    report.retries = {
      count: 2,
      stories: [
        {
          phase: 'D5+D6',
          storyId: 'core-selector--searchable-with-sections',
          firstError: 'TimeoutError: page.goto: Timeout 30000ms exceeded.',
          outcome: 'recovered',
        },
        {
          phase: 'D1',
          storyId: 'core-menu--default',
          firstError: 'Error: Target crashed',
          outcome: 'error',
          error: 'Error: Target crashed',
        },
      ],
    };
    const result = runSummary(report);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('### Retries after an ERROR (2)');
    expect(result.stdout).toContain(
      '| core-selector--searchable-with-sections | D5+D6 | TimeoutError: page.goto: Timeout 30000ms exceeded. | recovered |',
    );
    expect(result.stdout).toContain(
      '| core-menu--default | D1 | Error: Target crashed | still ERROR: Error: Target crashed |',
    );
    expect(result.stdout).toContain(
      'rtl-audit-retries: 2 [core-menu--default core-selector--searchable-with-sections]',
    );
  });

  it('says none were needed when no story errored', () => {
    const result = runSummary({
      ...reportWith([]),
      retries: {count: 0, stories: []},
    });
    expect(result.stdout).toContain('rtl-audit-retries: 0 []');
  });
});
