// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Routing contract for the WebKit interaction proofs.
 *
 * pr-interaction runs the touch interaction proofs in Chromium only, so a
 * WebKit- or iOS-only correction (a tap on content that moved under the
 * finger, Safari's own pointer events) had no CI guard. pr-interaction-webkit
 * runs the same proofs in WebKit, but only for the code where the engines
 * differ on touch: the gesture host and recognizers, the motion runtime, the
 * touch helpers, press feedback and the menu press model, plus the harness and
 * config that drive them. Out of that scope it skips visibly and reports
 * success, and the existing `test` join requires it, so it adds no required
 * context. The scope step's own behavior is in test-scope-action.test.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';

import {build} from 'esbuild';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {ungated} from './ci-pr-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const webkit = ci.jobs['pr-interaction-webkit'];
const chromium = ci.jobs['pr-interaction'];
const step = (job, name) =>
  job.steps.find(candidate => candidate.name === name);
const decide = job => job.steps.find(candidate => candidate.id === 'scope');
const applies = "steps.scope.outputs.applies == 'true'";
const inScope = touched => new RegExp(decide(webkit).with.paths).test(touched);
const runs = files => files.some(inScope);

describe('WebKit interaction proof routing', () => {
  it('is joined by test, adding no required context of its own', () => {
    expect(ci.jobs.test.needs).toContain('pr-interaction-webkit');
    expect(
      step(ci.jobs.test, 'Require expected test-owner outcomes').env,
    ).toMatchObject({
      PR_INTERACTION_WEBKIT_RESULT: '${{ needs.pr-interaction-webkit.result }}',
    });
    const join = fs.readFileSync(
      path.join(root, '.github/scripts/ci-test-join.mjs'),
      'utf8',
    );
    expect(join).toContain(
      "['pr-interaction-webkit', process.env.PR_INTERACTION_WEBKIT_RESULT]",
    );
  });

  it('always reports, behind the same pull-request gate as the Chromium proofs', () => {
    expect(webkit.if).toBe(chromium.if);
    expect(ungated(webkit.if)).toBe(
      "github.event_name != 'workflow_dispatch' && always() && !cancelled()",
    );
    expect(webkit.needs).toEqual(['heavy-ci', 'build-storybook']);
  });

  it('stays on a standard runner within the 15-minute budget', () => {
    expect(webkit['runs-on']).toBe('ubuntu-latest');
    expect(webkit['timeout-minutes']).toBeLessThanOrEqual(15);
  });

  it('decides its own scope first, skips visibly, and gates every later step on it', () => {
    expect(webkit.steps[0].with['sparse-checkout']).toBe(
      '.github/actions/test-scope',
    );
    expect(decide(webkit).uses).toBe(
      './.test-scope/.github/actions/test-scope',
    );
    expect(webkit.steps.indexOf(decide(webkit))).toBe(1);
    expect(decide(webkit).with).toMatchObject({
      'outside-pull-request': 'skip',
      'requires-head-file': 'playwright.interaction.config.ts',
    });
    expect(step(webkit, 'Skip the WebKit proofs outside their scope').if).toBe(
      "steps.scope.outputs.applies != 'true'",
    );
    expect(step(webkit, "Require this pull request's Storybook build").if).toBe(
      `${applies} && needs.build-storybook.result != 'success'`,
    );
    const guards = new Set([
      "Require this pull request's Storybook build",
      'Skip the WebKit proofs outside their scope',
    ]);
    for (const candidate of webkit.steps.slice(2)) {
      if (guards.has(candidate.name)) continue;
      expect(candidate.if, candidate.name ?? candidate.uses).toMatch(
        new RegExp(
          `^(always\\(\\) && )?${applies.replace(/[.()|]/g, '\\$&')}$`,
        ),
      );
    }
  });

  it('runs the interaction config in WebKit against the exact PR head', () => {
    const checkout = webkit.steps.find(
      candidate =>
        candidate.uses?.startsWith('actions/checkout@') &&
        candidate.with?.path === undefined,
    );
    expect(checkout?.with?.ref).toBe(
      '${{ github.event.pull_request.head.sha }}',
    );
    expect(step(webkit, 'Install Playwright WebKit').run).toContain(
      'npx playwright install --with-deps webkit',
    );
    const run = step(webkit, 'Run WebKit interaction proofs').run;
    expect(run).toContain('--config playwright.interaction.config.ts');
    expect(run).toContain('--project webkit');
    expect(run).not.toContain('--project chromium');
  });

  it('runs only the specs whose code its scope covers', () => {
    const run = step(webkit, 'Run WebKit interaction proofs').run;
    const targets = [
      'packages/core/src/gestures/',
      'packages/core/src/motion/__tests__/animatedLayout.interaction',
      'packages/core/src/motion/__tests__/animator.interaction',
      'internal/interaction-harness/',
    ];
    for (const target of targets) {
      expect(run).toContain(target);
      expect(inScope(target), target).toBe(true);
    }
    // The adopters spec renders Storybook components (Collapsible, TreeList,
    // ScrollableArea), and component specs (DateInput, TabList, TreeList,
    // SideNav) stay with the Chromium proofs.
    expect(run).not.toContain('animatedLayoutAdopters');
    expect(run).not.toMatch(/motion\/ /);
    for (const component of ['DateInput', 'TabList', 'TreeList', 'SideNav']) {
      expect(run).not.toContain(component);
    }
  });

  // Every source file the WebKit specs bundle into their pages is in scope,
  // so a change that reaches the run always runs it.
  it.each([
    'packages/core/src/gestures/__tests__/browser/fixture.ts',
    'packages/core/src/motion/__tests__/animatedLayoutBundle.ts',
    'packages/core/src/motion/__tests__/motionBundle.ts',
  ])('keeps everything %s bundles in scope', async entry => {
    const {metafile} = await build({
      absWorkingDir: root,
      entryPoints: [entry],
      bundle: true,
      write: false,
      metafile: true,
      format: 'iife',
      platform: 'browser',
      logLevel: 'silent',
    });
    const sources = Object.keys(metafile.inputs).filter(
      input =>
        !input.includes('node_modules') &&
        !input.includes('/__tests__/') &&
        (input.startsWith('packages/') || input.startsWith('internal/')),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(inScope(source), source).toBe(true);
    }
  });

  it('runs for gesture, motion, touch, press-feedback and menu-press code, and their harness', () => {
    for (const touched of [
      'packages/core/src/gestures/GestureHost.ts',
      'packages/core/src/gestures/__tests__/browser/presentedHitTesting.interaction.browser.spec.ts',
      'packages/core/src/motion/animator.ts',
      'packages/core/src/motion/uikit/longPress.ts',
      'packages/core/src/internal/touch.ts',
      'packages/core/src/utils/pressFeedback.ts',
      'packages/core/src/utils/pressFeedbackImports.test.ts',
      'packages/core/src/utils/pressGesture.ts',
      'packages/core/src/utils/touchPresentation.ts',
      'packages/core/src/utils/primaryClick.ts',
      'packages/core/src/utils/isApplePlatform.ts',
      'packages/core/src/hooks/useMenuPress.ts',
      'packages/core/src/hooks/menuPressGesture.ts',
      'packages/core/src/hooks/useLongPress.ts',
      'packages/core/src/hooks/usePressFeedback.ts',
      'internal/interaction-harness/src/webInput.ts',
      'playwright.interaction.config.ts',
      // Shared setup, as pr-interaction keeps (spec:AST-030 FR13): a
      // Playwright upgrade, Storybook config, theme sources, the a11y spec
      // helpers.
      'package.json',
      'pnpm-lock.yaml',
      'apps/storybook/.storybook/preview.tsx',
      'packages/themes/neutral/src/neutralTheme.ts',
      'internal/a11y-spec/src/storybook.ts',
      // Its own definition, so a change to this lane runs it.
      '.github/workflows/ci.yml',
      '.github/actions/test-scope/action.yml',
    ]) {
      expect(inScope(touched), touched).toBe(true);
    }
  });

  it('skips for everything else, including components the Chromium proofs cover', () => {
    for (const untouched of [
      'packages/core/src/Toast/Toast.tsx',
      'packages/core/src/Selector/useSelectorPresentation.ts',
      'packages/core/src/utils/clickGuard.ts',
      'packages/core/src/internal/focus.ts',
      'packages/core/src/DateInput/DateInput.tsx',
      'packages/core/locales/en.json',
      'packages/core/package.json',
      'packages/themes/neutral/package.json',
      'docs/specs/AST-030/spec.md',
      '.github/workflows/release.yml',
    ]) {
      expect(inScope(untouched), untouched).toBe(false);
    }
  });

  // Replay of real pull requests (their file lists, abridged to the paths
  // that decide the route).
  it('replays: the gesture pull requests run it, unrelated ones skip it', () => {
    // #8666: wheel and pen input drivers in the interaction harness.
    expect(
      runs([
        'internal/interaction-harness/README.md',
        'internal/interaction-harness/src/touch.ts',
        'internal/interaction-harness/src/webInput.ts',
      ]),
    ).toBe(true);
    // #8360: one click guard for the menu press model and the gesture host.
    expect(
      runs([
        '.changeset/click-guard.md',
        'packages/core/src/gestures/GestureHost.ts',
        'packages/core/src/hooks/useMenuPress.ts',
        'packages/core/src/utils/clickGuard.ts',
        'packages/core/src/utils/pressFeedback.ts',
      ]),
    ).toBe(true);
    // #9016 (Toast timer), #9025 (TextArea counter), #9048 (CI cache).
    for (const files of [
      [
        '.changeset/toast-pause-sources.md',
        'packages/core/src/Toast/Toast.tsx',
        'packages/core/src/Toast/ToastViewport.test.tsx',
        'packages/core/src/Toast/Toast.spec.md',
      ],
      [
        '.changeset/textarea-counter-i18n.md',
        'packages/core/locales/en.json',
        'packages/core/src/TextArea/TextArea.tsx',
      ],
      [
        '.github/actions/setup/action.yml',
        '.github/scripts/ci-no-dependency-cache.test.mjs',
      ],
    ]) {
      expect(runs(files), files.join(', ')).toBe(false);
    }
  });
});
