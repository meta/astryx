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

  it('never counts a test, story, doc or note in a foundation folder as a shared style', () => {
    const notStyles = [
      'packages/core/src/theme/derivedVarRegistry.test.ts',
      'packages/core/src/theme/__tests__/themingTargets.test.ts',
      'packages/themes/neutral/src/__tests__/neutralTheme.test.ts',
      'packages/themes/neutral/src/neutralTheme.stories.tsx',
      'packages/core/src/theme/theme.doc.mjs',
      'packages/themes/neutral/README.md',
      'packages/core/src/Layer/__tests__/layer.stylex.test.ts',
    ];
    expect(foundationChanges(notStyles)).toEqual([]);
    expect(decideWideChange(owners(2), notStyles).wideChange).toBe(false);
    // A real foundation beside them still makes the change wide.
    expect(
      decideWideChange(owners(2), [
        ...notStyles,
        'packages/core/src/theme/tokens.stylex.ts',
      ]).wideChange,
    ).toBe(true);
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
    // Admission too: a run CI is full for at its longest wait has its
    // Storybook build, and builds nothing more (ci-admission.test.mjs).
    expect(job.needs).toEqual(['admission', 'build-storybook', 'pr-visual']);
    expect(ungated(job.if)).toBe(
      "!cancelled() && github.event_name == 'pull_request' && needs.build-storybook.result == 'success' && needs.build-storybook.outputs.lab_only != 'true' && needs.admission.outputs.full != 'true'",
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
      '--baseline-manifest .head-baseline/.github/visual-baseline/manifest.json',
    );
  });

  it("marks pr-visual's default verdict with its run identity and touched scope", () => {
    const visual = ci.jobs['pr-visual'];
    const visualStep = name =>
      visual.steps.find(candidate => candidate.name === name);
    const decide = visualStep('Decide the default touched visual check');
    expect(decide.run).toContain('--wide-verdict .visual-run/verdict.json');
    expect(decide.run).toContain(
      '--baseline-manifest .head-visual-baseline/.github/visual-baseline/manifest.json',
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
      'sparse-checkout':
        '.github/a11y-baseline.json\n.github/visual-baseline/manifest.json\n',
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

  it('runs no accessibility contract: the contracts job owns them', () => {
    const names = job.steps.map(({name}) => name);
    expect(names).not.toContain('Find the changed browser accessibility specs');
    expect(JSON.stringify(job)).not.toContain('a11y-pr-contracts.mjs');
    for (const name of [
      'Setup Node and pnpm',
      'Download Storybook artifact',
      'Install Playwright',
    ]) {
      // A changed story no other audit covers needs the same setup (FR12).
      expect(step(name).if).toBe(
        "(steps.touched.outputs.has_components == 'true' || steps.touched.outputs.changed_stories == 'true')",
      );
    }
    expect(step('Upload touched-components results').with.path).not.toContain(
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
    // Every later step runs for touched components only, or for a changed
    // story no other audit covers (FR12).
    const skipIndex = job.steps.findIndex(
      candidate =>
        candidate.name ===
        'Skip when no component changed or the change is wide',
    );
    for (const candidate of job.steps.slice(skipIndex + 1)) {
      expect(candidate.if, candidate.name).toMatch(
        /steps\.touched\.outputs\.(has_components|changed_stories) == 'true'/,
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

describe('pr-component-a11y-contracts routing', () => {
  const contracts = ci.jobs['pr-component-a11y-contracts'];
  const contractStep = name =>
    contracts.steps.find(candidate => candidate.name === name);
  const runStep = contractStep(
    "Run the touched components' accessibility contracts",
  );
  const ran =
    "steps.touched.outputs.contract_owners != '' || steps.specs.outputs.has_specs == 'true'";

  it('starts after the Storybook build, beside the test owners, never after pr-visual or the touched check', () => {
    expect(contracts.needs).toEqual([
      'room',
      'admission',
      'heavy-ci',
      'build-storybook',
    ]);
    // The same gate as the WebKit interaction proofs, which the test join
    // also reads, without the weekly full WebKit run.
    expect(contracts.if).toBe(
      ci.jobs['pr-interaction-webkit'].if.replace(
        "(github.event_name != 'workflow_dispatch' || inputs.operation == 'webkit-weekly' && needs.webkit-weekly-request.result == 'success') && always()",
        "github.event_name != 'workflow_dispatch' && always()",
      ),
    );
    expect(contracts['runs-on']).toBe('ubuntu-latest');
    expect(contracts['timeout-minutes']).toBeLessThanOrEqual(15);
    expect(contracts.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
  });

  it('blocks the merge through the test join, with no new required context', () => {
    expect(ci.jobs.test.needs).toContain('pr-component-a11y-contracts');
    const join = ci.jobs.test.steps.find(
      candidate => candidate.name === 'Require expected test-owner outcomes',
    );
    expect(join.env.PR_COMPONENT_A11Y_CONTRACTS_RESULT).toBe(
      '${{ needs.pr-component-a11y-contracts.result }}',
    );
    expect(runStep['continue-on-error']).toBeUndefined();
    for (const name of Object.keys(ci.jobs)) {
      if (name === 'test') continue;
      expect([ci.jobs[name].needs].flat(), name).not.toContain(
        'pr-component-a11y-contracts',
      );
    }
  });

  it('skips with success outside a pull request, on a specialized lane, and when nothing it owns changed', () => {
    const scope = contractStep("Decide this job's scope");
    expect(scope.with).toMatchObject({
      paths: '^(packages/[^/]+/src/|internal/a11y-spec/)',
      'outside-pull-request': 'skip',
      'component-audit': 'true',
    });
    expect(contractStep('Skip the contracts outside their scope').if).toBe(
      "steps.scope.outputs.applies != 'true'",
    );
    const skipIndex = contracts.steps.findIndex(
      candidate => candidate.name === 'Skip the contracts outside their scope',
    );
    for (const candidate of contracts.steps.slice(skipIndex + 1)) {
      expect(candidate.if, candidate.name).toMatch(
        /steps\.scope\.outputs\.applies == 'true'|steps\.touched\.outputs\.contract_owners != ''|steps\.contracts\.outcome/,
      );
    }
  });

  it('runs every contract its budget fits when the scope is undecided', () => {
    // A diff GitHub truncates leaves the scope undecided and lists no files:
    // every file then counts as changed.
    const every = contractStep('List every file when the scope is undecided');
    expect(every.if).toBe(
      "steps.scope.outputs.applies == 'true' && steps.scope.outputs.changed_files_path == '' && steps.scope.outputs.decided == 'false'",
    );
    expect(every.run).toContain('git ls-files > "$RUNNER_TEMP/every-file.txt"');
    // The changed-spec list reads only the scope's own list: every file
    // counted as changed would make every spec a changed spec.
    expect(
      contractStep('Find the changed browser accessibility specs').env
        .FILES_PATH,
    ).toBe('${{ steps.scope.outputs.changed_files_path }}');
    for (const name of [
      'Decide the touched components',
      "Run the touched components' accessibility contracts",
    ]) {
      expect(contractStep(name).env.FILES_PATH, name).toBe(
        '${{ steps.scope.outputs.changed_files_path || steps.everything.outputs.path }}',
      );
    }
  });

  it('fails, never passes, when a decided scope cannot list the changed files', () => {
    const guard = contractStep('Require the changed-file list');
    expect(guard.if).toBe(
      "steps.scope.outputs.applies == 'true' && steps.scope.outputs.changed_files_path == '' && steps.scope.outputs.decided != 'false'",
    );
    expect(guard.run).toContain('exit 1');
    expect(guard['continue-on-error']).toBeUndefined();
    const names = contracts.steps.map(({name}) => name);
    expect(names.indexOf('Require the changed-file list')).toBeLessThan(
      names.indexOf("Run the touched components' accessibility contracts"),
    );
  });

  it('decides the touched components as the touched check does, and finds changed specs from the Playwright list', () => {
    const decide = contractStep('Decide the touched components');
    expect(decide.run).toContain('touched-components.mjs scope');
    expect(decide.run).toContain('--files "$FILES_PATH"');
    const find = contractStep('Find the changed browser accessibility specs');
    expect(find.run).toContain(
      'import {isA11ySpecFile} from "./.github/scripts/lib/a11y-spec-files.mjs";',
    );
    // The merge commit, as the touched check: an older head lacks these scripts.
    expect(
      contractStep('Check out the selection scripts').with?.ref,
    ).toBeUndefined();
  });

  it("runs the head's own specs against the Storybook that head built", () => {
    const storybookCheckout = ci.jobs['build-storybook'].steps.find(
      candidate =>
        candidate.uses?.startsWith('actions/checkout@') && candidate.with?.ref,
    );
    const headCheckout = contractStep(
      'Check out the head that built the Storybook',
    );
    expect(storybookCheckout.with.ref).toBe(
      '${{ github.event.pull_request.head.sha || github.sha }}',
    );
    expect(headCheckout.with.ref).toBe(storybookCheckout.with.ref);
    expect(headCheckout.if).toBe(ran);
    const names = contracts.steps.map(({name}) => name);
    const at = name => names.indexOf(name);
    expect(at('Check out the head that built the Storybook')).toBeGreaterThan(
      Math.max(
        at('Decide the touched components'),
        at('Find the changed browser accessibility specs'),
      ),
    );
    for (const name of [
      'Setup Node and pnpm',
      'Download Storybook artifact',
      'Install Playwright',
      "Run the touched components' accessibility contracts",
    ]) {
      expect(at(name), name).toBeGreaterThan(
        at('Check out the head that built the Storybook'),
      );
    }
    // Only the selection and head checkouts: no later checkout moves the tree.
    expect(
      contracts.steps
        .filter(candidate => candidate.uses?.startsWith('actions/checkout@'))
        .map(({name}) => name),
    ).toEqual([
      'Check out the scope action',
      'Check out the selection scripts',
      'Check out the head that built the Storybook',
    ]);
  });

  it('runs the changed specs and the touched owners, on four workers, inside the job budget', () => {
    expect(runStep.if).toBe(ran);
    // The runner comes from the merge commit; the head may predate it.
    expect(runStep.run).toContain(
      'git show "$WORKFLOW_SHA:.github/scripts/a11y-pr-contracts.mjs" > "$runner"',
    );
    expect(runStep.run).toContain(
      'node "$runner" --changed-only "$SPECS_PATH" --changed-files "$FILES_PATH" --owned-by "$OWNERS" --dependents-of "$FOLDERS"',
    );
    // Every changed path, not only the changed specs: a change in a
    // component folder owns that folder's specs.
    expect(runStep.env.FILES_PATH).toBe(
      '${{ steps.scope.outputs.changed_files_path || steps.everything.outputs.path }}',
    );
    // A wide change still runs the touched components' own specs, then the
    // specs of the folders that render them (FR12).
    expect(runStep.env.OWNERS).toBe(
      '${{ steps.touched.outputs.contract_owners }}',
    );
    expect(runStep.env.FOLDERS).toBe(
      '${{ steps.touched.outputs.contract_folders }}',
    );
    expect(runStep.env.A11Y_CONTRACT_WORKERS).toBe(4);
    expect(runStep.env.WORKFLOW_SHA).toBe('${{ github.sha }}');
    // Past the runner's own eight-minute stop, inside the job's 15 minutes.
    expect(runStep['timeout-minutes']).toBeGreaterThan(8);
    expect(runStep['timeout-minutes']).toBeLessThan(
      contracts['timeout-minutes'],
    );
    for (const name of [
      'Setup Node and pnpm',
      'Download Storybook artifact',
      'Install Playwright',
    ]) {
      expect(contractStep(name).if, name).toBe(ran);
    }
    expect(contractStep('Upload contract evidence').with.path).toContain(
      'pr-a11y-evidence/',
    );
  });
});

// A story the change adds or changes that no other audit covers is audited
// on its own (spec:AST-030 FR12), new violations only.
describe('the audit of changed stories no other audit covers', () => {
  const audit = step(
    'Accessibility audit for changed stories no other audit covers',
  );
  const either =
    "(steps.touched.outputs.has_components == 'true' || steps.touched.outputs.changed_stories == 'true')";

  it('runs after the Storybook build and browser are in place, whenever a story file changed', () => {
    expect(audit.if).toBe(
      "always() && steps.playwright.outcome == 'success' && steps.touched.outputs.changed_stories == 'true'",
    );
    for (const name of [
      'Setup Node and pnpm',
      'Download Storybook artifact',
      'Install Playwright',
    ]) {
      expect(step(name).if, name).toBe(either);
    }
    expect(job.steps.indexOf(audit)).toBeGreaterThan(
      job.steps.indexOf(step('Install Playwright')),
    );
  });

  it("audits only those stories, against the head's baseline, failing on a new violation", () => {
    expect(audit.env).toEqual({
      FILES_PATH: '${{ steps.scope.outputs.changed_files_path }}',
      TOUCHED_AUDIT:
        "${{ steps.touched.outputs.has_components == 'true' && steps.touched.outputs.a11y_owners != '' }}",
    });
    expect(audit.run).toContain('--changed-story-files "$FILES_PATH"');
    // The touched components' audit already runs their stories: the same
    // filters it uses are left out here.
    expect(audit.run).toContain(
      'COVERED=$(node .github/scripts/a11y-pr-scope.mjs analysis.json)',
    );
    expect(audit.run).toContain('--covered-components "$COVERED"');
    expect(
      step('Accessibility audit for the touched components').run,
    ).toContain(
      'COMPONENTS=$(node .github/scripts/a11y-pr-scope.mjs analysis.json)',
    );
    expect(audit.run).toContain(
      '--baseline .head-baseline/.github/a11y-baseline.json',
    );
    expect(audit.run).toContain('--fail-on-new');
    expect(audit.run).not.toContain('--components');
    expect(step('Upload touched-components results').with.path).toContain(
      'a11y-stories-report.json',
    );
  });

  it('still leaves a Lab-only pull request to its own lane (FR26)', () => {
    expect(job.if).toContain(
      "needs.build-storybook.outputs.lab_only != 'true'",
    );
  });

  it('reports whether a story file changed, wide change or not', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const {execFileSync} = await import('node:child_process');
    const {fileURLToPath} = await import('node:url');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'touched-stories-'));
    try {
      const run = files => {
        fs.writeFileSync(path.join(dir, 'files.txt'), `${files.join('\n')}\n`);
        fs.writeFileSync(path.join(dir, 'analysis.json'), '{}');
        const out = path.join(dir, 'out.txt');
        fs.writeFileSync(out, '');
        execFileSync(
          'node',
          [
            fileURLToPath(new URL('./touched-components.mjs', import.meta.url)),
            'scope',
            '--analysis',
            path.join(dir, 'analysis.json'),
            '--files',
            path.join(dir, 'files.txt'),
            '--out',
            path.join(dir, 'touched.json'),
          ],
          {env: {...process.env, GITHUB_OUTPUT: out}},
        );
        return Object.fromEntries(
          fs
            .readFileSync(out, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => line.split('=')),
        );
      };
      expect(
        run(['apps/storybook/stories/ScrollRegionA11y.stories.tsx'])
          .changed_stories,
      ).toBe('true');
      expect(
        run(['packages/core/src/Layout/LayoutContent.tsx']).changed_stories,
      ).toBe('false');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it("gives the contract job the touched components and folders, wide change or not (#7910's shape)", async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const {execFileSync} = await import('node:child_process');
    const {fileURLToPath} = await import('node:url');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'touched-contracts-'));
    try {
      const owners = [
        'core/FieldStatus',
        'core/Spinner',
        'core/Tokenizer',
        'core/Typeahead',
        'core/CheckboxList',
        'lab/EmojiPicker',
        'lab/Schedule',
      ];
      fs.writeFileSync(
        path.join(dir, 'files.txt'),
        'packages/core/src/Spinner/Spinner.tsx\n',
      );
      fs.writeFileSync(
        path.join(dir, 'analysis.json'),
        JSON.stringify({modifiedComponentOwners: owners}),
      );
      const out = path.join(dir, 'out.txt');
      fs.writeFileSync(out, '');
      execFileSync(
        'node',
        [
          fileURLToPath(new URL('./touched-components.mjs', import.meta.url)),
          'scope',
          '--analysis',
          path.join(dir, 'analysis.json'),
          '--files',
          path.join(dir, 'files.txt'),
          '--out',
          path.join(dir, 'touched.json'),
        ],
        {env: {...process.env, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: ''}},
      );
      const outputs = Object.fromEntries(
        fs
          .readFileSync(out, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(line => line.split('=')),
      );
      expect(outputs.wide_change).toBe('true');
      expect(outputs.has_components).toBe('false');
      expect(outputs.contract_owners.split(',')).toEqual([...owners].sort());
      expect(outputs.contract_folders.split(',')).toContain('core/Spinner');
      expect(outputs.contract_folders.split(',')).toContain('lab/Schedule');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
