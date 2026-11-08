// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {validateRtlReport} from './rtl-report-completion.mjs';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'rtl-report-completion.mjs',
);

function completeReport() {
  return {
    scope: {packages: ['charts'], filters: ['charts/chartlegend']},
    completion: {
      plannedComponentScans: 1,
      completedComponentScans: 1,
      plannedStoryScans: 2,
      completedPositionalScans: 2,
      completedDecorationScans: 2,
      plannedComponentIdentities: ['charts/ChartLegend'],
      completedComponentIdentities: ['charts/ChartLegend'],
      plannedD1Identities: ['charts/ChartLegend::charts-legend--default'],
      completedD1Identities: ['charts/ChartLegend::charts-legend--default'],
      plannedStoryIdentities: [
        'charts/ChartLegend::charts-legend--default',
        'charts/ChartLegend::charts-legend--many-items',
      ],
      completedPositionalIdentities: [
        'charts/ChartLegend::charts-legend--default',
        'charts/ChartLegend::charts-legend--many-items',
      ],
      completedDecorationIdentities: [
        'charts/ChartLegend::charts-legend--default',
        'charts/ChartLegend::charts-legend--many-items',
      ],
    },
    autoDiscovery: {
      results: [
        {
          component: 'charts/ChartLegend',
          storyId: 'charts-legend--default',
          verdict: 'pass',
        },
      ],
    },
    positionalMirror: {
      results: [
        {
          component: 'charts/ChartLegend',
          storyId: 'charts-legend--default',
          verdict: 'fail',
        },
        {
          component: 'charts/ChartLegend',
          storyId: 'charts-legend--many-items',
          verdict: 'N-A',
        },
      ],
    },
    directionalDecorations: {
      results: [
        {
          component: 'charts/ChartLegend',
          storyId: 'charts-legend--default',
          verdict: 'pass',
        },
        {
          component: 'charts/ChartLegend',
          storyId: 'charts-legend--many-items',
          verdict: 'N-A',
        },
      ],
    },
    coverage: {total: 1},
  };
}

describe('RTL report completion contract', () => {
  it('accepts exact requested scope with nonzero completed scans', () => {
    expect(
      validateRtlReport(completeReport(), {
        packageName: 'charts',
        filter: 'charts/ChartLegend',
      }),
    ).toEqual({ok: true, message: 'Completed RTL evidence for charts.'});
  });

  it.each([
    [
      'wrong package',
      report => {
        report.scope.packages = ['core'];
      },
    ],
    [
      'stale filter',
      report => {
        report.scope.filters = [];
      },
    ],
    [
      'zero planned components',
      report => {
        report.completion.plannedComponentScans = 0;
        report.completion.completedComponentScans = 0;
      },
    ],
    [
      'incomplete component scans',
      report => {
        report.completion.completedComponentScans = 0;
      },
    ],
    [
      'zero planned stories',
      report => {
        report.completion.plannedStoryScans = 0;
        report.completion.completedPositionalScans = 0;
        report.completion.completedDecorationScans = 0;
      },
    ],
    [
      'incomplete positional scans',
      report => {
        report.completion.completedPositionalScans = 1;
      },
    ],
    [
      'incomplete decoration scans',
      report => {
        report.completion.completedDecorationScans = 1;
      },
    ],
    [
      'duplicate component identities',
      report => {
        report.completion.completedComponentIdentities = [
          'charts/ChartLegend',
          'charts/ChartLegend',
        ];
      },
    ],
    [
      'substituted D1 identity',
      report => {
        report.completion.completedD1Identities[0] =
          'charts/ChartLegend::charts-legend--substitute';
      },
    ],
    [
      'missing story identity',
      report => {
        report.completion.completedPositionalIdentities.pop();
      },
    ],
    [
      'substituted story identity',
      report => {
        report.completion.completedDecorationIdentities[1] =
          'charts/ChartLegend::charts-legend--substitute';
      },
    ],
    [
      'unexpected story identity',
      report => {
        report.completion.completedPositionalIdentities.push(
          'charts/ChartLegend::charts-legend--unexpected',
        );
      },
    ],
    [
      'D1 ERROR result',
      report => {
        report.autoDiscovery.results[0].verdict = 'ERROR';
      },
    ],
    [
      'D5 ERROR result',
      report => {
        report.positionalMirror.results[0].verdict = 'ERROR';
      },
    ],
    [
      'D6 ERROR result',
      report => {
        report.directionalDecorations.results[0].verdict = 'ERROR';
      },
    ],
    [
      'empty coverage roster',
      report => {
        report.coverage.total = 0;
      },
    ],
    [
      'registry error',
      report => {
        report.coverage.registryError = 'bad registry';
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const report = completeReport();
    mutate(report);
    expect(
      validateRtlReport(report, {
        packageName: 'charts',
        filter: 'charts/ChartLegend',
      }).ok,
    ).toBe(false);
  });

  it.each([
    ['missing', null],
    ['malformed', '{not json'],
  ])('CLI rejects a %s report', (_name, content) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-report-'));
    const report = path.join(dir, 'report.json');
    try {
      if (content !== null) fs.writeFileSync(report, content);
      const result = spawnSync(
        process.execPath,
        [
          SCRIPT,
          '--report',
          report,
          '--package',
          'charts',
          '--filter',
          'charts/ChartLegend',
        ],
        {encoding: 'utf8'},
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Could not read RTL shard report');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('CLI rejects a report whose planned scans all errored', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-report-error-'));
    const reportPath = path.join(dir, 'report.json');
    try {
      const report = completeReport();
      for (const section of [
        report.autoDiscovery,
        report.positionalMirror,
        report.directionalDecorations,
      ]) {
        for (const result of section.results) result.verdict = 'ERROR';
      }
      fs.writeFileSync(reportPath, JSON.stringify(report));
      const result = spawnSync(
        process.execPath,
        [
          SCRIPT,
          '--report',
          reportPath,
          '--package',
          'charts',
          '--filter',
          'charts/ChartLegend',
        ],
        {encoding: 'utf8'},
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('results are missing, unsuccessful');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
