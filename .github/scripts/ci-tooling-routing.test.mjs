// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-tooling-routing.test.mjs
 * @description Pins the first positive CI surface lane: admitted score-ledger
 *   tooling runs Node and lint owners while unrelated UI/browser/build work skips.
 * @input CI and lint workflow YAML.
 * @output Mutation-sensitive assertions for trusted classification, owned work,
 *   fail-closed fallbacks, and historical join jobs.
 * @position Workflow contract for spec:AST-030's first implementation slice.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {ungated} from './ci-pr-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const load = relative => yaml.parse(read(relative));
const ci = load('.github/workflows/ci.yml');
const lint = load('.github/workflows/lint.yml');
const prComment = load('.github/workflows/pr-comment.yml');
const scopeAction = read('.github/actions/test-scope/action.yml');
const TOOLING_FALSE = "steps.scope.outputs.tooling_only != 'true'";
const TOOLING_TRUE = "steps.scope.outputs.tooling_only == 'true'";
const BROAD_ONLY =
  "steps.scope.outputs.docsite_only != 'true' && steps.scope.outputs.spec_only != 'true' && steps.scope.outputs.tooling_only != 'true'";

function step(job, name) {
  return job.steps.find(candidate => candidate.name === name);
}

describe('Node-tooling CI routing', () => {
  it('publishes the tooling output from the trusted-base classifier', () => {
    // ci.yml jobs each run the scope action, which reads the classifier and
    // both dependencies from the PR's base commit, in one GraphQL query.
    expect(scopeAction).toContain('`${pr.base.sha}:${file}`');
    for (const file of [
      '.github/scripts/change-scope.cjs',
      '.github/scripts/knowledge-paths.cjs',
      'scripts/component-packages.cjs',
    ]) {
      expect(scopeAction).toContain(`'${file}'`);
    }
    expect(read('.github/workflows/ci.yml')).not.toContain(
      'node .github/scripts/change-scope.cjs',
    );
    for (const workflow of ['.github/workflows/lint.yml']) {
      const source = read(workflow);
      expect(source).toContain(
        'git show "origin/${{ github.base_ref }}:.github/scripts/change-scope.cjs"',
      );
      expect(source).toContain(
        'git show "origin/${{ github.base_ref }}:.github/scripts/knowledge-paths.cjs"',
      );
      expect(source).toContain(
        'git show "origin/${{ github.base_ref }}:scripts/component-packages.cjs"',
      );
      expect(source).toContain('| node "$CLASSIFIER" --github-output');
      expect(source).not.toContain(
        '| node .github/scripts/change-scope.cjs --github-output',
      );
    }
  });

  it('grants no specialized lane without a merge base or trusted dependency', () => {
    for (const key of ['spec_only', 'docsite_only', 'tooling_only']) {
      expect(scopeAction).toContain(`${key}: 'false',`);
    }
    expect(scopeAction).toContain("full_suite: 'true',");
    for (const workflow of ['.github/workflows/lint.yml']) {
      const source = read(workflow);
      expect(source).toContain(
        'docsite_only=false\\nspec_only=false\\ntooling_only=false',
      );
      expect(source).not.toContain('NON_DOCSITE=');
    }
  });

  it('runs the Node project and required lint owners for tooling', () => {
    const nodeSuite = ci.jobs['test-node'].steps.find(candidate =>
      /\bpnpm test:node\b/.test(candidate.run ?? ''),
    );
    expect(nodeSuite.if).not.toContain('tooling_only');
    expect(
      ci.jobs['test-node'].steps.find(candidate =>
        candidate.uses?.includes('.github/actions/setup'),
      ).if,
    ).not.toContain('tooling_only');

    for (const name of ['Check repository guardrails', 'Run ESLint']) {
      expect(step(lint.jobs.lint, name).if).not.toContain('tooling_only');
    }
  });

  it('skips UI/browser owners but keeps an explicit component N/A reporter', () => {
    const uiSuite = ci.jobs['test-ui'].steps.find(candidate =>
      /^pnpm test:ui\b/.test(candidate.run ?? ''),
    );
    expect(uiSuite.if).toContain(TOOLING_FALSE);
    expect(ungated(ci.jobs['test-build'].if)).toBe(
      "github.event_name != 'workflow_dispatch'",
    );
    expect(
      step(ci.jobs['test-build'], 'Run Build package contracts'),
    ).toMatchObject({
      if: BROAD_ONLY,
      run: 'pnpm test:build',
    });
    // The Build package's owner keeps its contracts, in order: the plugin is
    // built before the cascade guard imports it.
    const rootScripts = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    ).scripts;
    const buildCommands = rootScripts['test:build'].split(' && ');
    expect(buildCommands).toEqual([
      'vitest run packages/build/src/packed-consumer.test.mjs --project node --maxWorkers=1',
      'pnpm -F @astryxdesign/build build',
      'node .github/scripts/theme-layer-cascade.js',
      'ASTRYX_STYLEX_BROWSER=1 vitest run scripts/stylex-module-resolution.browser.test.mjs --project node --maxWorkers=1',
    ]);
    // The vibe-tests fixtures share test-build's Playwright runner.
    for (const name of [
      'Verify canonical setup compositions',
      'Verify guest fixture contrast',
    ]) {
      expect(step(ci.jobs['test-build'], name).if).toBe(BROAD_ONLY);
    }
    // No size-base job: Main keeps the merge base's sizes, and build-storybook
    // builds the base only when Main kept no record.
    expect(ci.jobs['size-base']).toBeUndefined();
    expect(rootScripts['test:theme-family'].split(' && ')).toEqual([
      'pnpm -F @astryxdesign/core build',
      'pnpm -F @astryxdesign/sandbox generate:theme-family',
      'node .github/scripts/theme-family-cascade.js',
    ]);
    const familyCommands = new Map([
      [
        'Install Playwright for theme-family contract',
        'npx playwright install chromium',
      ],
      ['Run the theme-family contract', 'pnpm test:theme-family'],
    ]);
    for (const [name, command] of familyCommands) {
      const ownerStep = step(ci.jobs['test-node'], name);
      // One leg of the sharded Node lane owns the theme-family contract.
      expect(ownerStep.if).toBe(`matrix.shard == 1 && ${BROAD_ONLY}`);
      expect(ownerStep.run).toBe(command);
      expect(step(ci.jobs['test-build'], name)).toBeUndefined();
    }
  });

  it('keeps required build and docsite contexts green without their heavy work', () => {
    expect(
      step(ci.jobs['docsite-test'], 'Skip docsite work for Node tooling').if,
    ).toContain(TOOLING_TRUE);
    for (const name of [
      'Build docsite workspace dependencies',
      'Build the docsite',
      'test-docsite (start the data tests)',
      'test-docsite-e2e (browser contracts)',
    ]) {
      expect(step(ci.jobs['docsite-test'], name).if).toContain(TOOLING_FALSE);
    }

    for (const candidate of [
      ...ci.jobs['build-storybook'].steps,
      ...ci.jobs.typecheck.steps,
    ]) {
      if (
        candidate.id === 'scope' ||
        candidate.with?.path === '.test-scope' ||
        candidate.name === 'Skip heavy work for a specialized lane' ||
        candidate.name === 'Skip typechecks for a specialized lane'
      ) {
        continue;
      }
      if (candidate.run || candidate.uses) {
        expect(candidate.if, candidate.name ?? candidate.run).toContain(
          TOOLING_FALSE,
        );
      }
    }
  });

  it('preserves the historical joins and fails them on owned-lane failure', () => {
    // room only tells test when CI is full (ci-admission.test.mjs).
    expect(ci.jobs.test.needs).toEqual([
      'room',
      'heavy-ci',
      'release-bump',
      'test-ui',
      'test-node',
      'test-build',
      'test-native-swift',
      'pr-interaction',
      'pr-interaction-webkit',
    ]);
    expect(ci.jobs.build.needs).toEqual([
      'room',
      'heavy-ci',
      'build-storybook',
      'typecheck',
    ]);
    const testJoin = step(ci.jobs.test, 'Require expected test-owner outcomes');
    expect(testJoin.run).toBe('node .github/scripts/ci-test-join.mjs');
    expect(ci.jobs.test.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
    // A release-branch pull request is spec-only, but its join still runs to
    // require the release bump's own validation.
    expect(testJoin.if).toBe(
      "steps.scope.outputs.spec_only != 'true' || steps.scope.outputs.release_bump == 'true'",
    );
    expect(testJoin.env).toMatchObject({
      RELEASE_BUMP: '${{ steps.scope.outputs.release_bump }}',
      RELEASE_BUMP_RESULT: '${{ needs.release-bump.result }}',
      DOCSITE_ONLY: '${{ steps.scope.outputs.docsite_only }}',
      SPEC_ONLY: '${{ steps.scope.outputs.spec_only }}',
      TOOLING_ONLY: '${{ steps.scope.outputs.tooling_only }}',
      TEST_UI_RESULT: '${{ needs.test-ui.result }}',
      TEST_NODE_RESULT: '${{ needs.test-node.result }}',
      TEST_BUILD_RESULT: '${{ needs.test-build.result }}',
      TEST_NATIVE_SWIFT_RESULT: '${{ needs.test-native-swift.result }}',
      PR_INTERACTION_RESULT: '${{ needs.pr-interaction.result }}',
      PR_INTERACTION_WEBKIT_RESULT: '${{ needs.pr-interaction-webkit.result }}',
    });
    const buildJoin = step(
      ci.jobs.build,
      'Assert parallel builds succeeded',
    ).run;
    expect(buildJoin).toContain(
      '[ "${{ needs.build-storybook.result }}" = "success" ] || exit 1',
    );
    expect(buildJoin).not.toContain('build-sandbox');
    expect(buildJoin).toContain(
      '[ "${{ needs.typecheck.result }}" = "success" ] || exit 1',
    );
  });

  it("reads the merge base's sizes from main's kept records, building the base only without one", () => {
    const main = load('.github/workflows/deploy.yml');
    expect(step(main.jobs.typecheck, 'Record component sizes').run).toBe(
      'node .github/scripts/analyze-pr.js --main-record --output component-size.json',
    );
    expect(
      step(
        main.jobs.typecheck,
        "Keep this commit's component sizes for PR size reports",
      ).with.name,
    ).toBe('component-size-main-${{ needs.main-commit.outputs.sha }}');
    // Main no longer keeps whole package builds for pull requests.
    expect(
      step(
        main.jobs.typecheck,
        "Keep this commit's package builds for PR size reports",
      ),
    ).toBeUndefined();
    const job = ci.jobs['build-storybook'];
    expect(job.permissions.actions).toBe('read');
    const find = step(job, "Find main's size records for the merge base");
    expect(find['continue-on-error']).toBe(true);
    const download = step(
      job,
      "Download main's component sizes for the merge base",
    );
    expect(download['continue-on-error']).toBe(true);
    expect(download.with.name).toBe(
      'component-size-main-${{ steps.merge-base.outputs.sha }}',
    );
    // The analysis reads the record only when it was downloaded.
    const analyze = step(job, 'Analyze components').run;
    expect(analyze).toContain(
      'if [ -f .component-size-base/component-size.json ]',
    );
    expect(analyze).toContain(
      '--base-record .component-size-base/component-size.json',
    );
    // Only Main's own run on main for the merge-base commit counts, through
    // the shared lookup helper (main-artifact.test.mjs).
    expect(find.with.script).toContain('.github/scripts/lib/main-artifact.cjs');
    expect(find.with.script).toContain('sha: process.env.BASE_SHA');
    // The lookup and download come before the analysis that reads them.
    const names = job.steps.map(entry => entry.name);
    expect(
      names.indexOf("Download main's component sizes for the merge base"),
    ).toBeLessThan(names.indexOf('Analyze components'));
    // Without a record the merge base builds beside the Storybook build, and
    // the analysis waits for it, so every changed component keeps a before
    // size (AST-080 FR8).
    const start = step(job, 'Start building the merge base without a record');
    // Main kept no record, or its download failed: either way the base builds.
    expect(start.if).toContain("steps.component-download.outcome != 'success'");
    expect(download.id).toBe('component-download');
    expect(start.run).toContain(
      'node ../.github/scripts/analyze-pr.js --main-record --output ../.component-size-base/component-size.json',
    );
    expect(start.run).toMatch(/\|\| touch base-build\.failed &$/m);
    expect(
      names.indexOf("Find main's size records for the merge base"),
    ).toBeLessThan(
      names.indexOf('Start building the merge base without a record'),
    );
    expect(
      names.indexOf('Start building the merge base without a record'),
    ).toBeLessThan(names.indexOf('Build packages and Storybook'));
    const wait = step(job, "Wait for the merge base's sizes");
    expect(wait.if).toContain("steps.base-build.outputs.started == 'true'");
    expect(names.indexOf("Wait for the merge base's sizes")).toBeLessThan(
      names.indexOf('Analyze components'),
    );
  });

  it.each([
    ['built', 'base-build.done', true, '::notice title=Merge base built::'],
    [
      'failed',
      'base-build.failed',
      false,
      '::warning title=Merge base not built::',
    ],
  ])('collects a merge base that %s', (_label, marker, kept, message) => {
    const wait = step(
      ci.jobs['build-storybook'],
      "Wait for the merge base's sizes",
    );
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'base-build-'));
    try {
      fs.mkdirSync(path.join(root, '.component-size-base'));
      fs.writeFileSync(
        path.join(root, '.component-size-base/component-size.json'),
        '{}',
      );
      fs.writeFileSync(path.join(root, 'base-build.log'), 'log\n');
      fs.writeFileSync(path.join(root, marker), '');
      const out = execFileSync('bash', ['-e', '-c', wait.run], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(out).toContain(message);
      expect(
        fs.existsSync(
          path.join(root, '.component-size-base/component-size.json'),
        ),
      ).toBe(kept);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it("compares the merge base's API surface from main's kept record, or from a base built for its sizes", () => {
    const main = load('.github/workflows/deploy.yml');
    const record = step(
      main.jobs.typecheck,
      'Record the published API surface',
    );
    expect(record.run).toBe(
      'node scripts/api-report/cli.mjs --surface api-surface',
    );
    // Evidence only (INV24): neither step can fail main's validation.
    expect(record['continue-on-error']).toBe(true);
    const keep = step(
      main.jobs.typecheck,
      "Keep this commit's API surface for PR API changes",
    );
    expect(keep['continue-on-error']).toBe(true);
    expect(keep.with).toMatchObject({
      name: 'api-surface-main-${{ needs.main-commit.outputs.sha }}',
      path: 'api-surface/',
      'retention-days': 14,
    });
    const mainNames = main.jobs.typecheck.steps.map(entry => entry.name);
    expect(
      mainNames.indexOf('Record the published API surface'),
    ).toBeGreaterThan(
      main.jobs.typecheck.steps.findIndex(entry => entry.run === 'pnpm build'),
    );

    const job = ci.jobs['build-storybook'];
    const find = step(job, "Find main's size records for the merge base");
    expect(find.with.script).toContain("['api_run_id', 'api-surface-main'");
    const download = step(
      job,
      "Download main's API surface for the merge base",
    );
    expect(download.id).toBe('api-download');
    expect(download['continue-on-error']).toBe(true);
    expect(download.with).toMatchObject({
      name: 'api-surface-main-${{ steps.merge-base.outputs.sha }}',
      'run-id': '${{ steps.size-records.outputs.api_run_id }}',
      path: '.api-surface-base',
    });
    const start = step(job, 'Start building the merge base without a record');
    // A missing API surface alone starts no build (the API report's budget):
    // the base builds only for a missing size record, and then also writes
    // its API surface when Main kept none and the head can.
    expect(start.if).not.toContain('api-download');
    // The head's API report script runs only in the step guarded for it.
    expect(start.run).not.toContain('scripts/api-report/cli.mjs');
    expect(start.env.NEED_API).toBe(
      "${{ steps.api-download.outcome != 'success' }}",
    );
    expect(start.run).toContain('pnpm -F @astryxdesign/cli sync:api-types');
    const names = job.steps.map(entry => entry.name);
    const at = name => names.indexOf(name);
    expect(at("Download main's API surface for the merge base")).toBeLessThan(
      at('Start building the merge base without a record'),
    );
    expect(at("Wait for the merge base's sizes")).toBeLessThan(
      at('Report API changes'),
    );
    expect(step(job, 'Report API changes')['continue-on-error']).toBe(true);
  });

  // The stub CLI writes a surface when asked for one (or fails to, for a
  // base whose surface cannot be written) and prints the --changes call.
  const stubCli = ({supported, surfaceWrites = true}) =>
    `${supported ? "// '--base-surface'\n" : ''}import fs from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--surface') {
  if (!${surfaceWrites}) process.exit(1);
  fs.mkdirSync(args[1], {recursive: true});
  fs.writeFileSync(args[1] + '/surface.json', JSON.stringify(args));
} else console.log(JSON.stringify(args));
`;

  it.each([
    [
      'main kept',
      {main: true},
      ['--base-surface', '.api-surface-base', '--base-record', 'main'],
    ],
    [
      'of the base this run built for its sizes',
      {built: true},
      ['--base-surface', '.api-surface-build', '--base-record', 'build'],
    ],
    ['nobody kept or built', {}, []],
    [
      'of a built base whose surface cannot be written',
      {built: true, surfaceWrites: false},
      [],
    ],
    ['main kept, for a head predating it,', {main: true, supported: false}, []],
  ])(
    'compares the API changes with the surface %s',
    (
      _label,
      {main = false, built = false, supported = true, surfaceWrites = true},
      extra,
    ) => {
      const report = step(ci.jobs['build-storybook'], 'Report API changes');
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-changes-'));
      try {
        fs.mkdirSync(path.join(root, 'scripts/api-report'), {recursive: true});
        fs.mkdirSync(path.join(root, '.github/scripts'), {recursive: true});
        fs.writeFileSync(
          path.join(root, '.github/scripts/merge-base.sh'),
          'echo abc123\n',
        );
        fs.chmodSync(path.join(root, '.github/scripts/merge-base.sh'), 0o755);
        fs.writeFileSync(
          path.join(root, 'scripts/api-report/cli.mjs'),
          stubCli({supported, surfaceWrites}),
        );
        if (main) {
          fs.mkdirSync(path.join(root, '.api-surface-base'));
          fs.writeFileSync(
            path.join(root, '.api-surface-base/surface.json'),
            '{}',
          );
        }
        if (built) {
          fs.mkdirSync(path.join(root, '.size-base'));
          fs.writeFileSync(path.join(root, 'base-build.done'), '');
        }
        const out = execFileSync('bash', ['-e', '-c', report.run], {
          cwd: root,
          encoding: 'utf8',
          env: {...process.env, BASE_REF: 'main'},
        });
        expect(JSON.parse(out.trim().split('\n').at(-1))).toEqual([
          '--changes',
          '--base',
          'abc123',
          ...extra,
        ]);
        if (built && surfaceWrites && supported)
          expect(
            JSON.parse(
              fs.readFileSync(
                path.join(root, '.api-surface-build/surface.json'),
                'utf8',
              ),
            ),
          ).toEqual([
            '--surface',
            '.api-surface-build',
            '--root',
            '.size-base',
          ]);
      } finally {
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
  );

  it('builds no Sandbox and builds Storybook once per pull-request run', () => {
    // Vercel builds the Sandbox preview; nothing downloaded CI's copy.
    expect(ci.jobs['build-sandbox']).toBeUndefined();
    expect(ci.jobs['build-storybook'].outputs).not.toHaveProperty(
      'sandbox_url',
    );
    const storybookBuilders = Object.entries(ci.jobs).flatMap(([name, job]) =>
      (job.steps ?? [])
        .filter(s =>
          /storybook build|build-packages-and-storybook/.test(s.run ?? ''),
        )
        .filter(
          s => !/^github\.event_name == 'workflow_dispatch'/.test(s.if ?? ''),
        )
        .map(() => name),
    );
    expect(storybookBuilders).toEqual(['build-storybook']);
  });

  it('keeps removed preview publication out of the tooling lane', () => {
    expect(prComment.jobs.resolve.outputs.tooling_only).toContain(
      'steps.identity.outputs.tooling_only',
    );
    expect(prComment.jobs['deploy-preview']).toBeUndefined();
    expect(prComment.jobs.comment.if).toContain(
      "needs.resolve.outputs.tooling_only != 'true'",
    );
    expect(prComment.jobs['spec-only-reconcile'].if).toContain(
      "needs.resolve.outputs.tooling_only == 'true'",
    );
    expect(
      step(prComment.jobs['spec-only-reconcile'], 'Report no visual scope').run,
    ).toContain('canonical visual checks are not applicable');
    expect(prComment.jobs.invalidate).toBeUndefined();
  });
});
