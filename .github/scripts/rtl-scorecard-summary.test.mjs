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
