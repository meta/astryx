// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Release branch authority regression tests.
 *
 * @input  synthetic active markers, plans, package versions, and branch heads
 * @output proofs that only one exact marked release branch can gate or publish
 * @position focused safety suite for the release-branch CI contract
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {afterEach, describe, expect, it} from 'vitest';
import {
  createRepository,
  importCommits,
  workingTreeFiles,
} from '../lib/git-fixture.mjs';
import {isValidatedPreviousReleaseMergeBack} from './changeset-coverage.mjs';
import {
  buildMarker,
  buildPlan,
  canaryEligibility,
  changedStatementsFromDiff,
  declaredVersionAtRef,
  isReleaseTestRepairPath,
  latestStableVersion,
  mergeBackEntries,
  nextPlannedVersion,
  validateReleaseDiff,
  validateReleaseTestRepair,
  validateHistoricalReleaseMergeBack,
  validateReleaseMergeBack,
  validateReleaseState,
  writeAuthority,
} from './active-release.mjs';

const CUT = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const NEXT_HEAD = '3'.repeat(40);
const BRANCH = 'release/v0.6.5';
const roots = [];

function fixture({withChangeset = false, changesetText = null} = {}) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-release-authority-'),
  );
  roots.push(root);
  fs.mkdirSync(path.join(root, '.changeset'), {recursive: true});
  fs.mkdirSync(path.join(root, 'packages/core'), {recursive: true});
  fs.writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  fs.writeFileSync(
    path.join(root, 'packages/core/package.json'),
    JSON.stringify({name: '@astryxdesign/core', version: '0.6.5'}, null, 2),
  );
  fs.writeFileSync(path.join(root, '.changeset/README.md'), '# Changesets\n');
  if (withChangeset) {
    fs.writeFileSync(
      path.join(root, '.changeset/in-cut.md'),
      changesetText ??
        "---\n'@astryxdesign/core': patch\n---\n\n[fix] Included\n@person\n",
    );
  }
  const plan = buildPlan({root, version: '0.6.5', branch: BRANCH, cutSha: CUT});
  const marker = buildMarker(plan);
  if (withChangeset) fs.rmSync(path.join(root, '.changeset/in-cut.md'));
  return {root, plan, marker};
}

function git(root, ...args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
}

/**
 * A committed fixture whose fixed group declares `version` at the cut commit,
 * the way main's package.json does at a release cut.
 */
function cutFixture(version = '0.6.5') {
  const state = fixture({withChangeset: true});
  const {root} = state;
  fs.writeFileSync(
    path.join(root, '.changeset/config.json'),
    JSON.stringify({fixed: [['@astryxdesign/core']]}),
  );
  fs.writeFileSync(
    path.join(root, 'packages/core/package.json'),
    JSON.stringify({name: '@astryxdesign/core', version}, null, 2),
  );
  fs.writeFileSync(
    path.join(root, '.changeset/in-cut.md'),
    "---\n'@astryxdesign/core': patch\n---\n\n[fix] Included\n@person\n",
  );
  const {cut} = createRepository(root, [
    {
      ref: 'refs/heads/main',
      name: 'cut',
      message: 'cut',
      snapshot: true,
      files: workingTreeFiles(root),
    },
  ]);
  return {...state, cutSha: cut};
}

