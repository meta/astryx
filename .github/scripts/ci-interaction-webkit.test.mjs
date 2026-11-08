// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Routing contract for the WebKit interaction proofs.
 *
 * pr-interaction runs the touch interaction proofs in Chromium only, so a
 * WebKit- or iOS-only correction (a tap on content that moved under the
 * finger, Safari's own pointer events) had no CI guard. pr-interaction-webkit
 * runs the proofs in WebKit for what a change reaches: its own paths for the
 * code where the engines differ on touch (the gesture host and recognizers,
 * the motion runtime, the touch helpers, press feedback and the menu press
 * model, plus the harness and config that drive them), each interaction spec
 * the change edits, and every interaction spec in a component folder whose
 * code it changes. With nothing to run it skips visibly and reports success,
 * and the existing `test` join requires it, so it adds no required context.
 * The scope step's own behavior is in test-scope-action.test.mjs.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {build} from 'esbuild';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {ungated} from './ci-pr-gate.mjs';
import {isInteractionSpec, selectProofs} from './playwright-legs.mjs';

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
// Every interaction spec in the repository, as the legs step lists them.
function specsUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), {
    withFileTypes: true,
  })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist')
        out.push(...specsUnder(file));
    } else if (isInteractionSpec(file)) out.push(file);
  }
  return out;
}
const listedSpecs = [...specsUnder('packages'), ...specsUnder('internal')];
// What the WebKit legs run for a change: nothing outside the scope step's
// paths, else what the legs step selects.
const proofs = files =>
  files.some(inScope)
    ? selectProofs({
        listed: listedSpecs,
        changed: files,
        shared: new RegExp(webkit.env.WEBKIT_SHARED_PATHS),
        filters: webkit.env.WEBKIT_SPEC_PATHS.trim().split(/\s+/),
      })
    : [];
