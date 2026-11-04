// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Release branch authority regression tests.
 *
 * @input  synthetic active markers, plans, package versions, and branch heads
 * @output proofs that only one exact marked release branch can gate or publish
 * @position focused safety suite for the release-branch CI contract
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {afterEach, describe, expect, it} from 'vitest';
import {
  buildMarker,
  buildPlan,
  canaryEligibility,
  declaredVersionAtRef,
  latestStableVersion,
  nextPlannedVersion,
  validateReleaseDiff,
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
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Release Test');
  git(root, 'config', 'user.email', 'release@example.com');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'cut');
  return {...state, cutSha: git(root, 'rev-parse', 'HEAD')};
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
    git(root, 'commit', '-qm', 'later', '--allow-empty');
    expect(() =>
      writeAuthority(
        root,
        {...values, 'cut-sha': git(root, 'rev-parse', 'HEAD')},
        true,
      ),
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

  it('rejects changed post-cut Changesets and missing frozen bytes', () => {
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
        'release merge-back cannot verify frozen Changeset on current main: .changeset/frozen.md',
        'release merge-back changed post-cut Changeset: .changeset/post-cut.md',
      ]),
    );
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
