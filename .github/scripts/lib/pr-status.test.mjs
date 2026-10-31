// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pr-status.test.mjs
 * Pins the PR report's top: the status table (preview first, no review-bot
 * row, a heavy suite that did not run names its label), how a job is read as
 * ran / skipped by path / not run, the touched components' preview links and
 * results, and the collapsed CI job table.
 */

import {describe, expect, it} from 'vitest';
import status from './pr-status.js';

const {
  notRunSentence,
  classifyJob,
  summarizeJobs,
  buildStatusTable,
  buildJobTable,
  buildTouchedComponents,
  SUITES,
} = status;

const SCOPE = "Decide this job's scope";
const job = (name, conclusion, steps = []) => ({
  name,
  status: 'completed',
  conclusion,
  steps: steps.map(([stepName, stepConclusion]) => ({
    name: stepName,
    conclusion: stepConclusion,
  })),
});

describe('classifyJob', () => {
  it('reads a job whose condition was false as not run', () => {
    expect(classifyJob(job('pr-visual', 'skipped'))).toEqual({
      state: 'not-run',
    });
  });

  it('reads a job that decided its scope and skipped every work step as skipped by path', () => {
    const scoped = job('docsite-test', 'success', [
      ['Set up job', 'success'],
      [SCOPE, 'success'],
      ['Checkout', 'skipped'],
      ['Build', 'skipped'],
      ['Post Checkout', 'success'],
      ['Complete job', 'success'],
    ]);
    expect(classifyJob(scoped)).toEqual({
      state: 'scoped-out',
      reason: 'nothing in its paths changed',
    });
  });

  it('reads a job that ran any work step as ran', () => {
    const ran = job('test-node', 'success', [
      [SCOPE, 'success'],
      ['Checkout', 'success'],
      ['Test', 'skipped'],
    ]);
    expect(classifyJob(ran)).toEqual({state: 'ran', conclusion: 'success'});
    expect(classifyJob(job('lint', 'failure', [['Lint', 'failure']]))).toEqual({
      state: 'ran',
      conclusion: 'failure',
    });
  });

  it('reads a specialized-lane skip as skipped by path', () => {
    const skipped = job('build-storybook', 'success', [
      [SCOPE, 'success'],
      ['Skip heavy work for a specialized lane', 'success'],
      ['Checkout', 'skipped'],
    ]);
    expect(classifyJob(skipped).state).toBe('scoped-out');
  });
});

describe('summarizeJobs', () => {
  it('folds matrix legs into one row; any failed leg fails it', () => {
    const summary = summarizeJobs([
      job('test-node (1/2)', 'success', [['Test', 'success']]),
      job('test-node (2/2)', 'failure', [['Test', 'failure']]),
    ]);
    expect(summary).toEqual([
      {name: 'test-node', state: 'ran', conclusion: 'failure'},
    ]);
  });
});

describe('notRunSentence', () => {
  it.each([
    [
      'visual',
      'Visual did not run on this pull request; add `ci:run-visual` to run it.',
    ],
    [
      'a11y',
      'Accessibility did not run on this pull request; add `ci:run-a11y` to run it.',
    ],
    [
      'rtl',
      'RTL did not run on this pull request; add `ci:run-rtl` to run it.',
    ],
    [
      'perf',
      'Perf did not run on this pull request; add `ci:run-perf` to run it.',
    ],
  ])('names the %s label', (id, sentence) => {
    expect(notRunSentence(SUITES.find(suite => suite.id === id))).toBe(
      sentence,
    );
  });
});