const runs = files => proofs(files).length > 0;

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
    // The same gate, and the weekly full run on main as its one dispatch
    // (spec:AST-030 DEC-24).
    expect(webkit.if).toBe(
      chromium.if.replace(
        "github.event_name != 'workflow_dispatch' && always()",
        "(github.event_name != 'workflow_dispatch' || inputs.operation == 'webkit-weekly') && always()",
      ),
    );
    expect(ungated(webkit.if)).toBe(
      "(github.event_name != 'workflow_dispatch' || inputs.operation == 'webkit-weekly') && always() && !cancelled() && needs.room.outputs.full != 'true' && needs.admission.outputs.full != 'true'",
    );
    // Admission too: the Storybook build starts beside it (spec:AST-030 FR16).
    expect(webkit.needs).toEqual([
      'room',
      'admission',
      'heavy-ci',
      'build-storybook',
      'interaction-legs',
      'webkit-weekly-request',
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
      'outside-pull-request': "${{ github.event_name == 'workflow_dispatch' && 'run' || 'skip' }}",
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
      'Leave the proofs to the other legs',
      'Require a leg for every share',
    ]);
    // Every step after the leg count also waits for this leg to have a share.
    const counted = webkit.steps.indexOf(
      step(webkit, "Count this run's WebKit legs"),
    );
    const share = "steps.legs.outputs.runs == 'true'";
    for (const [index, candidate] of webkit.steps.entries()) {
      if (index < 2 || guards.has(candidate.name)) continue;
      const gate = index <= counted ? applies : `${applies} && ${share}`;
      // Only the hint and the evidence upload run after a failed step, and
      // only the proofs and the hint wait for a plan with a spec file in it.
      const planned = "steps.plan.outputs.files != '0'";
      let expected = gate;
      if (candidate.name === 'Run WebKit interaction proofs')
        expected = `${gate} && ${planned}`;
      if (candidate.name === 'Explain a failure on an older head')
        expected = `failure() && ${gate} && steps.plan.outcome == 'success' && ${planned}`;
      if (candidate.name === 'Upload WebKit interaction evidence')
        expected = `always() && ${gate}`;
      expect(candidate.if, candidate.name ?? candidate.uses).toBe(expected);
    }
    expect(step(webkit, 'Leave the proofs to the other legs').if).toBe(
      `${applies} && steps.legs.outputs.runs != 'true'`,
    );
    // A leg whose own count needs more legs than started fails.
    expect(step(webkit, 'Require a leg for every share').if).toBe(
      "steps.scope.outputs.applies == 'true' && fromJSON(steps.legs.outputs.count || '0') > strategy.job-total",
    );
  });

  it('runs the interaction config in WebKit against the exact PR head, or main on the weekly run', () => {
    const checkout = webkit.steps.find(
      candidate =>
        candidate.uses?.startsWith('actions/checkout@') &&
        candidate.with?.path === undefined,
    );
    expect(checkout?.with?.ref).toBe(
      '${{ github.event.pull_request.head.sha || github.sha }}',
    );
    // The image already holds WebKit and its system libraries: no apt step.
    expect(step(webkit, 'Install Playwright WebKit').run).toBe(
      'pnpm install --frozen-lockfile && npx playwright install webkit chromium-headless-shell',
    );
    const run = step(webkit, 'Run WebKit interaction proofs').run;
    expect(run).toContain('--config playwright.interaction.config.ts');
    expect(run).toContain('--project webkit');
    expect(run).not.toContain('--project chromium');
  });

  it("installs Chromium's headless shell when an interaction spec launches Chromium", () => {
    // A changed interaction spec runs in the WebKit legs too, so a spec that
    // launches Chromium (to decode a WebKit recording) needs the shell there.
    const launchesChromium = source => /\bchromium\.launch\(/.test(source);
    expect(launchesChromium('const decoder = await chromium.launch();')).toBe(
      true,
    );
    expect(launchesChromium('await webkit.launch();')).toBe(false);
    const specs = execFileSync(
      'git',
      ['ls-files', '*.interaction.browser.spec.ts'],
      {cwd: root, encoding: 'utf8'},
    )
      .split('\n')
      .filter(Boolean);
    const launchers = specs.filter(file =>
      launchesChromium(fs.readFileSync(path.join(root, file), 'utf8')),
    );
    if (launchers.length > 0) {
      expect(
        step(webkit, 'Install Playwright WebKit').run.split(/\s+/),
        launchers.join(', '),
      ).toContain('chromium-headless-shell');
    }
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
    const run = webkit.env.WEBKIT_SPEC_PATHS;
    const count = step(webkit, "Count this run's WebKit legs").run;
    expect(count).toContain('--shared "$WEBKIT_SHARED_PATHS"');
    expect(count).toContain('-- "${SPEC_PATHS[@]}" > "$selected"');
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
    // SideNav) run for a change to their own folder, not for shared code.
    expect(run).not.toContain('animatedLayoutAdopters');
    expect(run).not.toMatch(/motion\/ /);
    expect(run).not.toContain('CarouselPaging');
    // A component's own code runs that folder's interaction specs, and no
    // shared proof.
    // The folder's specs come from the tree, not a list here, so a new
    // Carousel spec needs no edit to this test.
    const carousel = listedSpecs.filter(file =>
      file.startsWith('packages/core/src/Carousel/'),
    );
    expect(carousel.length).toBeGreaterThan(0);
    expect(
      proofs(['packages/core/src/Carousel/useCarouselPaging.ts']).sort(),
    ).toEqual(carousel.sort());
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
      // The component's code runs its folder's specs; a unit test runs none.
      const listCode = proofs(['packages/core/src/List/ListRow.tsx']);
      expect(listCode.length).toBeGreaterThan(0);
      expect(
        listCode.every(file => file.startsWith('packages/core/src/List/')),
      ).toBe(true);
      expect(
        proofs(['packages/core/src/List/__tests__/ListRow.test.tsx']),
      ).toEqual([]);
    });

    it('lists the changed files for the WebKit plan', () => {
      expect(decide(webkit).with['component-audit']).toBe('true');
      const count = step(webkit, "Count this run's WebKit legs");
      expect(count.env.CHANGED_FILES).toBe(
        '${{ steps.scope.outputs.changed_files_path }}',
      );
      expect(count.run).toContain('--changed "${CHANGED_FILES:-}"');
      // The Chromium legs plan every spec file, with no path filter.
      expect(
        step(chromium, "Plan this leg's interaction proofs").run,
      ).not.toContain(' -- ');
    });

    // Runs a step's script with a stub `node` that prints its arguments, over
    // the legs step's selection, and returns them with the step's outputs.
    function runStep(name, selected, present) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webkit-plan-'));
      try {
        for (const file of present) {
          fs.mkdirSync(path.join(dir, path.dirname(file)), {recursive: true});
          fs.writeFileSync(path.join(dir, file), '');
        }
        fs.mkdirSync(path.join(dir, 'interaction-legs'));
        fs.writeFileSync(
          path.join(dir, 'interaction-legs/selected.txt'),
          selected.map(file => `${file}\n`).join(''),
        );
        const bin = path.join(dir, 'bin');
        fs.mkdirSync(bin);
        fs.writeFileSync(
          path.join(bin, 'node'),
          // `select` prints the selection it was handed; the rest print args.
          '#!/usr/bin/env bash\nif [ "$2" = select ]; then cat "$RUNNER_TEMP/interaction-legs/selected.txt"; else printf "%s\\n" "$@"; fi\n',
          {mode: 0o755},
        );
        const output = path.join(dir, 'output.txt');
        fs.writeFileSync(output, '');
        // The scope checkout the legs step lists the tree from.
        fs.writeFileSync(
          path.join(bin, 'git'),
          '#!/usr/bin/env bash\nexit 0\n',
          {mode: 0o755},
        );
        const script = step(webkit, name)
          .run.replaceAll('${{ steps.legs.outputs.leg }}', '1')
          .replaceAll('${{ steps.legs.outputs.count }}', '2')
          .replaceAll('${{ matrix.leg }}', '1')
          .replaceAll('${{ strategy.job-total }}', '2');
        const out = execFileSync('bash', ['-e', '-c', script], {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            RUNNER_TEMP: dir,
            GITHUB_OUTPUT: output,
            CHANGED_FILES: '',
            WEBKIT_SPEC_PATHS: webkit.env.WEBKIT_SPEC_PATHS,
            WEBKIT_SHARED_PATHS: webkit.env.WEBKIT_SHARED_PATHS,
          },
        });
        return {
          args: out.trim().split('\n'),
          outputs: fs.readFileSync(output, 'utf8'),
        };
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    }
    const plan = (selected, present) =>
      runStep("Plan this leg's WebKit interaction proofs", selected, present);

    it("plans the selected specs the head has, and the lane's own paths", () => {
      const {args} = plan(['packages/core/src/gestures/', spec], [spec]);
      const paths = args.slice(args.indexOf('--') + 1);
      expect(paths).toEqual(['packages/core/src/gestures/', spec]);
    });

    it('leaves out a spec the pull request deletes', () => {
      const deleted =
        'packages/core/src/List/__tests__/Old.interaction.browser.spec.ts';
      const {args} = plan([deleted, 'internal/interaction-harness/'], []);
      expect(args).not.toContain(deleted);
      expect(args.at(-1)).toBe('internal/interaction-harness/');
    });

    it('plans no file, and never every spec, when the head has none of the selected specs', () => {
      const deleted =
        'packages/core/src/List/__tests__/Old.interaction.browser.spec.ts';
      const {args, outputs} = plan([deleted], []);
      expect(outputs).toContain('files=0');
      expect(args.join('\n')).not.toContain(' plan');
    });

    it('runs no leg when the selection is empty', () => {
      const {outputs} = runStep("Count this run's WebKit legs", [], []);
      expect(outputs).toContain('count=0');
      expect(outputs).toContain('runs=false');
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
      // The input hold is moving to read the modal outlet's host checks, which
      // brings the outlet into the gesture fixtures and the pager bundle; the
      // scope covers it before that import lands.
      'packages/core/src/Layer/modalOutlet.ts',
      // The animated-layout glide reads its timing through the theme-timing
      // reader, which resolves token references, so its bundle carries them.
      'packages/core/src/theme/tokenReferences.ts',
      'packages/core/src/hooks/useMenuPress.ts',
      'packages/core/src/hooks/menuPressGesture.ts',
      'packages/core/src/hooks/useLongPress.ts',
      'packages/core/src/hooks/usePressFeedback.ts',
      'packages/core/src/hooks/usePager.ts',
      'packages/core/src/hooks/useIsomorphicLayoutEffect.ts',
      'packages/core/src/hooks/useAttachment.ts',
      'packages/core/src/utils/sharedResizeObserver.ts',
      'packages/core/src/utils/scrollView.ts',
      // The gesture host reads how old an input is, so the gesture specs'
      // fixture bundles it.
      'packages/core/src/utils/inputAge.ts',
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
      expect(runs([touched]), touched).toBe(true);
    }
  });

  it('runs every interaction spec of a component folder whose code changes, in every package', () => {
    const folderOf = file =>
      /^(packages\/[^/]+\/src\/[A-Z][^/]*)\//.exec(file)?.[1];
    const folders = [...new Set(listedSpecs.map(folderOf).filter(Boolean))];
    // Lab's own proofs too, not only Core's. A pull request that changes
    // only Lab takes the Lab-only lane, which runs no interaction proofs
    // (spec:AST-030 FR26), so Lab's folders run beside a change outside Lab.
    expect(folders).toContain('packages/lab/src/RefreshControl');
    for (const folder of folders) {
      const change = `${folder}/Changed.tsx`;
      expect(inScope(change), change).toBe(true);
      const own = listedSpecs.filter(file => folderOf(file) === folder);
      expect(proofs([change]), folder).toEqual(expect.arrayContaining(own));
    }
  });

  it('runs nothing for everything else, including components with no interaction spec', () => {
    for (const untouched of [
      'packages/core/src/Selector/useSelectorPresentation.ts',
      'packages/core/src/utils/focusReturn.ts',
      'packages/core/src/internal/focus.ts',
      'packages/core/locales/en.json',
      'packages/core/package.json',
      'packages/themes/neutral/package.json',
      'docs/specs/AST-030/spec.md',
      '.github/workflows/release.yml',
    ]) {
      expect(runs([untouched]), untouched).toBe(false);
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
    // #9016 (Toast timer) runs Toast's own proofs, and only those.
    const toast = proofs([
      '.changeset/toast-pause-sources.md',
      'packages/core/src/Toast/Toast.tsx',
      'packages/core/src/Toast/ToastViewport.test.tsx',
      'docs/specs/components/Toast/Toast.spec.md',
    ]);
    expect(toast.length).toBeGreaterThan(0);
    expect(
      toast.every(file => file.startsWith('packages/core/src/Toast/')),
    ).toBe(true);
    // #9025 (TextArea counter), #9048 (CI cache).
    for (const files of [
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
