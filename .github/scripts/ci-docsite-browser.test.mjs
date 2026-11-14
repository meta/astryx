// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-docsite-browser.test.mjs
 * @input The docsite-build, docsite-browser and docsite-test jobs in the PR CI
 *   workflow
 * @output Fail-closed coverage for AST-030's docsite owner: one job builds the
 *   docsite once and runs the data tests on it; the browser contracts run on
 *   that same build, never a rebuild; the required docsite-test context passes
 *   only when both did, or when the scope found no browser contract to run.
 * @position Workflow contract over .github/workflows/ci.yml
 */
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {PR_CI_GATE, PR_REPORT_GATE, gated} from './ci-pr-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const {jobs} = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const build = jobs['docsite-build'];
const browser = jobs['docsite-browser'];
const join = jobs['docsite-test'];
const step = (job, name) =>
  job.steps.find(candidate => candidate.name === name);
// A Lab-only change skips the docsite work too (spec:AST-030 FR26).
const ACTIVE =
  "steps.scope.outputs.spec_only != 'true' && steps.scope.outputs.tooling_only != 'true' && steps.scope.outputs.lab_only != 'true'";
const BROWSER_PATHS = new RegExp(
  build.steps.find(s => s.id === 'scope').with.paths,
);

describe('docsite-build', () => {
  it('builds the docsite once and runs the data tests and the registry gate on it', () => {
    expect(build.needs).toEqual(['room', 'admission', 'heavy-ci']);
    expect(build.if).toBe(
      gated(
        "${{ github.event_name != 'workflow_dispatch' && !startsWith(github.base_ref, 'release/v') && !cancelled() && needs.heavy-ci.outputs.deferred != 'true' && needs.room.outputs.full != 'true' && needs.admission.outputs.full != 'true' }}",
        PR_CI_GATE,
      ),
    );
    expect(build.steps.findIndex(s => s.id === 'scope')).toBe(1);
    const builds = Object.values(jobs).flatMap(job =>
      (job.steps ?? []).filter(s =>
        /pnpm -F @astryxdesign\/docsite build/.test(s.run ?? ''),
      ),
    );
    expect(builds).toEqual([step(build, 'Build the docsite')]);
    for (const name of [
      'Build docsite workspace dependencies',
      'Build the docsite',
      "Write the docsite's API surface",
      'test-docsite (data tests)',
      'Verify the hidden production registry gate',
    ]) {
      expect(step(build, name).if, name).toBe(ACTIVE);
      expect(step(build, name)['continue-on-error'], name).toBeUndefined();
    }
    expect(step(build, 'test-docsite (data tests)').run).toBe(
      'pnpm -F @astryxdesign/docsite test',
    );
    // The data tests read the API surface written just before them.
    const names = build.steps.map(s => s.name);
    expect(names.indexOf('test-docsite (data tests)')).toBe(
      names.indexOf("Write the docsite's API surface") + 1,
    );
    expect(step(build, "Write the docsite's API surface").run).toBe(
      'node scripts/api-report/cli.mjs --surface .api-surface-docsite',
    );
    expect(step(build, 'test-docsite (data tests)').env).toEqual({
      ASTRYX_API_SURFACE: '.api-surface-docsite',
    });
  });

  it('builds and tests the docs prompt with placeholder origins only', () => {
    for (const job of [build, browser]) {
      expect(job.env).toEqual({
        NEXT_PUBLIC_INTERNAL_DOCS_ORIGIN: 'https://docs.example.test',
        NEXT_PUBLIC_DOCS_ACCESS_CHECK_ORIGIN: 'https://probe.example.test',
      });
      for (const s of job.steps) {
        expect(s.env?.NEXT_PUBLIC_INTERNAL_DOCS_ORIGIN, s.name).toBeUndefined();
        expect(
          s.env?.NEXT_PUBLIC_DOCS_ACCESS_CHECK_ORIGIN,
          s.name,
        ).toBeUndefined();
      }
    }
  });

  it('skips the browser contracts only for component tests, stories, spec records and changesets that are not shared infrastructure', () => {
    const decide = step(build, 'Decide whether the browser contracts apply');
    expect(decide.run).toBe(
      `echo "applies=\${{ (${ACTIVE}) && (steps.scope.outputs.touches == 'true' || steps.scope.outputs.full_suite == 'true') }}" >> "$GITHUB_OUTPUT"`,
    );
    expect(build.outputs.browser).toBe('${{ steps.browser.outputs.applies }}');
    for (const file of [
      'apps/docsite/src/app/page.tsx',
      'apps/docsite/e2e/header-offset.spec.ts',
      'apps/docsite/src/content/blog/post.md',
      'packages/core/src/Button/Button.tsx',
      'packages/core/src/Button/Button.doc.mjs',
      'packages/core/README.md',
      'packages/themes/neutral/src/theme.ts',
      'pnpm-lock.yaml',
      '.github/workflows/ci.yml',
    ])
      expect(BROWSER_PATHS.test(file), file).toBe(true);
    for (const file of [
      'packages/core/src/Button/__tests__/Button.test.tsx',
      'packages/core/src/Button/Button.test.tsx',
      'packages/core/src/Slider/__tests__/Slider.interaction.browser.spec.ts',
      'apps/storybook/stories/Button.stories.tsx',
      'packages/core/src/Button/Button.stories.tsx',
      'docs/specs/AST-030/spec.md',
      '.changeset/quiet-cats.md',
      'internal/a11y-spec/src/button.ts',
      'internal/interaction-harness/src/harness.ts',
    ])
      expect(BROWSER_PATHS.test(file), file).toBe(false);
  });

  it('uploads the build it made, stamped with its commit, for the browser contracts', () => {
    const stamp = step(build, 'Stamp the build with its commit');
    const upload = step(build, 'Upload the docsite build');
    const order = [
      step(build, 'Build the docsite'),
      step(build, 'Decide whether the browser contracts apply'),
      stamp,
      upload,
    ].map(s => build.steps.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const s of [stamp, upload])
      expect(s.if).toBe("steps.browser.outputs.applies == 'true'");
    expect(stamp.run.split('\n')[0]).toBe(
      'git rev-parse HEAD > apps/docsite/.next/BUILD_COMMIT',
    );
    expect(upload.with.name).toBe('docsite-build');
    expect(upload.with.path.trim().split('\n')).toEqual([
      'apps/docsite/.next/',
      '!apps/docsite/.next/cache/',
      '!apps/docsite/.next/trace',
      '!apps/docsite/.next/trace-build',
      '!apps/docsite/.next/diagnostics/',
      '!apps/docsite/.next/types/',
      '!apps/docsite/.next/**/*.map',
      '!apps/docsite/.next/**/*.nft.json',
      'apps/docsite/src/generated/',
      'apps/docsite/src/themes/astryx.js',
      'apps/docsite/src/themes/astryx.css',
      'apps/docsite/public/playground-types.json',
      'apps/docsite/public/monaco/',
      'apps/docsite/public/vendor/',
      'apps/docsite/public/shadcn/',
    ]);
    expect(upload.with['if-no-files-found']).toBe('error');
    expect(upload.with.overwrite).toBe(true);
    expect(upload.with['retention-days']).toBe(1);
    expect(upload.with['compression-level']).toBe(6);
  });
});