describe('buildStatusTable', () => {
  const analysis = {newComponents: [], modifiedComponents: []};

  it('puts the preview first and has no review-bot row', () => {
    const table = buildStatusTable({
      preview: {
        state: 'ready',
        sha: 'a'.repeat(40),
        url: 'https://x.vercel.app',
      },
      analysis,
    });
    const rows = table
      .trim()
      .split('\n')
      .slice(2)
      .map(row => row.split(' | ')[0]);
    expect(rows).toEqual([
      '| Preview',
      '| Size',
      '| Visual',
      '| Accessibility',
      '| RTL',
    ]);
    expect(table).not.toMatch(/CodeBunny|\| Review/i);
  });

  it('shows perf only when it ran', () => {
    const ran = buildStatusTable({
      analysis,
      jobs: [job('perf', 'success', [['Measure', 'success']])],
    });
    expect(ran).toContain('| Perf | ✅ passed |');
    expect(
      buildStatusTable({analysis, jobs: [job('perf', 'skipped')]}),
    ).not.toContain('| Perf |');
  });

  it('reads the visual verdict and the accessibility report before the jobs', () => {
    const table = buildStatusTable({
      analysis,
      visualVerdict: {status: 'ok', changes: [{}, {}], counts: {total: 10}},
      a11yReport: {components: {Card: {violations: [{id: 'x'}]}}},
      jobs: [job('pr-visual', 'success', [['Run', 'success']])],
    });
    expect(table).toContain(
      '| Visual | 🔍 2 of 10 shots changed: review below |',
    );
    expect(table).toContain(
      '| Accessibility | ❌ 1 violation(s): details below |',
    );
  });

  it('summarizes size: components against the touch budget, packages and new dependencies', () => {
    const table = buildStatusTable({
      analysis: {
        ...analysis,
        componentSizes: {
          'core/Card': {importGzipBytes: 5000},
          'core/Chip': {importGzipBytes: 900},
        },
        baseComponentSizes: {
          'core/Card': {importGzipBytes: 2000},
          'core/Chip': {importGzipBytes: 900},
        },
      },
      budgetFlags: [{comp: 'core/Card'}],
      packageSize: {
        verdict: 'pass',
        addedDependencies: [{name: 'left-pad'}],
      },
    });
    expect(table).toContain(
      '| Size | ⚠️ 1 component(s) over the touch-only budget, largest +2.9KB (core/Card) · packages within budget · new dependencies: left-pad |',
    );
  });

  it('counts the CI jobs and names a failed one', () => {
    const table = buildStatusTable({
      analysis,
      jobs: [
        job('lint', 'failure', [['Lint', 'failure']]),
        job('test-ui', 'success', [['Test', 'success']]),
        job('docsite-test', 'success', [
          [SCOPE, 'success'],
          ['Build', 'skipped'],
        ]),
        job('release-check', 'skipped'),
      ],
    });
    expect(table).toContain(
      '| CI jobs | 2 ran · ❌ failed: lint · 1 skipped by path (table below) |',
    );
  });
});

describe('buildJobTable', () => {
  it('lists what each job did and why, collapsed, and leaves out release-only jobs', () => {
    const table = buildJobTable([
      job('test-ui', 'success', [['Test', 'success']]),
      job('docsite-test', 'success', [
        [SCOPE, 'success'],
        ['Build', 'skipped'],
      ]),
      job('pr-rtl', 'skipped'),
      job('release-check', 'skipped'),
    ]);
    expect(table).toMatch(
      /^<details>\n<summary>CI jobs: 1 ran, 1 skipped by path<\/summary>/,
    );
    expect(table).toContain('| test-ui | ✅ passed | |');
    expect(table).toContain(
      '| docsite-test | ⏭ skipped | nothing in its paths changed |',
    );
    expect(table).toContain(
      '| pr-rtl | ⏭ not run | RTL did not run on this pull request; add `ci:run-rtl` to run it. |',
    );
    expect(table).not.toContain('release-check');
    expect(table).toContain(
      '1 release-only job(s) do not apply to pull requests.',
    );
  });
});

describe('buildTouchedComponents', () => {
  const origin = 'https://astryx-abc123-fbopensource.vercel.app';
  const analysis = {
    newComponents: [],
    modifiedComponents: ['Button'],
    componentStats: {
      Button: {package: '@astryxdesign/core', storyTitle: 'Core/Button'},
    },
  };

  it("links each touched component's docs page and stories in this head's preview", () => {
    const table = buildTouchedComponents({analysis, origin});
    expect(table).toContain(
      `| Button | [Docs](${origin}/components/Button) | [Stories](${origin}/storybook/?path=/docs/core-button--docs) | — | — | — |`,
    );
  });

  it('takes per-component results from the touched-components report first', () => {
    const table = buildTouchedComponents({
      analysis,
      origin,
      touched: {
        components: [
          {
            name: 'Button',
            results: {visual: 'changed', a11y: 'pass', rtl: 'fail'},
          },
        ],
      },
      a11yReport: {components: {Button: {violations: [{id: 'x'}]}}},
    });
    expect(table).toContain('| 🔍 changed | ✅ | ❌ |');
  });

  it('falls back to the accessibility report and visual verdict', () => {
    const table = buildTouchedComponents({
      analysis,
      origin,
      a11yReport: {components: {Button: {violations: []}}},
      visualVerdict: {status: 'ok', changes: [{component: 'Button'}]},
    });
    expect(table).toContain('| 🔍 changed | ✅ | — |');
  });

  it('renders nothing when no component was touched', () => {
    expect(
      buildTouchedComponents({
        analysis: {newComponents: [], modifiedComponents: []},
        origin,
      }),
    ).toBe('');
  });

  it('renders component names as literal text', () => {
    const table = buildTouchedComponents({
      analysis: {modifiedComponents: ['<img src=x>'], componentStats: {}},
      origin,
    });
    expect(table).not.toContain('<img src=x>');
  });
});