function validate(state, overrides = {}) {
  return validateReleaseState({
    ...state,
    mode: 'check',
    releaseBranch: BRANCH,
    releaseVersion: state.marker.version,
    releaseTag: `v${state.marker.version}`,
    expectedPlanDigest: state.marker.planDigest,
    refName: BRANCH,
    expectedHead: HEAD,
    checkoutSha: HEAD,
    remoteHead: HEAD,
    activeBranches: [BRANCH],
    ...overrides,
  });
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

describe('generated cut-time release description', () => {
  it('freezes the authoring data already present in each Changeset', () => {
    const changesetText = `---
'@astryxdesign/core': minor
'@astryxdesign/cli': minor
---

[breaking] Remove the old surface

The old surface stops working; use the replacement.

Migration: run the upgrade command.

@person @other
`;
    const {plan} = fixture({withChangeset: true, changesetText});

    expect(plan.schemaVersion).toBe(2);
    expect(plan.changesets).toEqual([
      {
        path: '.changeset/in-cut.md',
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        packages: [
          {name: '@astryxdesign/core', bump: 'minor'},
          {name: '@astryxdesign/cli', bump: 'minor'},
        ],
        category: 'breaking',
        headline: 'Remove the old surface',
        contributors: ['person', 'other'],
        body:
          'The old surface stops working; use the replacement.\n\n' +
          'Migration: run the upgrade command.',
      },
    ]);
  });

  it('fails closed when frozen authoring data is incomplete', () => {
    const state = fixture({withChangeset: true});
    const plan = {
      ...state.plan,
      changesets: [{...state.plan.changesets[0], headline: ''}],
    };
    const marker = buildMarker(plan);

    expect(validate({...state, plan, marker})).toContain(
      'plan has no headline for .changeset/in-cut.md',
    );
  });
});

describe('one branch per release lifecycle', () => {
  const identity = cutSha => ({
    version: '0.6.5',
    branch: BRANCH,
    'cut-sha': cutSha,
  });

  it('allows an explicit plan revision only within the same active identity', () => {
    const {root, cutSha} = cutFixture();
    const values = identity(cutSha);
    writeAuthority(root, values, false);
    const original = JSON.parse(
      fs.readFileSync(path.join(root, '.release/active.json'), 'utf8'),
    );

    fs.writeFileSync(
      path.join(root, '.changeset/authorized-revision.md'),
      "---\n'@astryxdesign/core': patch\n---\n\n[fix] Authorized revision\n@person\n",
    );
    writeAuthority(root, values, true);
    const revised = JSON.parse(
      fs.readFileSync(path.join(root, '.release/active.json'), 'utf8'),
    );
    expect(revised.planDigest).not.toBe(original.planDigest);
    expect(() =>
      writeAuthority(
        root,
        {...values, version: '0.6.6', branch: 'release/v0.6.6'},
        true,
      ),
    ).toThrow(
      /main declares 0\.6\.5 at the cut|release refresh cannot change version/,
    );
    const {later} = importCommits(root, [
      {
        ref: 'refs/heads/main',
        name: 'later',
        parent: 'refs/heads/main',
        message: 'later',
      },
    ]);
    expect(() =>
      writeAuthority(root, {...values, 'cut-sha': later}, true),
    ).toThrow('release refresh cannot change cutSha');
  });

  it('never revives or recreates a closed branch lifecycle', () => {
    const {root, cutSha} = cutFixture();
    const values = identity(cutSha);
    writeAuthority(root, values, false);
    const markerPath = path.join(root, '.release/active.json');
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    fs.writeFileSync(
      markerPath,
      `${JSON.stringify({...marker, state: 'closed'})}\n`,
    );

    expect(() => writeAuthority(root, values, true)).toThrow(
      'marker state must be active',
    );
    expect(() => writeAuthority(root, values, false)).toThrow(
      'release branch cannot be reused',
    );
  });

  it('requires a new version when the immutable tag already exists', () => {
    const {root, cutSha} = cutFixture();
    git(root, 'tag', 'v0.6.5');

    expect(() => writeAuthority(root, identity(cutSha), false)).toThrow(
      'use a new release branch and version',
    );
  });

  it("binds the release version to main's declared version at the cut", () => {
    // A pre-bumped main that declares 0.7.0 cuts 0.7.0. Nothing may compute a
    // different version from the pending Changesets.
    const {root, cutSha} = cutFixture('0.7.0');
    expect(declaredVersionAtRef(root, cutSha)).toEqual({
      version: '0.7.0',
      errors: [],
    });
    expect(() =>
      writeAuthority(
        root,
        {version: '0.8.0', branch: 'release/v0.8.0', 'cut-sha': cutSha},
        false,
      ),
    ).toThrow(
      'main declares 0.7.0 at the cut, so the release is 0.7.0, not 0.8.0',
    );
    expect(() =>
      writeAuthority(
        root,
        {version: '0.6.5', branch: BRANCH, 'cut-sha': cutSha},
        false,
      ),
    ).toThrow('main declares 0.7.0 at the cut');
    expect(fs.existsSync(path.join(root, '.release/active.json'))).toBe(false);

    writeAuthority(
      root,
      {version: '0.7.0', branch: 'release/v0.7.0', 'cut-sha': cutSha},
      false,
    );
    const marker = JSON.parse(
      fs.readFileSync(path.join(root, '.release/active.json'), 'utf8'),
    );
    expect(marker.version).toBe('0.7.0');
  });
});

describe('active release branch authority', () => {
  it('accepts one marked active branch at its exact head', () => {
    expect(validate(fixture())).toEqual([]);
  });

  it('requires explicit version and plan authority for the final branch gate', () => {
    const state = fixture();
    expect(validate(state, {releaseVersion: undefined})).toContain(
      'release check requires release-version',
    );
    expect(validate(state, {expectedPlanDigest: undefined})).toContain(
      'release check requires plan-digest',
    );
  });

  it('ignores post-cut main package and Changeset activity', () => {
    const state = fixture();
    fs.mkdirSync(path.join(state.root, 'moving-main-snapshot/.changeset'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(state.root, 'moving-main-snapshot/package.json'),
      JSON.stringify({version: '9.9.9'}),
    );
    fs.writeFileSync(
      path.join(state.root, 'moving-main-snapshot/.changeset/later.md'),
      'later main input',
    );
    expect(validate(state)).toEqual([]);
  });

  it('rejects main and an unmarked or wrong release branch', () => {
    const state = fixture();
    expect(validate(state, {refName: 'main'})).toContain(
      'release validation must run from the marked release branch',
    );
    expect(validate(state, {releaseBranch: 'release/v0.6.4'})).toContain(
      'release-branch input does not match marker',
    );
  });

  it('rejects missing or ambiguous active branches', () => {
    const state = fixture();
    expect(validate(state, {activeBranches: []})[0]).toMatch(
      /exactly one active release branch/,
    );
    expect(
      validate(state, {activeBranches: [BRANCH, 'release/v0.6.4']})[0],
    ).toMatch(/exactly one active release branch/);
  });

  it('rejects stale expected heads', () => {
    const state = fixture();
    expect(validate(state, {checkoutSha: NEXT_HEAD})).toContain(
      'checked-out commit does not match expected head',
    );
    expect(validate(state, {remoteHead: NEXT_HEAD})).toContain(
      'release branch moved after the expected head was recorded',
    );
  });

  it('accepts an explicitly updated branch head only with a new receipt', () => {
    const state = fixture();
    expect(validate(state, {remoteHead: NEXT_HEAD})).not.toEqual([]);
    expect(
      validate(state, {
        expectedHead: NEXT_HEAD,
        checkoutSha: NEXT_HEAD,
        remoteHead: NEXT_HEAD,
      }),
    ).toEqual([]);
  });

  it('accepts publication only from the matching immutable tag', () => {
    const state = fixture();
    expect(validate(state, {mode: 'publish', refName: 'v0.6.5'})).toEqual([]);
    expect(validate(state, {mode: 'publish', refName: BRANCH})).toContain(
      'stable publish must run from the version tag',
    );
    expect(validate(state, {mode: 'publish', refName: 'main'})).toContain(
      'stable publish must run from the version tag',
    );
  });

  it('does not let dispatch inputs override marker authority', () => {
    const state = fixture();
    expect(
      validate(state, {
        mode: 'publish',
        refName: 'v0.6.5',
        releaseVersion: '0.6.4',
      }),
    ).toContain('release-version input does not match marker');
    expect(
      validate(state, {
        mode: 'publish',
        refName: 'v0.6.5',
        releaseTag: 'v0.6.4',
      }),
    ).toEqual(
      expect.arrayContaining([
        'release-tag input does not match marker version',
        'checked-out tag does not match release-tag input',
      ]),
    );
    expect(
      validate(state, {
        mode: 'publish',
        refName: 'v0.6.5',
        expectedPlanDigest: 'f'.repeat(64),
      }),
    ).toContain('plan-digest input does not match marker');
  });

  it('rejects package versions that do not match the marked release', () => {
    const state = fixture();
    fs.writeFileSync(
      path.join(state.root, 'packages/core/package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: '0.6.4'}, null, 2),
    );
    expect(validate(state, {mode: 'publish', refName: 'v0.6.5'})).toContain(
      'packages/core/package.json is 0.6.4, expected 0.6.5',
    );
  });

  it('keeps the fast bump lane generated-only', () => {
    expect(
      validateReleaseDiff([
        'D\t.changeset/in-cut.md',
        'M\tpackages/core/package.json',
        'M\tpackages/core/CHANGELOG.md',
        'A\tpackages/cli/assets/codemods/transforms/v0.6.5/index.mjs',
        'M\tpnpm-lock.yaml',
      ]),
    ).toEqual([]);
    expect(
      validateReleaseDiff(['M\tpackages/core/src/Button/Button.tsx']),
    ).toContain(
      'release bump contains a non-generated path: packages/core/src/Button/Button.tsx',
    );
    expect(validateReleaseDiff(['A\t.changeset/post-cut.md'])).toContain(
      'release bump may only delete planned Changesets: .changeset/post-cut.md',
    );
    expect(
      validateReleaseDiff([
        'R100\tpackages/core/CHANGELOG.md\tpackages/core/src/release.ts',
      ]),
    ).toContain(
      'release bump contains a non-generated path: packages/core/src/release.ts',
    );
    expect(
      validateReleaseDiff([
        'R100\tpackages/core/src/release.ts\tpackages/core/CHANGELOG.md',
      ]),
    ).toContain(
      'release bump contains a non-generated path: packages/core/src/release.ts',
    );
    expect(
      validateReleaseDiff([
        'R100\tpackages/core/CHANGELOG.md\tpackages/cli/CHANGELOG.md',
      ]),
    ).toEqual([]);
  });

  it('admits one post-bump test repair whose patch already merged on main', () => {
    const patchId = 'a'.repeat(40);
    const changeDigest = 'c'.repeat(64);
    const sourceCommit = 'b'.repeat(40);
    const valid = {
      entries: [
        'M\tpackages/core/src/BottomSheet/__tests__/BottomSheetRelease.a11y.chromium.spec.ts',
      ],
      changedLines: ['await mouseDrag(page, {duration: 50});'],
      commitCount: 1,
      mergeCommitCount: 0,
      patchId,
      changeDigest,
      mainPatches: new Map([
        [patchId, [{commit: sourceCommit, changeDigest, presentAtMain: true}]],
      ]),
      baseChangesets: new Map(),
    };
    expect(isReleaseTestRepairPath(valid.entries[0].split('\t')[1])).toBe(true);
    expect(
      isReleaseTestRepairPath(
        'packages/cli/assets/codemods/transforms/v0.7.12/__tests__/remove-old-api.test.mjs',
      ),
    ).toBe(false);
    expect(
      isReleaseTestRepairPath(
        'packages/cli/assets/codemods/__tests__/registry.test.mjs',
      ),
    ).toBe(false);
    expect(validateReleaseTestRepair(valid)).toEqual({
      errors: [],
      sourceCommit,
    });
  });

  it('fails closed for any broader or unproven release test repair', () => {
    const patchId = 'a'.repeat(40);
    const changeDigest = 'c'.repeat(64);
    const sourceCommit = 'b'.repeat(40);
    const repair = overrides =>
      validateReleaseTestRepair({
        entries: ['M\tinternal/interaction-harness/runner.ts'],
        changedLines: ['const release = event.timeStamp;'],
        commitCount: 1,
        mergeCommitCount: 0,
        patchId,
        changeDigest,
        mainPatches: new Map([
          [
            patchId,
            [{commit: sourceCommit, changeDigest, presentAtMain: true}],
          ],
        ]),
        baseChangesets: new Map(),
        ...overrides,
      }).errors;

    expect(
      repair({
        entries: [
          'R100\tpackages/core/src/BottomSheet/__tests__/BottomSheetScrimClock.a11y.browser.spec.ts\tpackages/core/src/BottomSheet/__tests__/BottomSheetScrimClock.a11y.browser.spec.ts.disabled',
        ],
      }),
    ).toContain(
      'release test repair may only modify an existing test: R100\tpackages/core/src/BottomSheet/__tests__/BottomSheetScrimClock.a11y.browser.spec.ts\tpackages/core/src/BottomSheet/__tests__/BottomSheetScrimClock.a11y.browser.spec.ts.disabled',
    );
    expect(
      repair({entries: ['A\tpackages/core/src/Button/Button.test.tsx']}),
    ).toContain(
      'release test repair may only modify an existing test: A\tpackages/core/src/Button/Button.test.tsx',
    );
    expect(
      repair({entries: ['M\tpackages/core/src/Button/Button.tsx']}),
    ).toContain(
      'release test repair contains a non-test path: packages/core/src/Button/Button.tsx',
    );
    expect(
      repair({
        entries: ['M\tpackages/core/src/Button/__snapshots__/Button.snap'],
      }),
    ).toContain(
      'release test repair contains a non-test path: packages/core/src/Button/__snapshots__/Button.snap',
    );
    expect(
      repair({
        entries: ['M\tapps/docsite/e2e/theme-showcase.spec.ts'],
      }),
    ).toContain(
      'release test repair contains a non-test path: apps/docsite/e2e/theme-showcase.spec.ts',
    );
    expect(
      repair({
        entries: ['M\tapps/docsite/src/__tests__/routing.test.ts'],
      }),
    ).toContain(
      'release test repair contains a non-test path: apps/docsite/src/__tests__/routing.test.ts',
    );
    for (const line of [
      'expect(dialog).toBeHidden();',
      '.toBeHidden({visible: false});',
      'expectNoA11yViolations(page);',
      'test.skip(true, "flaky");',
      'test.fail();',
      'test.slow();',
      'skip();',
      'ctx.fixme();',
      'testInfo.skip();',
      'test.info().fail();',
      'it.skipIf(process.platform === "darwin")();',
      'describe.runIf(false)();',
      'const timeoutMs = 2_000;',
      'retries: 3,',
      'axe.disableRules(["color-contrast"]);',
      'return;',
      'expect(tree).toMatchSnapshot();',
    ]) {
      expect(repair({changedLines: [line]})).toContain(
        `release test repair changes an assertion, test control, timeout, retry, or snapshot: ${line}`,
      );
    }
    const statementCases = [
      {
        diff: `diff --git a/test.mjs b/test.mjs
--- a/test.mjs
+++ b/test.mjs
@@ -1,6 +1,6 @@
 before();
 await expect.poll(() => count).toBeGreaterThan(
-  0,
+  1,
 );
 after();`,
        expected:
          'await expect.poll(() => count).toBeGreaterThan(\n  1,\n);',
      },
      {
        diff: `diff --git a/test.mjs b/test.mjs
--- a/test.mjs
+++ b/test.mjs
@@ -1,6 +1,6 @@
 before();
 await expect(result).toEqual({
-  value: 1,
+  value: 2,
 });
 after();`,
        expected: 'await expect(result).toEqual({\n  value: 2,\n});',
      },
      {
        diff: `diff --git a/test.mjs b/test.mjs
--- a/test.mjs
+++ b/test.mjs
@@ -1,7 +1,7 @@
 before();
 await expect.poll(() => {
-  return ready;
+  return settled;
 }).toBe(true);
 after();`,
        expected:
          'await expect.poll(() => {\n  return settled;\n}).toBe(true);',
      },
      {
        diff: `diff --git a/test.mjs b/test.mjs
--- a/test.mjs
+++ b/test.mjs
@@ -84,5 +84,5 @@
       children: [
         {type: 'paragraph'},
       ],
-      ordered: false,
+      ordered: true,
     });`,
        expected: '<unbounded changed statement>',
      },
      {
        diff: `diff --git a/test.mjs b/test.mjs
--- a/test.mjs
+++ b/test.mjs
@@ -493,5 +493,5 @@
       brand: {
         light: {
-          accent: neutralPalettes.green.light[25],
+          accent: neutralPalettes.green.light[30],
         },
       },`,
        expected: '<unbounded changed statement>',
      },
    ];
    for (const {diff, expected} of statementCases) {
      const changedStatements = changedStatementsFromDiff(diff);
      expect(changedStatements).toContain(expected);
      expect(repair({changedLines: undefined, changedStatements})).toContain(
        `release test repair changes an assertion, test control, timeout, retry, or snapshot: ${expected}`,
      );
    }
    const portStatements = changedStatementsFromDiff(`diff --git a/test.mjs b/test.mjs
--- a/test.mjs
+++ b/test.mjs
@@ -1,7 +1,7 @@
 /**
  * @file BottomSheetRelease.a11y.chromium.spec.ts
- * @input Built BottomSheet stories and real Chromium touch input (CDP), each
- *   event with its own timestamp
+ * @input Built BottomSheet stories and real Chromium touch and mouse input
+ *   (CDP), each event with its own timestamp
  * @output Browser evidence for the touch release.
  */
@@ -20,5 +20,8 @@
 setup();
+const cdp = await page.context().newCDPSession(page);
+// 150 px in 50 ms is 3,000 px/s, so the mouse release projects past the
+// dismiss line even when event delivery is slow.
+await mouseDrag(cdp, sheet, 150, 50);
 cleanup();`);
    expect(portStatements).not.toContain('<unbounded changed statement>');

    const multiStatementChange = changedStatementsFromDiff(`diff --git a/test.mjs b/test.mjs
--- a/test.mjs
+++ b/test.mjs
@@ -1 +1 @@
-safe(); expect(value).toBe(true);
+safe(); expect(value).toBe(false);`);
    expect(multiStatementChange).toContain('expect(value).toBe(false);');
    expect(
      repair({changedLines: undefined, changedStatements: multiStatementChange}),
    ).toContain(
      'release test repair changes an assertion, test control, timeout, retry, or snapshot: expect(value).toBe(false);',
    );

    expect(
      changedStatementsFromDiff(`diff --git a/test.mjs b/test.mjs
--- a/test.mjs
+++ b/test.mjs
@@ -1 +1 @@
-// @vitest-environment node
+// @vitest-environment jsdom`),
    ).toContain('<unbounded changed statement>');

    expect(repair({commitCount: 2})).toContain(
      'release test repair must contain exactly one non-merge commit',
    );
    expect(repair({mergeCommitCount: 1})).toContain(
      'release test repair must contain exactly one non-merge commit',
    );
    expect(repair({mainPatches: new Map()})).toContain(
      'release test repair does not exactly match a non-merge commit still present on main',
    );
    expect(repair({changeDigest: 'd'.repeat(64)})).toContain(
      'release test repair does not exactly match a non-merge commit still present on main',
    );
    expect(
      repair({
        mainPatches: new Map([
          [
            patchId,
            [
              {
                commit: sourceCommit,
                changeDigest,
                presentAtMain: false,
              },
            ],
          ],
        ]),
      }),
    ).toContain(
      'release test repair does not exactly match a non-merge commit still present on main',
    );
    expect(
      repair({
        baseChangesets: new Map([['.changeset/frozen.md', 'c'.repeat(64)]]),
      }),
    ).toContain(
      'release test repair requires the generated version bump to be merged first',
    );
  });

  it('proves the real git patch against current main without reading a mixed oversized commit', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-release-test-repair-'),
    );
    roots.push(root);
    const testFile =
      'packages/core/src/BottomSheet/__tests__/BottomSheetRelease.a11y.chromium.spec.ts';
    const before =
      'const ready = true;\nawait page.mouse.move(0, 150);\n\n';
    const after = 'const ready = true;\nawait mouseDrag(page);\n\n';
    const {cut} = createRepository(root, [
      {
        ref: 'refs/heads/main',
        name: 'cut',
        snapshot: true,
        files: {
          '.changeset/README.md': '# Changesets\n',
          'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
          'packages/core/package.json': JSON.stringify({
            name: '@astryxdesign/core',
            version: '0.6.5',
          }),
          [testFile]: before,
        },
      },
    ]);
    const plan = {
      schemaVersion: 2,
      version: '0.6.5',
      branch: BRANCH,
      cutSha: cut,
      changesets: [],
    };
    const marker = buildMarker(plan);
    const {
      mainRepair,
      largeMain,
      mixedMain,
      mainRevert,
      releaseBase,
      releaseRepair,
      whitespaceRepair,
    } = importCommits(root, [
      {
        ref: 'refs/heads/main',
        name: 'mainRepair',
        parent: cut,
        files: {[testFile]: after},
      },
      {
        ref: 'refs/heads/main',
        name: 'largeMain',
        parent: 'mainRepair',
        files: {
          [testFile]: `${after}// later main context\n`,
          'large-unrelated.txt': 'x'.repeat(65 * 1024 * 1024),
        },
      },
      {
        ref: 'refs/heads/mixed-main',
        name: 'mixedMain',
        parent: cut,
        files: {
          [testFile]: after,
          'packages/core/src/Button/Button.tsx':
            'export const productChange = true;\n',
        },
      },
      {
        ref: `refs/heads/${BRANCH}`,
        name: 'releaseBase',
        parent: cut,
        files: {
          '.release/active.json': `${JSON.stringify(marker)}\n`,
          '.release/plan.json': `${JSON.stringify(plan)}\n`,
        },
      },
      {
        ref: 'refs/heads/repair',
        name: 'releaseRepair',
        parent: 'releaseBase',
        files: {[testFile]: after},
      },
      {
        ref: 'refs/heads/whitespace-repair',
        name: 'whitespaceRepair',
        parent: 'releaseBase',
        files: {
          [testFile]:
            'const ready = true;\nawait mouse Drag(page);\n\n',
        },
      },
      {
        ref: 'refs/heads/reverted-main',
        name: 'mainRevert',
        parent: 'mainRepair',
        files: {[testFile]: before},
      },
    ]);
    const validator = path.join(import.meta.dirname, 'active-release.mjs');
    const run = (head, mainRef) =>
      execFileSync(
        process.execPath,
        [
          validator,
          'validate-diff',
          '--root',
          root,
          '--base',
          releaseBase,
          '--head',
          head,
          '--main-ref',
          mainRef,
        ],
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
      );

    expect(JSON.parse(run(releaseRepair, largeMain))).toMatchObject({
      kind: 'test-repair',
      sourceCommit: mainRepair,
      files: 1,
    });
    for (const [head, mainRef] of [
      [whitespaceRepair, mainRepair],
      [releaseRepair, mainRevert],
      [releaseRepair, mixedMain],
    ]) {
      try {
        run(head, mainRef);
        throw new Error('expected validation to fail');
      } catch (error) {
        expect(error.stderr).toContain(
          'does not exactly match a non-merge commit still present on main',
        );
      }
    }
  });

  it('admits only an exact reviewed policy bundle onto a predating release branch', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-release-policy-carry-'),
    );
    roots.push(root);
    const validatorFile = 'scripts/release/active-release.mjs';
    const activeTestFile = 'scripts/release/active-release.test.mjs';
    const touchedTestFile = '.github/scripts/touched-components.test.mjs';
    const workflowFile = '.github/workflows/ci.yml';
    const manifestPath = 'scripts/release/policy-carry/v0.6.5.json';
    const patchPath = 'scripts/release/policy-carry/v0.6.5.diff';
    const digest = value =>
      crypto.createHash('sha256').update(value).digest('hex');
    const {cut} = createRepository(root, [
      {
        ref: 'refs/heads/main',
        name: 'cut',
        snapshot: true,
        files: {
          [validatorFile]: 'main generated only\n',
          [activeTestFile]: 'main validator tests\n',
          [touchedTestFile]: 'main workflow contract tests\n',
          [workflowFile]: 'main trusted base\n',
          'packages/core/src/Button/Button.tsx': 'export const Button = 1;\n',
        },
      },
    ]);
    const policyFiles = {
      [validatorFile]: 'generated or proven test repair\n',
      [workflowFile]: 'trusted base plus current main\n',
    };
    const {releaseBase, policyCarry, wrongContent, productCarry} =
      importCommits(root, [
        {
          ref: `refs/heads/${BRANCH}`,
          name: 'releaseBase',
          parent: cut,
          files: {
            [validatorFile]: 'release generated only\n',
            [workflowFile]: 'release trusted base\n',
          },
        },
        {
          ref: 'refs/heads/policy-carry',
          name: 'policyCarry',
          parent: 'releaseBase',
          files: policyFiles,
        },
        {
          ref: 'refs/heads/wrong-content',
          name: 'wrongContent',
          parent: 'releaseBase',
          files: {
            ...policyFiles,
            [workflowFile]: 'almost trusted base plus current main\n',
          },
        },
        {
          ref: 'refs/heads/product-carry',
          name: 'productCarry',
          parent: 'releaseBase',
          files: {
            ...policyFiles,
            'packages/core/src/Button/Button.tsx': 'export const Button = 2;\n',
          },
        },
      ]);
    const patch = execFileSync(
      'git',
      ['diff', '--binary', releaseBase, policyCarry],
      {cwd: root, encoding: 'utf8'},
    );
    const targets = Object.fromEntries(
      Object.keys(policyFiles)
        .sort()
        .map(file => [
          file,
          digest(
            execFileSync('git', ['show', `${policyCarry}:${file}`], {
              cwd: root,
            }),
          ),
        ]),
    );
    const manifest = {
      schemaVersion: 1,
      releaseBranch: BRANCH,
      base: releaseBase,
      patch: patchPath,
      patchSha256: digest(patch),
      targets,
    };
    const {mainPolicy} = importCommits(root, [
      {
        ref: 'refs/heads/main',
        name: 'mainPolicy',
        parent: cut,
        files: {
          [manifestPath]: `${JSON.stringify(manifest)}\n`,
          [patchPath]: patch,
        },
      },
    ]);
    const validator = path.join(import.meta.dirname, 'active-release.mjs');
    const run = (head, {base = releaseBase, source = mainPolicy} = {}) =>
      execFileSync(
        process.execPath,
        [
          validator,
          'validate-policy-carry',
          '--root',
          root,
          '--base',
          base,
          '--head',
          head,
          '--source',
          source,
          '--main-ref',
          source,
          '--manifest',
          manifestPath,
          '--release-branch',
          BRANCH,
        ],
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
      );

    expect(JSON.parse(run(policyCarry))).toMatchObject({
      kind: 'policy-carry',
      source: mainPolicy,
      manifest: manifestPath,
      files: 2,
    });

    const secondPolicyFiles = {
      [validatorFile]: 'bounded validator output\n',
      [activeTestFile]: 'validator regression tests\n',
      [touchedTestFile]: 'fallback workflow contract tests\n',
    };
    const {secondCarry} = importCommits(root, [
      {
        ref: 'refs/heads/second-policy-carry',
        name: 'secondCarry',
        parent: policyCarry,
        files: secondPolicyFiles,
      },
    ]);
    const secondPatch = execFileSync(
      'git',
      ['diff', '--binary', policyCarry, secondCarry],
      {cwd: root, encoding: 'utf8'},
    );
    const secondManifest = {
      schemaVersion: 1,
      releaseBranch: BRANCH,
      base: policyCarry,
      patch: patchPath,
      patchSha256: digest(secondPatch),
      targets: Object.fromEntries(
        Object.keys(secondPolicyFiles)
          .sort()
          .map(file => [
            file,
            digest(
              execFileSync('git', ['show', `${secondCarry}:${file}`], {
                cwd: root,
              }),
            ),
          ]),
      ),
    };
    const {mainSecondPolicy} = importCommits(root, [
      {
        ref: 'refs/heads/main',
        name: 'mainSecondPolicy',
        parent: mainPolicy,
        files: {
          [manifestPath]: `${JSON.stringify(secondManifest)}\n`,
          [patchPath]: secondPatch,
        },
      },
    ]);
    expect(
      JSON.parse(
        run(secondCarry, {
          base: policyCarry,
          source: mainSecondPolicy,
        }),
      ),
    ).toMatchObject({
      kind: 'policy-carry',
      source: mainSecondPolicy,
      manifest: manifestPath,
      files: 3,
    });

    try {
      run(wrongContent);
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error.stderr).toContain(
        `release policy carry file does not match its reviewed bundle: ${workflowFile}`,
      );
    }
    try {
      run(productCarry);
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error.stderr).toContain(
        'release policy carry contains an unauthorized path: packages/core/src/Button/Button.tsx',
      );
    }
  });

  it('binds generated-only deletion to the frozen plan paths and hashes', () => {
    const digest = value => value.repeat(64).slice(0, 64);
    const plan = {
      changesets: [{path: '.changeset/frozen.md', sha256: digest('a')}],
    };
    expect(
      validateReleaseDiff(['D\t.changeset/frozen.md'], {
        plan,
        baseChangesets: new Map([['.changeset/frozen.md', digest('a')]]),
      }),
    ).toEqual([]);
    expect(
      validateReleaseDiff(['D\t.changeset/not-frozen.md'], {
        plan,
        baseChangesets: new Map([
          ['.changeset/frozen.md', digest('b')],
          ['.changeset/not-frozen.md', digest('c')],
        ]),
      }),
    ).toEqual(
      expect.arrayContaining([
        'release bump deletes an unplanned Changeset: .changeset/not-frozen.md',
        'frozen Changeset differs or is missing at branch base: .changeset/frozen.md',
        'release bump did not delete frozen Changeset: .changeset/frozen.md',
        'release branch contains an unplanned Changeset: .changeset/not-frozen.md',
      ]),
    );
  });

  it('binds the plan to the exact Changesets recorded at cut', () => {
    const state = fixture({withChangeset: true});
    expect(validate(state)).toEqual([]);
    fs.writeFileSync(path.join(state.root, '.changeset/later.md'), 'post-cut');
    expect(validate(state)).toContain(
      'versioned release must consume every branch Changeset',
    );
  });
});

