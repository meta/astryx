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
  auditedA11yOwners,
  withVisualBaseline,
  wideVisualVerdict,
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

  it('expands a changed multi-component folder to its members, counted as one component', () => {
    const scope = resolveTouchedScope({
      unresolvedComponentSources: ['core/Chat'],
      modifiedComponentOwners: ['core/Toast'],
    });
    expect(scope.touched).toContain('core/ChatComposer');
    expect(scope.touched).toContain('core/Toast');
    expect(scope.folders).toEqual(['core/Chat', 'core/Toast']);
    // Visual stories are keyed by folder.
    expect(scope.visualComponents).toEqual(['Chat', 'Toast']);
    expect(scope.visualKeyByOwner['core/ChatComposer']).toBe('Chat');
    expect(decideWideChange(scope, []).componentCount).toBe(2);
  });

  it("counts a folder's umbrella and pattern-story violations, from the audit's real report shape", () => {
    const scope = resolveTouchedScope({
      unresolvedComponentSources: ['core/Chat'],
    });
    // The audit files a Chat change under the folder's umbrella story and a
    // member's pattern story, neither of which is a documented member.
    const a11yReport = {
      auditedStories: [
        {owner: 'core/Chat', storyId: 'core-chat--default'},
        {owner: 'core/ChatSendButton', storyId: 'core-chat-patterns--send'},
      ],
      components: {
        Chat: {
          storiesAudited: 2,
          violations: [],
          storyDetails: [
            {
              story: 'Default',
              storyId: 'core-chat--default',
              violations: [
                {id: 'button-name', impact: 'critical', nodes: [{}]},
              ],
            },
            {
              story: 'Send',
              storyId: 'core-chat-patterns--send',
              violations: [
                {id: 'color-contrast', impact: 'serious', nodes: [{}]},
              ],
            },
          ],
        },
      },
    };
    expect(auditedA11yOwners(a11yReport)).toEqual([
      'core/Chat',
      'core/ChatSendButton',
    ]);
    const report = buildTouchedReport({
      headSha: 'a'.repeat(40),
      scope,
      verdict: null,
      a11yReport,
      a11yBaseline: {},
      rtlReports: [],
    });
    const byKey = Object.fromEntries(
      report.components.map(component => [component.key, component]),
    );
    // The umbrella's violation fails every touched member of the folder.
    expect(byKey['core/ChatComposer'].results.a11y).toBe('fail');
    expect(byKey['core/ChatComposer'].detail).toContain('button-name');
    // A pattern-story owner outside the touched set gets its own row.
    expect(byKey['core/ChatSendButton'].results.a11y).toBe('fail');
    expect(byKey['core/ChatSendButton'].detail).toContain('color-contrast');
    expect(hasFailure(report)).toBe(true);
    // The wide rule still counts the folder once.
    expect(report.componentCount).toBe(1);
  });

  it('compares only visual components that have an accepted baseline shot', () => {
    const scope = withVisualBaseline(
      resolveTouchedScope({
        modifiedComponentOwners: ['core/Toast', 'core/Brand'],
      }),
      {
        a: {storyId: 'core-toast--default'},
        b: {storyId: 'core-forms-textarea--default'},
      },
    );
    expect(scope.visualComponents).toEqual(['Toast']);
    expect(scope.noVisualBaseline).toEqual(['Brand']);
    expect(visualResult(ownerIdentity('core/Brand'), null, scope)).toEqual({
      result: 'not-run',
      detail: 'no accepted visual baseline yet',
    });
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

  it('writes a skipped visual verdict for a wide change, carrying the run identity', () => {
    const verdict = wideVisualVerdict(
      {componentCount: 7},
      {
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_RUN_ID: '42',
        GITHUB_RUN_ATTEMPT: '1',
        ASTRYX_PR_HEAD_SHA: 'b'.repeat(40),
        ASTRYX_PR_BASE_SHA: 'c'.repeat(40),
      },
    );
    expect(verdict).toMatchObject({
      version: 1,
      status: 'skipped',
      context: {
        sha: 'a'.repeat(40),
        runId: '42',
        runAttempt: '1',
        headSha: 'b'.repeat(40),
        baseSha: 'c'.repeat(40),
        scope: 'touched',
      },
      counts: {total: 0, failed: 0},
    });
    expect(verdict.reason).toContain('Wide change (7 components)');
    expect(verdict.reason).toContain('ci:run-visual');
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
    // A visual job that failed without a verdict is a failure, not a not-run.
    expect(visualResult(button, null, scope, {}, 'failure').result).toBe(
      'fail',
    );
    // A failed capture is matched to its component through the manifest, and
    // a failure that names no component fails every audited one.
    const failed = {
      status: 'failed',
      changes: [],
      added: [],
      removed: [],
      failures: [{key: 'f1', error: 'timeout'}],
    };
    expect(
      visualResult(button, failed, scope, {f1: {component: 'Button'}}).result,
    ).toBe('fail');
    expect(
      visualResult(badge, failed, scope, {f1: {component: 'Button'}}).result,
    ).toBe('pass');
    expect(visualResult(badge, failed, scope, {}).result).toBe('fail');
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
    // An audit that failed before writing its report fails every owner.
    expect(a11yResult(button, null, [], 'failure')).toEqual({
      result: 'fail',
      detail: 'the accessibility audit failed before its report',
    });
    expect(a11yResult(button, null, [], 'success').result).toBe('not-run');
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
    // The audit's coverage gap fails, and an audit that crashed before its
    // report fails rather than reading not-run.
    expect(
      rtlResult(button, [
        {
          autoDiscovery: {
            results: [{component: 'core/Button', verdict: 'N-A'}],
          },
          coverage: {
            results: [{component: 'core/Button', status: 'coverage-gap'}],
          },
        },
      ]),
    ).toEqual({result: 'fail', detail: 'RTL coverage-gap'});
    expect(rtlResult(button, [], 'failure').result).toBe('fail');
    expect(rtlResult(button, [], 'success').result).toBe('not-run');
    // A partial curated card (some dimensions hold, others do not) fails.
    expect(
      rtlResult(button, [
        {curated: {results: [{component: 'core/Button', rollup: 'partial'}]}},
      ]).result,
    ).toBe('fail');
    // A curated target's card counts: not-RTL fails, RTL-ready passes.
    expect(
      rtlResult(button, [
        {
          autoDiscovery: {
            results: [{component: 'core/Button', verdict: 'pass'}],
          },
          curated: {results: [{component: 'core/Button', rollup: 'not-RTL'}]},
        },
      ]).result,
    ).toBe('fail');
    expect(
      rtlResult(button, [
        {curated: {results: [{component: 'core/Button', rollup: 'RTL-ready'}]}},
      ]).result,
    ).toBe('pass');
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
      "!cancelled() && github.event_name == 'pull_request' && needs.build-storybook.result == 'success' && needs.build-storybook.outputs.lab_only != 'true'",
    );
    expect(job['runs-on']).toBe('ubuntu-24.04-arm');
    expect(job['timeout-minutes']).toBeLessThanOrEqual(15);
    expect(job.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
  });

  it('skips the analysis download for a change with no components, and reads a failed pr-visual too', () => {
    expect(step('Download analysis artifact').if).toBe(
      "steps.scope.outputs.spec_only != 'true' && steps.scope.outputs.docsite_only != 'true' && steps.scope.outputs.tooling_only != 'true'",
    );
    expect(step("Download pr-visual's verdict").if).toContain(
      "needs.pr-visual.result == 'failure'",
    );
    // A failed accessibility audit does not skip RTL.
    expect(step('RTL audit for the touched components').if).toMatch(
      /^always\(\) && steps\.playwright\.outcome == 'success' && /,
    );
    const report = step('Report per-component results');
    expect(report.env.VISUAL_JOB).toBe('${{ needs.pr-visual.result }}');
    expect(report.run).toContain('--visual-job "$VISUAL_JOB"');
    expect(report.env.A11Y_STEP).toBe('${{ steps.a11y.outcome }}');
    expect(report.env.RTL_STEP).toBe('${{ steps.rtl.outcome }}');
    expect(report.run).toContain('--a11y-step "$A11Y_STEP"');
    expect(report.run).toContain('--rtl-step "$RTL_STEP"');
    expect(report.run).toContain(
      '--baseline-manifest .github/visual-baseline/manifest.json',
    );
  });

  it("marks pr-visual's default verdict with its run identity and touched scope", () => {
    const visual = ci.jobs['pr-visual'];
    const visualStep = name =>
      visual.steps.find(candidate => candidate.name === name);
    const decide = visualStep('Decide the default touched visual check');
    expect(decide.run).toContain('--wide-verdict .visual-run/verdict.json');
    expect(decide.run).toContain(
      '--baseline-manifest .github/visual-baseline/manifest.json',
    );
    expect(decide.env.ASTRYX_PR_HEAD_SHA).toBe(
      '${{ github.event.pull_request.head.sha }}',
    );
    const check = visualStep('Visual check for the default touched components');
    expect(check.env).toMatchObject({
      ASTRYX_PR_HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
      ASTRYX_PR_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      ASTRYX_VISUAL_SCOPE: 'touched',
    });
    // A scope with nothing to compare leaves no verdict instead of failing.
    expect(check.run).toContain(
      'planned no shots|no stable visual representative',
    );
  });

  it('reads the accessibility baseline from the head that built the audited Storybook', () => {
    const baseline = step("Check out the head's accessibility baseline");
    expect(baseline.with).toMatchObject({
      ref: '${{ github.event.pull_request.head.sha }}',
      path: '.head-baseline',
      'sparse-checkout': '.github/a11y-baseline.json',
    });
    expect(step('Report per-component results').run).toContain(
      '--a11y-baseline .head-baseline/.github/a11y-baseline.json',
    );
  });

  it('records an RTL failure without failing the job, as pr-rtl keeps RTL findings soft', () => {
    const report = {
      components: [
        {
          key: 'core/ContextMenu',
          results: {visual: 'pass', a11y: 'pass', rtl: 'fail'},
        },
      ],
    };
    expect(hasFailure(report)).toBe(false);
    report.components[0].results.a11y = 'fail';
    expect(hasFailure(report)).toBe(true);
  });

  it('checks out the tested merge commit, so a branch that predates the check still runs it', () => {
    const checkout = job.steps.find(step => step.name === 'Checkout');
    expect(checkout.uses).toMatch(/^actions\/checkout@/);
    expect(checkout.with?.ref).toBeUndefined();
  });

  // spec:AST-030 FR12: a browser accessibility spec the change adds or
  // modifies is caught on its own pull request, not first on main.
  it('runs the changed browser accessibility specs, and only on a pull request that changes one', () => {
    const find = step('Find the changed browser accessibility specs');
    expect(find.env.FILES_PATH).toBe(
      '${{ steps.scope.outputs.changed_files_path }}',
    );
    // The same spec list playwright.config.ts runs, not a copy of its globs.
    expect(find.run).toContain(
      'import {isA11ySpecFile} from "./.github/scripts/lib/a11y-spec-files.mjs";',
    );
    expect(find.run).not.toContain('spec\\.ts');
    const runSpecs = step('Run the changed browser accessibility specs');
    expect(runSpecs.if).toBe(
      "always() && steps.playwright.outcome == 'success' && steps.specs.outputs.has_specs == 'true'",
    );
    expect(runSpecs.run).toBe(
      'node .github/scripts/a11y-pr-contracts.mjs --changed-only "$SPECS_PATH"',
    );
    // A failing spec turns the job red: no continue-on-error.
    expect(runSpecs['continue-on-error']).toBeUndefined();
    // Bounded inside the job's 15 minutes, past the runner's own 8-minute stop.
    expect(runSpecs['timeout-minutes']).toBe(9);
    // Setup, Storybook and Playwright run for a spec-only change too.
    for (const name of [
      'Setup Node and pnpm',
      'Download Storybook artifact',
      'Install Playwright',
    ]) {
      expect(step(name).if).toBe(
        "steps.touched.outputs.has_components == 'true' || steps.specs.outputs.has_specs == 'true'",
      );
    }
    expect(step('Upload touched-components results').with.path).toContain(
      'pr-a11y-evidence/',
    );
    // Still advisory: no required context depends on this job.
    expect(job.name).toBe('Touched components (visual, accessibility, RTL)');
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
    // Every later step runs for touched components, or (setup, Storybook,
    // Playwright, the spec run and the upload) for a changed browser spec.
    const skipIndex = job.steps.findIndex(
      candidate =>
        candidate.name ===
        'Skip when no component changed or the change is wide',
    );
    for (const candidate of job.steps.slice(skipIndex + 1)) {
      expect(candidate.if, candidate.name).toMatch(
        /steps\.touched\.outputs\.has_components == 'true'|steps\.specs\.outputs\.has_specs == 'true'/,
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
