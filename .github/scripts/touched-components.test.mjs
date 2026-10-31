// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Touched-components check: scope, wide changes, per-component results
 *   and routing.
 * @input touched-components.mjs with fixture reports, and ci.yml
 * @output Only touched components are audited (never reverse dependents), a
 *   wide change skips the check, each suite's result is read per component,
 *   and the job runs by default on a pull request without becoming a required
 *   context
 * @position Node contracts for AST-030 FR12
 */

import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {ungated} from './ci-pr-gate.mjs';
import {
  MAX_TOUCHED_COMPONENTS,
  a11yResult,
  buildTouchedReport,
  decideWideChange,
  foundationChanges,
  hasFailure,
  ownerIdentity,
  resolveTouchedScope,
  rtlResult,
  summaryMarkdown,
  visualResult,
  wideReport,
} from './touched-components.mjs';

const ci = yaml.parse(
  fs.readFileSync(new URL('../workflows/ci.yml', import.meta.url), 'utf8'),
);
const job = ci.jobs['pr-touched-components'];
const step = name => job.steps.find(candidate => candidate.name === name);

const analysis = {
  newComponentOwners: ['core/Badge'],
  modifiedComponentOwners: ['core/Button', 'lab/MobileTokenizer'],
  dependentComponentOwners: ['core/Toolbar', 'core/Button'],
  dependentComponentFolders: ['core/Toolbar'],
  forceFullComponentAudits: false,
};

describe('touched scope', () => {
  it('audits the touched owners of every package, never their reverse dependents', () => {
    const scope = resolveTouchedScope(analysis);
    expect(scope.touched).toEqual([
      'core/Badge',
      'core/Button',
      'lab/MobileTokenizer',
    ]);
    expect(scope.visualComponents).toEqual(['Badge', 'Button']);
    expect(scope.a11yOwners).toEqual(scope.touched);
    expect(scope.rtlOwnersByPackage).toEqual({
      core: ['core/Badge', 'core/Button'],
      lab: ['lab/MobileTokenizer'],
    });
    expect(JSON.stringify(scope)).not.toContain('Toolbar');
  });

  it('never widens to a full suite, even for a change the analysis cannot scope', () => {
    const scope = resolveTouchedScope({
      ...analysis,
      forceFullComponentAudits: true,
    });
    expect(scope.broad).toBe(true);
    expect(scope.touched).toHaveLength(3);
    expect(
      resolveTouchedScope({forceFullComponentAudits: true}).touched,
    ).toEqual([]);
  });

  it('names a component by package and name', () => {
    expect(ownerIdentity('lab/MobileTokenizer')).toEqual({
      key: 'lab/MobileTokenizer',
      package: '@astryxdesign/lab',
      shortPackage: 'lab',
      name: 'MobileTokenizer',
    });
  });
});

describe('wide changes', () => {
  const owners = count =>
    resolveTouchedScope({
      modifiedComponentOwners: Array.from(
        {length: count},
        (_, index) => `core/C${index}`,
      ),
    });

  it('runs for up to five touched components and skips above that', () => {
    expect(MAX_TOUCHED_COMPONENTS).toBe(5);
    expect(decideWideChange(owners(5), [])).toEqual({
      componentCount: 5,
      foundations: [],
      wideChange: false,
    });
    expect(decideWideChange(owners(6), []).wideChange).toBe(true);
    expect(decideWideChange(owners(21), []).componentCount).toBe(21);
  });

  it('treats style-affecting foundations as wide, and behaviour-only shared code as not', () => {
    const foundations = [
      'packages/themes/neutral/src/neutralTheme.ts',
      'packages/core/src/theme/tokens.stylex.ts',
      'packages/core/src/utils/focusOutline.stylex.ts',
      'packages/core/src/Layer/layer.stylex.ts',
      'packages/lab/src/theme/labTokens.ts',
    ];
    const behaviour = [
      'packages/core/src/utils/pressFeedback.ts',
      'packages/core/src/hooks/useMenuPress.ts',
      'packages/core/src/gestures/GestureHost.ts',
      'packages/core/src/motion/animator.ts',
      'packages/core/src/Button/Button.stylex.ts',
      'packages/core/src/Button/Button.tsx',
    ];
    expect(foundationChanges([...foundations, ...behaviour])).toEqual(
      foundations,
    );
    expect(
      decideWideChange(owners(1), foundations.slice(0, 1)).wideChange,
    ).toBe(true);
    expect(decideWideChange(owners(1), behaviour).wideChange).toBe(false);
  });

  it('writes the wide record and points to the full-suite labels', () => {
    const scope = owners(6);
    const report = wideReport({
      headSha: 'abc',
      scope,
      decision: decideWideChange(scope, []),
    });
    expect(report).toMatchObject({
      headSha: 'abc',
      wideChange: true,
      componentCount: 6,
    });
    expect(report.components[0]).toEqual({
      key: 'core/C0',
      package: '@astryxdesign/core',
      name: 'C0',
    });
    expect(summaryMarkdown(report)).toContain('Wide change (6 components)');
    expect(summaryMarkdown(report)).toContain('`ci:run-visual`');
  });
});