describe('shared infrastructure runs the browser contracts', () => {
  const {classifyChanges} = createRequire(import.meta.url)(
    './change-scope.cjs',
  );
  const applies = filenames => {
    const touches = filenames.some(file => BROWSER_PATHS.test(file));
    return (
      touches ||
      classifyChanges(filenames.map(filename => ({filename}))).fullSuite
    );
  };

  it('runs them for a harness, a11y-spec, Storybook config or shared test change, each alone', () => {
    for (const file of [
      'internal/interaction-harness/src/busy.ts',
      'internal/a11y-spec/src/button.ts',
      'apps/storybook/.storybook/preview.tsx',
      '.github/scripts/ci-admission.test.mjs',
    ])
      expect(applies([file]), file).toBe(true);
  });

  it('skips them for component tests, stories, spec records and changesets alone', () => {
    expect(
      applies([
        'packages/core/src/Button/__tests__/Button.test.tsx',
        'apps/storybook/stories/Button.stories.tsx',
        'docs/specs/AST-030/spec.md',
        '.changeset/quiet-cats.md',
      ]),
    ).toBe(false);
  });
});

describe('docsite-browser', () => {
  it('runs only on a build that succeeded and found contracts to run', () => {
    expect(browser.needs).toEqual(['docsite-build']);
    expect(browser.if).toBe(
      gated(
        "${{ !cancelled() && needs.docsite-build.result == 'success' && needs.docsite-build.outputs.browser == 'true' }}",
        PR_CI_GATE,
      ),
    );
    expect(browser.strategy).toEqual({'fail-fast': false, matrix: {leg: [1]}});
    expect(browser.name).toBe(
      'docsite-browser (${{ matrix.leg }}/${{ strategy.job-total }})',
    );
  });

  it('serves the downloaded build of the same commit, never a build of its own', () => {
    const download = step(browser, 'Download the docsite build');
    const check = step(browser, 'Require the build of this commit');
    const plan = step(browser, "Plan this leg's browser contracts");
    const run = step(browser, 'test-docsite-e2e (browser contracts)');
    const order = [download, check, plan, run].map(s =>
      browser.steps.indexOf(s),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(download.uses).toMatch(/^actions\/download-artifact@/);
    expect(download.with).toEqual({
      name: 'docsite-build',
      path: 'apps/docsite',
    });
    expect(check.run).toContain('built=$(cat apps/docsite/.next/BUILD_COMMIT)');
    expect(check.run).toContain('test "$built" = "$here"');
    // The checkout is the commit the build job checked out: no ref.
    expect(browser.steps[0]).toEqual({uses: 'actions/checkout@v7', 'timeout-minutes': 8});
    expect(
      browser.steps.some(s => /docsite build|next build/.test(s.run ?? '')),
    ).toBe(false);
    expect(plan.run).toContain('node .github/scripts/playwright-legs.mjs plan');
    expect(plan.run).toContain(
      '--key docsite --config apps/docsite/playwright.config.ts',
    );
    expect(plan.run).toContain(
      '--leg ${{ matrix.leg }} --of ${{ strategy.job-total }}',
    );
    expect(run.if).toBe("steps.plan.outputs.files != '0'");
    expect(run.run).toBe(
      'pnpm test:docsite-browser --test-list "$RUNNER_TEMP/docsite-leg.txt"',
    );
  });

  it('the commit check fails on another commit\u2019s build', () => {
    const check = step(browser, 'Require the build of this commit').run;
    const dir = fs.mkdtempSync(path.join(root, 'node_modules/.cache-docsite-'));
    try {
      fs.mkdirSync(path.join(dir, 'apps/docsite/.next'), {recursive: true});
      const runIn = commit => {
        fs.writeFileSync(
          path.join(dir, 'apps/docsite/.next/BUILD_COMMIT'),
          `${commit}\n`,
        );
        fs.writeFileSync(path.join(dir, 'git'), '#!/bin/sh\necho aaaa\n', {
          mode: 0o755,
        });
        return spawnSync('bash', ['-e', '-c', check], {
          cwd: dir,
          env: {...process.env, PATH: `${dir}:${process.env.PATH}`},
        }).status;
      };
      expect(runIn('aaaa')).toBe(0);
      expect(runIn('bbbb')).not.toBe(0);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('uploads the explicit browser output directory and fails if evidence is missing', () => {
    const configPath = path.join(root, 'apps/docsite/playwright.config.ts');
    const config = fs.readFileSync(configPath, 'utf8');
    const outputDir = config.match(/outputDir:\s*'([^']+)'/)?.[1];
    expect(outputDir).toBe('../../test-results/docsite');
    const upload = step(browser, 'Upload docsite browser evidence');
    expect(upload.if).toBe(
      "always() && steps.plan.outcome == 'success' && steps.plan.outputs.files != '0'",
    );
    expect(upload.with.name).toBe('docsite-browser-evidence-${{ matrix.leg }}');
    expect(upload.with['if-no-files-found']).toBe('error');
    expect(path.resolve(root, upload.with.path)).toBe(
      path.resolve(path.dirname(configPath), outputDir),
    );
  });
});

describe('docsite-test, the required join', () => {
  it('reports for every pull request, behind only the draft skip', () => {
    expect(join.needs).toEqual([
      'room',
      'admission',
      'heavy-ci',
      'docsite-build',
      'docsite-browser',
    ]);
    expect(join.if).toBe(
      gated(
        "${{ github.event_name != 'workflow_dispatch' && !startsWith(github.base_ref, 'release/v') && !cancelled() }}",
        PR_REPORT_GATE,
      ),
    );
    expect(join.steps.slice(0, 3).map(s => s.name)).toEqual([
      'Require a branch in this repository or the ci:run label',
      'Stop when CI is full',
      'Heavy CI deferred',
    ]);
    expect(join['runs-on']).toBe('ubuntu-slim');
  });

  const decide = step(
    join,
    'Require the docsite build and its browser contracts',
  );
  const passes = (build, browserApplies, browserResult) =>
    spawnSync('bash', ['-e', '-c', decide.run], {
      env: {
        PATH: process.env.PATH,
        BUILD_RESULT: build,
        BROWSER: browserApplies,
        BROWSER_RESULT: browserResult,
      },
    }).status === 0;

  it('reads the build, whether contracts apply, and the browser legs\u2019 whole result', () => {
    expect(decide.env).toEqual({
      BUILD_RESULT: '${{ needs.docsite-build.result }}',
      BROWSER: '${{ needs.docsite-build.outputs.browser }}',
      BROWSER_RESULT: '${{ needs.docsite-browser.result }}',
    });
  });

  it('passes on a passed build with passed contracts, or with none to run', () => {
    expect(passes('success', 'true', 'success')).toBe(true);
    expect(passes('success', 'false', 'skipped')).toBe(true);
  });

  it('fails on a failed, cancelled or skipped leg, a failed build, or an unknown scope', () => {
    for (const result of ['failure', 'cancelled', 'skipped', ''])
      expect(passes('success', 'true', result), `browser ${result}`).toBe(
        false,
      );
    for (const result of ['failure', 'cancelled', 'skipped', ''])
      expect(passes(result, 'false', 'skipped'), `build ${result}`).toBe(false);
    expect(passes('success', '', 'skipped')).toBe(false);
    expect(passes('success', 'false', 'cancelled')).toBe(false);
  });
});