describe('published release merge-back (FR50)', () => {
  const digest = value => value.repeat(64).slice(0, 64);
  const corePath = 'packages/core/package.json';
  const themePath = 'packages/themes/neutral/package.json';
  const labPath = 'packages/lab/package.json';
  const fixedNames = new Set([
    '@astryxdesign/core',
    '@astryxdesign/theme-neutral',
  ]);
  const core = version => ({
    name: '@astryxdesign/core',
    version,
    exports: {'.': './dist/index.js', './fonts.css': './dist/fonts.css'},
    files: ['dist', 'fonts.css'],
  });
  const theme = version => ({
    name: '@astryxdesign/theme-neutral',
    version,
    peerDependencies: {'@astryxdesign/core': version, react: '^19.0.0'},
  });
  const lab = pin => ({
    name: '@astryxdesign/lab',
    version: '0.1.9',
    private: true,
    peerDependencies: {'@astryxdesign/core': pin},
  });
  const mainAt = (version, labPin = version) =>
    new Map([
      [corePath, core(version)],
      [themePath, theme(version)],
      [labPath, lab(labPin)],
    ]);
  const plan = {
    changesets: [{path: '.changeset/frozen.md', sha256: digest('a')}],
  };

  function mergeBack({release = '0.7.0', base, head, ...overrides}) {
    return validateReleaseMergeBack({
      entries: ['D\t.changeset/frozen.md', 'M\tpackages/core/CHANGELOG.md'],
      plan,
      baseChangesets: new Map([
        ['.changeset/frozen.md', digest('a')],
        ['.changeset/post-cut.md', digest('c')],
      ]),
      headChangesets: new Map([['.changeset/post-cut.md', digest('c')]]),
      releaseOutputs: new Map([['packages/core/CHANGELOG.md', digest('e')]]),
      headOutputs: new Map([['packages/core/CHANGELOG.md', digest('e')]]),
      releaseVersion: release,
      fixedNames,
      cutManifests: new Map(),
      releaseManifests: new Map(),
      baseManifests: base,
      headManifests: head,
      ...overrides,
    });
  }

  it('returns exact published outputs while leaving main at the released version', () => {
    expect(mergeBack({base: mainAt('0.7.0'), head: mainAt('0.7.0')})).toEqual(
      [],
    );
  });

  it('rejects folding the next plan into merge-back', () => {
    expect(
      mergeBack({base: mainAt('0.7.0'), head: mainAt('0.7.1'), entries: []}),
    ).toEqual(
      expect.arrayContaining([
        `release merge-back changed a current-main manifest outside the published branch: ${corePath}`,
        "release merge-back must preserve main's declaration 0.7.0; found 0.7.1",
      ]),
    );
  });

  it('preserves a newer main plan that landed before merge-back', () => {
    expect(
      mergeBack({base: mainAt('0.7.1'), head: mainAt('0.7.1'), entries: []}),
    ).toEqual([]);
  });

  it('rejects resetting a newer main plan to the released version', () => {
    expect(
      mergeBack({base: mainAt('0.7.1'), head: mainAt('0.7.0'), entries: []}),
    ).toEqual(
      expect.arrayContaining([
        `release merge-back changed a current-main manifest outside the published branch: ${corePath}`,
        "release merge-back must preserve main's declaration 0.7.1; found 0.7.0",
      ]),
    );
  });

  it('rejects a main declaration below the published release', () => {
    expect(
      mergeBack({base: mainAt('0.6.9'), head: mainAt('0.6.9'), entries: []}),
    ).toContain(
      'release merge-back requires current main at or above published v0.7.0; found 0.6.9',
    );
  });

  it('preserves a newer main declaration while applying a published manifest delta', () => {
    const base = mainAt('0.7.1');
    base.set(themePath, {...theme('0.7.1'), scripts: {test: 'post-cut'}});
    const head = structuredClone(base);
    expect(
      mergeBack({
        base,
        head,
        entries: [
          'D\t.changeset/frozen.md',
          `M\t${themePath}`,
          'M\tpackages/core/CHANGELOG.md',
        ],
        cutManifests: new Map([[themePath, theme('0.6.9')]]),
        releaseManifests: new Map([[themePath, theme('0.7.0')]]),
      }),
    ).toEqual([]);
  });

  it('accepts only published release-output renames', () => {
    const from = 'packages/cli/assets/codemods/transforms/next/transform.mjs';
    const to = 'packages/cli/assets/codemods/transforms/v0.7.0/transform.mjs';
    const entries = [
      'D\t.changeset/frozen.md',
      'M\tpackages/core/CHANGELOG.md',
      `R100\t${from}\t${to}`,
    ];
    const releaseOutputs = new Map([
      ['packages/core/CHANGELOG.md', digest('e')],
      [to, digest('g')],
    ]);
    const headOutputs = new Map(releaseOutputs);

    expect(
      mergeBack({
        entries,
        releaseOutputs,
        headOutputs,
        releaseRenames: new Set([`${from}\t${to}`]),
        base: mainAt('0.7.0'),
        head: mainAt('0.7.0'),
      }),
    ).toEqual([]);
    expect(
      mergeBack({
        entries,
        releaseOutputs,
        headOutputs,
        base: mainAt('0.7.0'),
        head: mainAt('0.7.0'),
      }),
    ).toContain(
      `release merge-back rename does not match published branch: ${from} -> ${to}`,
    );
  });

  it('rejects unlisted manifests, lifecycle files, and non-release paths', () => {
    expect(
      mergeBack({
        base: mainAt('0.7.0'),
        head: mainAt('0.7.0'),
        entries: [
          `M\t${corePath}`,
          'M\t.release/active.json',
          'M\tpackages/core/src/Button/Button.tsx',
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        `release merge-back changed a manifest not changed on the published branch: ${corePath}`,
        'release merge-back contains a non-release path: .release/active.json',
        'release merge-back contains a non-release path: packages/core/src/Button/Button.tsx',
      ]),
    );
  });

  it('rejects a published manifest with non-version release changes', () => {
    expect(
      mergeBack({
        base: mainAt('0.7.0'),
        head: mainAt('0.7.0'),
        entries: [`M\t${corePath}`],
        cutManifests: new Map([[corePath, core('0.7.0')]]),
        releaseManifests: new Map([
          [corePath, {...core('0.7.0'), sideEffects: false}],
        ]),
      }),
    ).toContain(
      `published manifest contains a non-version release change: ${corePath}`,
    );
  });

  it('accepts a frozen Changeset already removed from current main', () => {
    expect(
      mergeBack({
        base: mainAt('0.7.0'),
        head: mainAt('0.7.0'),
        entries: ['M\tpackages/core/CHANGELOG.md'],
        baseChangesets: new Map([['.changeset/post-cut.md', digest('c')]]),
        headChangesets: new Map([['.changeset/post-cut.md', digest('c')]]),
      }),
    ).toEqual([]);
  });

  it('preserves a changed frozen path as post-cut work', () => {
    expect(
      mergeBack({
        base: mainAt('0.7.0'),
        head: mainAt('0.7.0'),
        entries: ['M\tpackages/core/CHANGELOG.md'],
        baseChangesets: new Map([
          ['.changeset/frozen.md', digest('z')],
          ['.changeset/post-cut.md', digest('c')],
        ]),
        headChangesets: new Map([
          ['.changeset/frozen.md', digest('z')],
          ['.changeset/post-cut.md', digest('c')],
        ]),
      }),
    ).toEqual([]);
  });

  it('rejects changed post-cut Changesets', () => {
    expect(
      mergeBack({
        base: mainAt('0.7.0'),
        head: mainAt('0.7.0'),
        entries: ['M\t.changeset/post-cut.md'],
        baseChangesets: new Map([
          ['.changeset/frozen.md', digest('z')],
          ['.changeset/post-cut.md', digest('c')],
        ]),
        headChangesets: new Map([['.changeset/post-cut.md', digest('f')]]),
      }),
    ).toEqual(
      expect.arrayContaining([
        'release merge-back may only delete frozen Changesets: .changeset/post-cut.md',
        'release merge-back changed post-cut Changeset: .changeset/frozen.md',
        'release merge-back changed post-cut Changeset: .changeset/post-cut.md',
      ]),
    );
  });

  describe('compared with the merge commit it was built on', () => {
    // A merge-back pull request's merge commit, built on an older main, while
    // main has since gained a file.
    function movedMain() {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-merge-back-'));
      roots.push(root);
      const write = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
        fs.writeFileSync(path.join(root, file), text);
      };
      git(root, 'init', '-q', '-b', 'main');
      git(root, 'config', 'user.name', 'Release Test');
      git(root, 'config', 'user.email', 'release@example.com');
      write('.changeset/frozen.md', 'frozen\n');
      write('packages/core/CHANGELOG.md', '# Changelog\n');
      git(root, 'add', '.');
      git(root, 'commit', '-qm', 'main the merge was built on');
      const builtOn = git(root, 'rev-parse', 'HEAD');
      git(root, 'checkout', '-q', '-b', 'chore/merge-v0.7.0-to-main');
      fs.rmSync(path.join(root, '.changeset/frozen.md'));
      write('packages/core/CHANGELOG.md', '# Changelog\n\n## 0.7.0\n');
      git(root, 'add', '-A');
      git(root, 'commit', '-qm', 'merge back v0.7.0');
      git(root, 'checkout', '-q', 'main');
      write('packages/core/src/Later.tsx', 'export {};\n');
      git(root, 'add', '.');
      git(root, 'commit', '-qm', 'main moves on');
      git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      git(root, 'checkout', '-q', '--detach', builtOn);
      git(
        root,
        'merge',
        '-q',
        '--no-ff',
        '-m',
        'merge ref',
        'chore/merge-v0.7.0-to-main',
      );
      return root;
    }

    it('lists only the merge-back changes against the first parent', () => {
      const root = movedMain();
      const entries = mergeBackEntries(root, 'HEAD^1');
      expect(entries).toEqual([
        'D\t.changeset/frozen.md',
        'M\tpackages/core/CHANGELOG.md',
      ]);
      expect(
        mergeBack({base: mainAt('0.7.0'), head: mainAt('0.7.0'), entries}),
      ).toEqual([]);
    });

    it("reads a later main's new file as a deletion, which fails merge-back", () => {
      const root = movedMain();
      const entries = mergeBackEntries(root, 'origin/main');
      expect(entries).toContain('D\tpackages/core/src/Later.tsx');
      expect(
        mergeBack({
          base: mainAt('0.7.0'),
          head: mainAt('0.7.0'),
          entries,
        }).join('\n'),
      ).toContain('packages/core/src/Later.tsx');
    });

    it.each(['.github/workflows/ci.yml', '.github/workflows/lint.yml'])(
      '%s validates against the merge commit first parent',
      file => {
        const text = fs.readFileSync(
          path.join(import.meta.dirname, '../..', file),
          'utf8',
        );
        const call = text.slice(text.indexOf('validate-merge-back \\'));
        expect(call).toMatch(
          /^validate-merge-back \\\n\s+--root "\$GITHUB_WORKSPACE" \\\n\s+--base HEAD\^1 \\/,
        );
        expect(text).not.toContain('--base origin/main');
      },
    );
  });

  it('replays a closed trusted merge-back against its immutable tag', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-historical-merge-back-'),
    );
    roots.push(root);
    const write = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), text);
    };
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.name', 'Release Test');
    git(root, 'config', 'user.email', 'release@example.com');
    write('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
    write(
      '.changeset/config.json',
      JSON.stringify({fixed: [['@astryxdesign/core']]}),
    );
    write(
      '.changeset/frozen.md',
      "---\n'@astryxdesign/core': patch\n---\n\n[fix] Included\n\n@person\n",
    );
    write(
      'packages/core/package.json',
      JSON.stringify({name: '@astryxdesign/core', version: '0.7.8'}),
    );
    write('packages/core/CHANGELOG.md', '# Changelog\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'cut');
    const cutSha = git(root, 'rev-parse', 'HEAD');

    const plan = buildPlan({
      root,
      version: '0.7.8',
      branch: 'release/v0.7.8',
      cutSha,
    });
    const marker = buildMarker(plan);
    git(root, 'checkout', '-qb', 'release/v0.7.8');
    write('.release/plan.json', JSON.stringify(plan));
    write('.release/active.json', JSON.stringify(marker));
    fs.rmSync(path.join(root, '.changeset/frozen.md'));
    write('packages/core/CHANGELOG.md', '# Changelog\n\n## 0.7.8\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'version packages');
    git(root, 'tag', 'v0.7.8');
    git(root, 'tag', 'v0.7.7');

    git(root, 'checkout', '-q', 'main');
    fs.rmSync(path.join(root, '.changeset/frozen.md'));
    write('packages/core/CHANGELOG.md', '# Changelog\n\n## 0.7.8\n');
    git(root, 'add', '-A');
    git(
      root,
      'commit',
      '-qm',
      'chore: merge v0.7.8 release outputs to main (#1)',
    );
    const head = git(root, 'rev-parse', 'HEAD');

    git(root, 'checkout', '-qb', 'invalid-merge-back', `${head}^`);
    fs.rmSync(path.join(root, '.changeset/frozen.md'));
    write('packages/core/CHANGELOG.md', '# Changelog\n\n## 0.7.8\n');
    write(
      'packages/core/src/Unexpected.tsx',
      'export const unexpected = true;\n',
    );
    git(root, 'add', '-A');
    git(
      root,
      'commit',
      '-qm',
      'chore: merge v0.7.8 release outputs to main (#2)',
    );
    const invalidHead = git(root, 'rev-parse', 'HEAD');
    const subject = 'chore: merge v0.7.8 release outputs to main (#1)';

    // The replay must use the requested historical head, not the current HEAD.
    expect(
      validateHistoricalReleaseMergeBack(root, {
        head,
        releaseRef: 'v0.7.8',
      }),
    ).toEqual([]);
    expect(
      isValidatedPreviousReleaseMergeBack(root, {
        sha: head,
        subject,
        releasedRef: 'v0.7.8',
      }),
    ).toBe(true);
    expect(
      isValidatedPreviousReleaseMergeBack(root, {
        sha: invalidHead,
        subject: 'chore: merge v0.7.8 release outputs to main (#2)',
        releasedRef: 'v0.7.8',
      }),
    ).toBe(false);
    expect(
      isValidatedPreviousReleaseMergeBack(root, {
        sha: head,
        subject: 'chore: merge v0.7.7 release outputs to main (#1)',
        releasedRef: 'v0.7.7',
      }),
    ).toBe(false);
  });

  it('rejects missing frozen deletions and exact-output drift', () => {
    expect(
      mergeBack({
        base: mainAt('0.7.0'),
        head: mainAt('0.7.0'),
        headChangesets: new Map([
          ['.changeset/frozen.md', digest('a')],
          ['.changeset/post-cut.md', digest('c')],
        ]),
        headOutputs: new Map([['packages/core/CHANGELOG.md', digest('f')]]),
      }),
    ).toEqual(
      expect.arrayContaining([
        'release merge-back did not delete frozen Changeset: .changeset/frozen.md',
        'release merge-back output differs from published branch: packages/core/CHANGELOG.md',
      ]),
    );
  });

  it('defaults the separate next plan to patch and admits only an explicit minor', () => {
    expect(nextPlannedVersion('0.7.0')).toBe('0.7.1');
    expect(nextPlannedVersion('0.7.0', '0.7.1')).toBe('0.7.1');
    expect(nextPlannedVersion('0.7.0', '0.8.0')).toBe('0.8.0');
    expect(nextPlannedVersion('0.7.0', '0.7.2')).toBeNull();
    expect(nextPlannedVersion('0.7.0-canary.1')).toBeNull();
  });
});

