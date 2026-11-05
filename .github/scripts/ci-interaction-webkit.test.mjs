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

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
      "github.event_name != 'workflow_dispatch' && always() && !cancelled() && needs.room.outputs.full != 'true' && needs.admission.outputs.full != 'true'",
    );
    // Admission too: the Storybook build starts beside it (spec:AST-030 FR16).
    expect(webkit.needs).toEqual([
      'room',
      'admission',
      'heavy-ci',
      'build-storybook',
    ]);
  });

  it('stays on a standard runner within the 15-minute budget', () => {
    expect(webkit['runs-on']).toBe('ubuntu-latest');
    expect(webkit['timeout-minutes']).toBeLessThanOrEqual(15);
  });

  it('decides its own scope first, skips visibly, and gates every later step on it', () => {
    // The scope action first; the leg planner shares the checkout.
    expect(webkit.steps[0].with['sparse-checkout'].trim().split('\n')[0]).toBe(
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
      // A leg whose plan holds no spec file runs no proofs.
      expect(candidate.if, candidate.name ?? candidate.uses).toMatch(
        new RegExp(
          `^(always\\(\\) && )?${applies.replace(/[.()|]/g, '\\$&')}( && steps\\.plan\\.outputs\\.files != '0')?$`,
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
    // The image already holds WebKit and its system libraries: no apt step.
    expect(step(webkit, 'Install Playwright WebKit').run).toBe(
      'pnpm install --frozen-lockfile && npx playwright install webkit',
    );
    const run = step(webkit, 'Run WebKit interaction proofs').run;
    expect(run).toContain('--config playwright.interaction.config.ts');
    expect(run).toContain('--project webkit');
    expect(run).not.toContain('--project chromium');
  });

  it("runs in Playwright's image for exactly the Playwright version the lockfile resolves", () => {
    expect(webkit['runs-on']).toBe('ubuntu-latest');
    expect(webkit.container).toEqual({
      image: expect.stringMatching(
        /^mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-noble$/,
      ),
      options: '--ipc=host',
    });
    // Steps keep the runner's bash, and git trusts the root-owned checkout
    // before the head check reads it.
    expect(webkit.defaults).toEqual({run: {shell: 'bash'}});
    const trust = step(webkit, 'Trust the checkout in the container');
    expect(trust.run).toBe(
      'git config --global --add safe.directory "$GITHUB_WORKSPACE"',
    );
    expect(webkit.steps.indexOf(trust)).toBe(
      webkit.steps.indexOf(step(webkit, 'Verify evidence checkout')) - 1,
    );
    const tag = /:v(\d+\.\d+\.\d+)-/.exec(webkit.container.image)[1];
    const lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
    // Every resolved copy of the three packages, so a bump of any one of them
    // fails here until the image tag moves with it.
    for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
      const pattern = new RegExp(
        `^  '?${name.replace(/[/.]/g, '\\$&')}@(\\d+\\.\\d+\\.\\d+)'?:`,
        'gm',
      );
      const versions = new Set(
        [...lock.matchAll(pattern)].map(match => match[1]),
      );
      expect([...versions], name).toEqual([tag]);
    }
  });

  it("caps llvmpipe's threads at the job's cgroup CPU quota before Playwright runs", async () => {
    const run = step(webkit, 'Run WebKit interaction proofs').run;
    const setup = run.slice(0, run.indexOf('pnpm exec playwright test'));
    expect(setup).toContain('export LP_NUM_THREADS');
    // Run the setup against a quota file: a 2-CPU quota caps a 64-CPU view,
    // no quota keeps nproc, and the quota never raises the count.
    const {execFileSync} = await import('node:child_process');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-threads-'));
    const threads = (cpuMax, cpus) => {
      const quota = path.join(dir, 'cpu.max');
      if (cpuMax == null) fs.rmSync(quota, {force: true});
      else fs.writeFileSync(quota, `${cpuMax}\n`);
      const script = `nproc() { echo ${cpus}; }\n${setup.replaceAll(
        '/sys/fs/cgroup/cpu.max',
        quota,
      )}\necho "$LP_NUM_THREADS"`;
      return execFileSync('bash', ['-c', script], {encoding: 'utf8'})
        .trim()
        .split('\n')
        .at(-1);
    };
    try {
      expect(threads('200000 100000', 64)).toBe('2');
      expect(threads('150000 100000', 64)).toBe('2');
      expect(threads('max 100000', 64)).toBe('64');
      expect(threads(null, 4)).toBe('4');
      expect(threads('800000 100000', 4)).toBe('4');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('runs only the specs whose code its scope covers', () => {
    // Each leg plans its share from these paths and runs only that share.
    const run = step(webkit, "Plan this leg's WebKit interaction proofs").run;
    const targets = [
      'packages/core/src/gestures/',
      'packages/core/src/motion/__tests__/animatedLayout.interaction',
      'packages/core/src/motion/__tests__/animator.interaction',
      'packages/core/src/hooks/__tests__/usePager.interaction',
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
    // Carousel paging renders its Storybook story, so it stays there too: its
    // code starts no WebKit run. A change to its spec does (see below).
    expect(run).not.toContain('CarouselPaging');
    expect(inScope('packages/core/src/Carousel/useCarouselPaging.ts')).toBe(
      false,
    );
    for (const component of ['DateInput', 'TabList', 'TreeList', 'SideNav']) {
      expect(run).not.toContain(component);
    }
  });

  // A pull request that changes an interaction spec, outside a Lab-only pull
  // request (which runs no interaction proofs, spec:AST-030 FR26), runs that
  // spec in both lanes, wherever it lives: the Chromium legs plan every spec,
  // and the WebKit plan adds the changed ones to its paths.
  describe('a changed interaction spec', () => {
    const spec =
      'packages/core/src/List/__tests__/ListRowPress.interaction.browser.spec.ts';

    it('starts both lanes', () => {
      expect(inScope(spec)).toBe(true);
      expect(new RegExp(decide(chromium).with.paths).test(spec)).toBe(true);
      expect(
        inScope(
          'packages/core/src/Carousel/__tests__/CarouselPaging.interaction.browser.spec.ts',
        ),
      ).toBe(true);
      // Only spec files: the component's code still starts no WebKit run.
      expect(inScope('packages/core/src/List/ListRow.tsx')).toBe(false);
      expect(inScope('packages/core/src/List/__tests__/ListRow.test.tsx')).toBe(
        false,
      );
    });

    it('lists the changed files for the WebKit plan', () => {
      expect(decide(webkit).with['component-audit']).toBe('true');
      expect(
        step(webkit, "Plan this leg's WebKit interaction proofs").env
          .CHANGED_FILES,
      ).toBe('${{ steps.scope.outputs.changed_files_path }}');
      // The Chromium legs plan every spec file, with no path filter.
      expect(
        step(chromium, "Plan this leg's interaction proofs").run,
      ).not.toContain(' -- ');
    });

    // Runs the plan step with a stub `node` that prints its arguments.
    function planArgs(changed, present) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webkit-plan-'));
      try {
        for (const file of present) {
          fs.mkdirSync(path.join(dir, path.dirname(file)), {recursive: true});
          fs.writeFileSync(path.join(dir, file), '');
        }
        const list = changed == null ? '' : path.join(dir, 'changed.txt');
        if (list)
          fs.writeFileSync(list, changed.map(file => `${file}\n`).join(''));
        const bin = path.join(dir, 'bin');
        fs.mkdirSync(bin);
        fs.writeFileSync(
          path.join(bin, 'node'),
          '#!/usr/bin/env bash\nprintf "%s\\n" "$@"\n',
          {mode: 0o755},
        );
        const script = step(webkit, "Plan this leg's WebKit interaction proofs")
          .run.replaceAll('${{ matrix.leg }}', '1')
          .replaceAll('${{ strategy.job-total }}', '2');
        const out = execFileSync('bash', ['-e', '-c', script], {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            RUNNER_TEMP: dir,
            CHANGED_FILES: list,
          },
        });
        return out.trim().split('\n');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    }

    it("adds the changed spec to the WebKit plan's paths", () => {
      const args = planArgs(
        [spec, 'packages/core/src/List/ListRow.tsx'],
        [spec],
      );
      const paths = args.slice(args.indexOf('--') + 1);
      expect(paths).toContain(spec);
      expect(paths).toContain('packages/core/src/gestures/');
      expect(paths).not.toContain('packages/core/src/List/ListRow.tsx');
    });

    it('leaves out a spec the pull request deletes', () => {
      const deleted =
        'packages/core/src/List/__tests__/Old.interaction.browser.spec.ts';
      const args = planArgs([deleted], []);
      expect(args).not.toContain(deleted);
      expect(args.at(-1)).toBe('internal/interaction-harness/');
    });

    it('plans only its own paths, and warns, when the scope step lists no files', () => {
      const args = planArgs(null, []);
      expect(args.at(-1)).toBe('internal/interaction-harness/');
      expect(args.join('\n')).toContain(
        '::warning title=Changed specs not planned::',
      );
    });
  });

  // Every source file the WebKit specs bundle into their pages is in scope,
  // so a change that reaches the run always runs it.
  async function expectBundleInScope(entry) {
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
  }

  it.each([
    'packages/core/src/gestures/__tests__/browser/fixture.ts',
    'packages/core/src/motion/__tests__/animatedLayoutBundle.ts',
    'packages/core/src/motion/__tests__/motionBundle.ts',
  ])('keeps everything %s bundles in scope', expectBundleInScope);

  // The pager's page arrives with the pager; until then there is nothing to
  // bundle, and from then on its next import is checked like the others.
  const pagerBundle = 'packages/core/src/hooks/__tests__/pagerBundle.ts';
  it.skipIf(!fs.existsSync(path.join(root, pagerBundle)))(
    'keeps everything the pager bundle bundles in scope',
    () => expectBundleInScope(pagerBundle),
  );

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
      // The gesture host asks the Layer module's input hold about each touch,
      // so the gesture specs' fixture bundles it.
      'packages/core/src/Layer/inputHold.ts',
      'packages/core/src/hooks/useMenuPress.ts',
      'packages/core/src/hooks/menuPressGesture.ts',
      'packages/core/src/hooks/useLongPress.ts',
      'packages/core/src/hooks/usePressFeedback.ts',
      'packages/core/src/hooks/usePager.ts',
      'packages/core/src/hooks/useIsomorphicLayoutEffect.ts',
      'packages/core/src/hooks/useAttachment.ts',
      'packages/core/src/utils/sharedResizeObserver.ts',
      'packages/core/src/utils/scrollView.ts',
      'packages/core/src/hooks/__tests__/usePager.interaction.browser.spec.ts',
      'packages/core/src/hooks/__tests__/pagerBundle.ts',
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
      'packages/core/src/utils/focusReturn.ts',
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
        'docs/specs/components/Toast/Toast.spec.md',
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