describe('per-component results', () => {
  const scope = resolveTouchedScope(analysis);
  const button = ownerIdentity('core/Button');
  const badge = ownerIdentity('core/Badge');
  const tokenizer = ownerIdentity('lab/MobileTokenizer');

  it('reads visual changes, additions and failures by component', () => {
    const verdict = {
      status: 'changed',
      changes: [{key: 'a', component: 'Button'}],
      added: ['b'],
      removed: [],
      failures: [],
    };
    const shots = {b: {component: 'Badge'}};
    expect(visualResult(button, verdict, scope, shots).result).toBe('changed');
    expect(visualResult(badge, verdict, scope, shots).result).toBe('changed');
    expect(
      visualResult(ownerIdentity('core/Toolbar'), verdict, scope, shots).result,
    ).toBe('not-run');
    expect(visualResult(tokenizer, verdict, scope, shots)).toEqual({
      result: 'not-run',
      detail: 'no stable visual stories outside Core',
    });
    expect(
      visualResult(
        button,
        {...verdict, failures: [{component: 'Button'}]},
        scope,
      ).result,
    ).toBe('fail');
    expect(visualResult(button, null, scope).result).toBe('not-run');
    expect(visualResult(button, {status: 'skipped'}, scope).result).toBe(
      'not-run',
    );
  });

  it('fails accessibility only for new violations, and only where it audited', () => {
    const report = {components: {'core/Button': {}, 'core/Badge': {}}};
    const newViolations = [
      {component: 'core/Button', ruleId: 'color-contrast'},
    ];
    expect(a11yResult(button, report, newViolations)).toEqual({
      result: 'fail',
      detail: 'color-contrast',
    });
    expect(a11yResult(badge, report, newViolations).result).toBe('pass');
    expect(a11yResult(tokenizer, report, newViolations).result).toBe('not-run');
    expect(a11yResult(button, null, []).result).toBe('not-run');
  });

  it('reads RTL verdicts across every package report', () => {
    const reports = [
      {
        autoDiscovery: {
          results: [
            {component: 'core/Button', verdict: 'pass'},
            {component: 'core/Badge', verdict: 'N-A'},
          ],
        },
        positionalMirror: {
          results: [{component: 'core/Badge', verdict: 'fail'}],
        },
      },
      {
        autoDiscovery: {
          results: [{component: 'lab/MobileTokenizer', verdict: 'ERROR'}],
        },
      },
    ];
    expect(rtlResult(button, reports).result).toBe('pass');
    expect(rtlResult(badge, reports)).toEqual({
      result: 'fail',
      detail: '1 RTL check(s) failed',
    });
    expect(rtlResult(tokenizer, reports).result).toBe('fail');
    expect(rtlResult(ownerIdentity('core/Toolbar'), reports).result).toBe(
      'not-run',
    );
    // Every check not applicable is not a pass.
    expect(
      rtlResult(ownerIdentity('core/Toast'), [
        {autoDiscovery: {results: [{component: 'core/Toast', verdict: 'N-A'}]}},
      ]),
    ).toEqual({result: 'not-run', detail: 'no RTL check applies'});
  });

  it('writes one row per component in the shape the comment reads', () => {
    const report = buildTouchedReport({
      headSha: 'abc',
      scope,
      verdict: {
        status: 'pass',
        changes: [],
        added: [],
        removed: [],
        failures: [],
      },
      a11yReport: {components: {'core/Button': {storyDetails: []}}},
      a11yBaseline: {version: 1, entries: []},
      rtlReports: [
        {
          autoDiscovery: {
            results: [{component: 'core/Button', verdict: 'pass'}],
          },
        },
      ],
    });
    expect(report).toMatchObject({
      headSha: 'abc',
      wideChange: false,
      componentCount: 3,
    });
    expect(report.components.map(row => row.key)).toEqual([
      'core/Badge',
      'core/Button',
      'lab/MobileTokenizer',
    ]);
    expect(report.components[1]).toEqual({
      key: 'core/Button',
      package: '@astryxdesign/core',
      name: 'Button',
      results: {visual: 'pass', a11y: 'pass', rtl: 'pass'},
    });
    expect(report.components[2].results).toEqual({
      visual: 'not-run',
      a11y: 'not-run',
      rtl: 'not-run',
    });
    expect(hasFailure(report)).toBe(false);
    expect(summaryMarkdown(report)).toContain(
      '| core/Button | pass | pass | pass |',
    );
  });

  it('points to the full-suite labels when the change was broad', () => {
    const report = {
      broad: true,
      components: [
        {
          key: 'core/Button',
          results: {visual: 'pass', a11y: 'pass', rtl: 'pass'},
        },
      ],
    };
    expect(summaryMarkdown(report)).toContain('`ci:run-visual`');
  });
});