describe('canary eligibility during release merge-back (FR46)', () => {
  const fixed = new Set(['@astryxdesign/core', '@astryxdesign/cli']);
  const at = (core, cli = core) =>
    new Map([
      ['@astryxdesign/core', {name: '@astryxdesign/core', version: core}],
      ['@astryxdesign/cli', {name: '@astryxdesign/cli', version: cli}],
    ]);

  it('publishes above stable and suppresses the transient equal state', () => {
    expect(
      canaryEligibility({
        fixed,
        releasedVersion: '0.6.8',
        manifests: at('0.6.9'),
      }),
    ).toMatchObject({errors: [], publish: true, declaredVersion: '0.6.9'});
    expect(
      canaryEligibility({
        fixed,
        releasedVersion: '0.6.8',
        manifests: at('0.6.8'),
      }),
    ).toMatchObject({errors: [], publish: false, declaredVersion: '0.6.8'});
  });

  it('refuses a lower or split declaration instead of silently skipping', () => {
    expect(
      canaryEligibility({
        fixed,
        releasedVersion: '0.6.8',
        manifests: at('0.6.7'),
      }).errors,
    ).toContain('canary declaration 0.6.7 is below newest stable v0.6.8');
    expect(
      canaryEligibility({
        fixed,
        releasedVersion: '0.6.8',
        manifests: at('0.6.8', '0.6.9'),
      }).errors[0],
    ).toMatch(/canary needs one plain fixed-group version/);
  });
});

describe('newest stable release selection', () => {
  it('selects the highest vX.Y.Z tag and ignores non-release tags', () => {
    const {root} = cutFixture('0.7.0');
    for (const tag of ['v0.6.5', 'v0.6.7', 'v0.6.6', 'canary-0.8.0'])
      git(root, 'tag', tag);
    expect(latestStableVersion(root)).toBe('0.6.7');
  });
});