describe('pr-touched-components routing', () => {
  it('runs on every pull request after the Storybook build and pr-visual, on one standard arm runner', () => {
    expect(job.needs).toEqual(['build-storybook', 'pr-visual']);
    expect(ungated(job.if)).toBe(
      "!cancelled() && github.event_name == 'pull_request' && needs.build-storybook.result == 'success'",
    );
    expect(job['runs-on']).toBe('ubuntu-24.04-arm');
    expect(job['timeout-minutes']).toBeLessThanOrEqual(15);
    expect(job.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
  });

  it('exposes the wide-change flag and count', () => {
    expect(job.outputs).toEqual({
      wide_change: '${{ steps.touched.outputs.wide_change }}',
      component_count: '${{ steps.touched.outputs.component_count }}',
    });
    expect(step('Decide the touched components').run).toContain(
      '--files "$FILES_PATH"',
    );
  });

  it('is no required context and no release-check owner', () => {
    for (const join of ['test', 'build', 'docsite-test', 'release-check']) {
      expect([ci.jobs[join].needs].flat(), join).not.toContain(
        'pr-touched-components',
      );
    }
  });

  it('audits accessibility and RTL for touched components, and takes the visual verdict from pr-visual', () => {
    // pr-visual is the one visual owner (AST-030 FR12): this job runs no
    // visual gate of its own.
    expect(JSON.stringify(job)).not.toContain('gate.mjs');
    const verdict = step("Download pr-visual's verdict");
    expect(verdict.with.name).toBe('visual-pr-report');
    expect(verdict['continue-on-error']).toBe(true);
    expect(
      step('Accessibility audit for the touched components').run,
    ).toContain('a11y-pr-scope.mjs analysis.json');
    const rtl = step('RTL audit for the touched components').run;
    expect(rtl).toContain('--filter "$FILTER"');
    // A finding never stops the job before the report judges it.
    expect(rtl).toMatch(/--filter "\$FILTER" \|\|/);
    expect(verdict.if).toMatch(/^always\(\) && /);
    expect(step('Report per-component results').run).toContain(
      '--visual .visual-run/verdict.json',
    );
  });

  it('skips visibly when no component changed or the change is wide, and gates every audit on the scope', () => {
    expect(
      step('Skip when no component changed or the change is wide').if,
    ).toBe("steps.touched.outputs.has_components != 'true'");
    const scopeIndex = job.steps.findIndex(
      candidate => candidate.id === 'touched',
    );
    for (const candidate of job.steps.slice(scopeIndex + 2)) {
      expect(candidate.if, candidate.name).toContain(
        "steps.touched.outputs.has_components == 'true'",
      );
    }
  });

  it('uploads touched-components.json for the comment, for a wide change too', () => {
    const upload = step('Upload touched-components results');
    expect(upload.with.name).toBe('touched-components');
    expect(upload.with.path).toContain('touched-components.json');
    expect(upload.if).toContain("steps.touched.outputs.wide_change == 'true'");
  });
});
