// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.parse(
  fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8'),
);
const ci = yaml.parse(
  fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'),
);
const lint = yaml.parse(
  fs.readFileSync(path.join(ROOT, '.github/workflows/lint.yml'), 'utf8'),
);
const stable = workflow.jobs.publish;
const canary = workflow.jobs.canary;
const step = (job, name) =>
  job.steps.find(candidate => candidate.name === name);

function writeJson(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function writeExecutable(root, name, contents) {
  const file = path.join(root, 'bin', name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, contents);
  fs.chmodSync(file, 0o755);
}

/**
 * Copies the real per-package publisher into a scratch root and returns the
 * environment that runs it quickly: an unreachable registry (every read is
 * unknown, so nothing is skipped) and no waits between attempts.
 */
function withPublisher(root) {
  for (const file of ['publish-package.mjs', 'registry.mjs']) {
    const target = path.join(root, 'scripts/npm', file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(ROOT, 'scripts/npm', file), target);
  }
  return {
    ASTRYX_PUBLISH_REGISTRY: 'http://127.0.0.1:9',
    ASTRYX_PUBLISH_WAITS_MS: '0',
  };
}

// A pnpm stand-in: logs each call; FAIL_PACKAGE always fails, FAIL_ONCE
// fails its first publish only (the transparency log's 409, then success).
const PNPM_STUB =
  '#!/bin/sh\nprintf "%s\\n" "$*" >> "$PUBLISH_LOG"\n' +
  '[ -z "$FAIL_PACKAGE" ] || case "$*" in *"$FAIL_PACKAGE"*) exit 1;; esac\n' +
  'if [ -n "$FAIL_ONCE" ]; then case "$*" in *"$FAIL_ONCE"*)\n' +
  '  [ -f "$PUBLISH_LOG.once" ] || { : > "$PUBLISH_LOG.once"; echo "(409) an equivalent entry already exists in the transparency log" >&2; exit 1; };;\n' +
  'esac; fi\n';

function runCanaryPublish({
  httpStatus,
  curlExitCode = '0',
  failingPackage = '',
  failOnce = '',
}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-canary-publish-'));
  const publishLog = path.join(root, 'publish.log');
  try {
    writeJson(root, 'packages/core/package.json', {
      name: '@astryxdesign/core',
      version: '0.7.4',
    });
    writeJson(root, 'packages/native/package.json', {
      name: '@astryxdesign/native',
      version: '0.1.0',
      private: true,
      astryx: {canaryOnly: true},
    });
    writeJson(root, 'packages/themes/neutral/package.json', {
      name: '@astryxdesign/theme-neutral',
      version: '0.7.4',
    });
    writeExecutable(
      root,
      'curl',
      '#!/bin/sh\nprintf %s "$NATIVE_HTTP_STATUS"\nexit "$CURL_EXIT_CODE"\n',
    );
    writeExecutable(root, 'pnpm', PNPM_STUB);
    const publisherEnv = withPublisher(root);

    const runnerTemp = path.join(root, 'runner-temp');
    fs.mkdirSync(runnerTemp, {recursive: true});
    const result = spawnSync(
      'bash',
      ['-c', step(canary, 'Publish canary versions').run],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...publisherEnv,
          CURL_EXIT_CODE: curlExitCode,
          FAIL_ONCE: failOnce,
          FAIL_PACKAGE: failingPackage,
          GITHUB_SHA: 'abcdef1234567890',
          NATIVE_HTTP_STATUS: httpStatus,
          PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
          PUBLISH_LOG: publishLog,
          RUNNER_TEMP: runnerTemp,
        },
      },
    );
    return {
      ...result,
      published: fs.existsSync(publishLog)
        ? fs.readFileSync(publishLog, 'utf8')
        : '',
    };
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

/** Runs the stable publish step over two packages with stubbed npm and pnpm. */
function runStablePublish({failingPackage = '', failOnce = ''} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-stable-publish-'));
  const publishLog = path.join(root, 'publish.log');
  try {
    writeJson(root, 'packages/core/package.json', {
      name: '@astryxdesign/core',
      version: '0.7.7',
    });
    writeJson(root, 'packages/themes/neutral/package.json', {
      name: '@astryxdesign/theme-neutral',
      version: '0.7.7',
    });
    // Publishes after core in the loop and peers on it.
    writeJson(root, 'packages/themes/stone/package.json', {
      name: '@astryxdesign/theme-stone',
      version: '0.7.7',
      peerDependencies: {'@astryxdesign/core': '0.7.7'},
    });
    // `npm view` finds nothing on the registry, so every package publishes.
    writeExecutable(root, 'npm', '#!/bin/sh\nexit 1\n');
    writeExecutable(root, 'pnpm', PNPM_STUB);
    const publisherEnv = withPublisher(root);
    const result = spawnSync(
      'bash',
      ['-c', step(stable, 'Publish changed packages').run],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...publisherEnv,
          DRY_RUN: 'false',
          FAIL_ONCE: failOnce,
          FAIL_PACKAGE: failingPackage,
          PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
          PUBLISH_LOG: publishLog,
          RELEASE_VERSION: '0.7.7',
        },
      },
    );
    return {
      ...result,
      published: fs.existsSync(publishLog)
        ? fs.readFileSync(publishLog, 'utf8')
        : '',
    };
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

describe('stable and canary publication authority', () => {
  it('keeps stable explicit and canary limited to main pushes', () => {
    expect(stable.if).toBe("github.event_name == 'workflow_dispatch'");
    expect(canary.if).toBe("github.event_name == 'push'");
    expect(workflow.on.push.branches).toEqual(['main']);
    for (const name of [
      'release-branch',
      'release-version',
      'release-tag',
      'expected-head',
      'plan-digest',
    ]) {
      expect(workflow.on.workflow_dispatch.inputs[name].required).toBe(true);
    }
  });

  it('binds stable publication to marker, tag, branch, head, version, and plan', () => {
    const gateInputs = ci.on.workflow_dispatch.inputs;
    expect(gateInputs['release-version']).toBeDefined();
    expect(gateInputs['plan-digest']).toBeDefined();
    const gate = step(
      ci.jobs['release-authority'],
      'Validate active release authority',
    ).run;
    expect(gate).toContain('--release-version "$RELEASE_VERSION"');
    expect(gate).toContain('--plan-digest "$PLAN_DIGEST"');

    const validation = step(
      stable,
      'Validate marked release branch, tag commit, and plan',
    ).run;
    for (const flag of [
      '--mode publish',
      '--release-branch "$RELEASE_BRANCH"',
      '--release-version "$RELEASE_VERSION"',
      '--release-tag "$RELEASE_TAG"',
      '--expected-head "$EXPECTED_HEAD"',
      '--plan-digest "$PLAN_DIGEST"',
      '--checkout-sha "$GITHUB_SHA"',
      '--remote-head "$REMOTE_HEAD"',
      '--ref-name "$GITHUB_REF_NAME"',
      '--active-branches "$ACTIVE_BRANCHES"',
    ]) {
      expect(validation).toContain(flag);
    }
    expect(validation).toContain('list-active');
    expect(validation).toContain('refs/heads/$RELEASE_BRANCH');
  });

  it('builds stable packages from the checked-out tag and never consumes canary artifacts', () => {
    expect(step(stable, 'Checkout immutable release tag').uses).toMatch(
      /^actions\/checkout@/u,
    );
    expect(step(stable, 'Build all packages').run).toBe('pnpm build');
    expect(
      stable.steps.some(candidate =>
        /download-artifact/u.test(candidate.uses ?? ''),
      ),
    ).toBe(false);
    const publish = step(stable, 'Publish changed packages').run;
    expect(publish).toContain('--tag latest');
    expect(publish).not.toContain('--tag canary');
  });

  it('reports stable success only after registry propagation is verified', () => {
    const publishStep = step(stable, 'Publish changed packages');
    expect(publishStep.env.RELEASE_VERSION).toBe(
      "${{ inputs['release-version'] }}",
    );
    const publish = publishStep.run;
    const verify = publish.indexOf('node scripts/npm/verify-published.mjs');
    const success = publish.indexOf(
      'Published $published package(s); registry verification passed.',
    );
    expect(verify).toBeGreaterThan(0);
    expect(publish).toContain('--version "$RELEASE_VERSION"');
    expect(publish).toContain('--tag latest');
    expect(success).toBeGreaterThan(verify);
    expect(publish.indexOf('if [ "$DRY_RUN" = "true" ]')).toBeLessThan(verify);
  });

  it('never cancels a canary that has started publishing', () => {
    // A cancelled canary can leave a partial package set on npm; pending runs
    // still coalesce under a non-cancelling group.
    expect(canary.concurrency).toEqual({
      group: 'npm-release-canary',
      'cancel-in-progress': false,
    });
    expect(canary.concurrency.group).not.toBe(stable.concurrency.group);
  });

  it('publishes canaries only while main is strictly ahead of stable', () => {
    const eligibility = step(
      canary,
      'Decide whether main may publish a canary',
    );
    expect(eligibility.run).toContain("'refs/tags/v*:refs/tags/v*'");
    expect(eligibility.run).toContain('canary-eligibility');
    for (const name of [
      'Setup Node and pnpm',
      'Build all packages',
      'Publish canary versions',
      'Prune old canary versions',
    ]) {
      expect(step(canary, name).if).toBe(
        "steps.canary-scope.outputs.publish == 'true'",
      );
    }
    const publish = step(canary, 'Publish canary versions').run;
    expect(publish).toContain(
      'DECLARED_VERSION=$(node -p "require(\'./packages/core/package.json\').version")',
    );
    expect(publish).toContain('CANARY_VERSION="${DECLARED_VERSION}-canary.');
    expect(publish).toContain('--tag canary');
    expect(publish).not.toContain('--tag latest');
    const canaryText = JSON.stringify(canary);
    expect(canaryText).not.toContain('.release/active.json');
    expect(canaryText).not.toContain('release-publish-receipt');
  });

  it('skips only an absent package that was private and canary-only', () => {
    const result = runCanaryPublish({httpStatus: '404'});

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Skipping absent private canary-only package @astryxdesign/native',
    );
    expect(result.published).toContain('publish ./packages/core');
    expect(result.published).toContain('publish ./packages/themes/neutral');
    expect(result.published).not.toContain('publish ./packages/native');
  });

  it('publishes a bootstrapped private canary-only package normally', () => {
    const result = runCanaryPublish({httpStatus: '200'});

    expect(result.status).toBe(0);
    expect(result.published).toContain('publish ./packages/native');
  });

  it('fails on registry errors instead of treating them as package absence', () => {
    const result = runCanaryPublish({httpStatus: '503'});

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'Registry lookup for @astryxdesign/native returned HTTP 503',
    );
    expect(result.published).not.toContain('publish ./packages/native');
  });

  it('records a failed registry request and continues later packages', () => {
    const result = runCanaryPublish({httpStatus: '000', curlExitCode: '28'});

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'Registry lookup for @astryxdesign/native returned HTTP 000',
    );
    expect(result.published).not.toContain('publish ./packages/native');
    expect(result.published).toContain('publish ./packages/themes/neutral');
  });

  it('still fails when a present package cannot publish', () => {
    const result = runCanaryPublish({
      failingPackage: 'packages/native',
      httpStatus: '200',
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'Canary publish failed for @astryxdesign/native',
    );
    expect(result.published).toContain('publish ./packages/native');
  });

  it('publishes every package through the at-most-once publisher, never a bare pnpm publish', () => {
    for (const job of [stable, canary]) {
      const text = job.steps.map(candidate => candidate.run ?? '').join('\n');
      expect(text).not.toMatch(/pnpm publish/u);
    }
    expect(step(stable, 'Publish changed packages').run).toContain(
      'node scripts/npm/publish-package.mjs --dir "./$pkg_dir" --tag latest',
    );
    expect(step(canary, 'Publish canary versions').run).toContain(
      'node scripts/npm/publish-package.mjs --dir "./$pkg_dir" --tag canary',
    );
  });

  it('retries a canary whose first signature is rejected, and passes', () => {
    const result = runCanaryPublish({
      failOnce: 'packages/themes/neutral',
      httpStatus: '200',
    });

    expect(result.status).toBe(0);
    expect(
      result.published
        .split('\n')
        .filter(line => line.startsWith('publish ./packages/themes/neutral')),
    ).toHaveLength(2);
  });

  it('keeps publishing stable packages after one fails, then fails the step', () => {
    const result = runStablePublish({failingPackage: 'packages/core'});

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'Stable publish failed for @astryxdesign/core@0.7.7',
    );
    expect(result.stdout).toContain(
      'Re-running this workflow on the same tag publishes only what is missing.',
    );
    expect(result.published).toContain('publish ./packages/themes/neutral');
  });

  it('holds back a stable package whose dependency failed, as failed too', () => {
    const result = runStablePublish({failingPackage: 'packages/core'});

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'Not publishing @astryxdesign/theme-stone@0.7.7 because @astryxdesign/core failed',
    );
    expect(result.stdout).toMatch(
      /Stable publish failed for: @astryxdesign\/core @astryxdesign\/theme-stone\./u,
    );
    expect(result.published).not.toContain('publish ./packages/themes/stone');
    expect(result.published).toContain('publish ./packages/themes/neutral');
  });

  it('retries a stable package whose first signature is rejected', () => {
    // Both publish; the step then reaches registry verification, which this
    // scratch root does not carry, so only the publish calls are asserted.
    const result = runStablePublish({failOnce: 'packages/core'});

    expect(
      result.published
        .split('\n')
        .filter(line => line.startsWith('publish ./packages/core')),
    ).toHaveLength(2);
    expect(result.stdout).not.toContain('Stable publish failed');
  });

  it('validates every main merge-back against trusted policy and the immutable tag', () => {
    const mergeBack = ci.jobs['release-merge-back'];
    expect(mergeBack.if).toContain("github.base_ref == 'main'");
    const scope = step(
      mergeBack,
      'Detect the release-merge-back branch contract',
    ).run;
    expect(scope).toContain('chore/merge-v*-to-main');
    expect(scope).not.toContain('stable package-version change on main');

    const lintScope = step(
      lint.jobs.lint,
      'Detect the release merge-back branch contract',
    ).run;
    expect(lintScope).toContain('chore/merge-v*-to-main');
    expect(lintScope).toContain("grep -Eq '^[0-9]+\\.[0-9]+\\.[0-9]+$'");

    const requiredLintText = JSON.stringify(lint.jobs.lint);
    expect(requiredLintText).not.toContain(
      "Keep main's declared version above latest stable",
    );
    expect(requiredLintText).not.toContain('validate-main-version');
    expect(JSON.stringify(mergeBack)).not.toContain('validate-main-version');

    expect(step(lint.jobs.lint, 'Check Changeset coverage').if).toBe(
      "github.event_name == 'pull_request' && steps.release-merge-back-scope.outputs.required != 'true'",
    );
    const requiredLintValidation = step(
      lint.jobs.lint,
      'Validate release merge-back in required lint',
    );
    expect(requiredLintValidation.if).toBe(
      "github.event_name == 'pull_request' && steps.release-merge-back-scope.outputs.required == 'true'",
    );
    for (const command of [
      'git show origin/main:scripts/release/active-release.mjs',
      'git show origin/main:scripts/lib/workspace-globs.mjs',
      'validate-merge-back',
      '--base origin/main',
      '--release-ref "v$VERSION"',
      '--active-branches "$ACTIVE_BRANCHES"',
    ]) {
      expect(requiredLintValidation.run).toContain(command);
    }
    const validation = step(
      mergeBack,
      'Validate published bytes and consumed-only Changeset merge-back',
    ).run;
    expect(validation).toContain('validate-merge-back');
    expect(validation).toContain('--base origin/main');
    expect(validation).toContain('--release-ref "v$VERSION"');
    expect(validation).toContain('--active-branches "$ACTIVE_BRANCHES"');
    expect(
      step(mergeBack, 'Fetch release authority and trusted validator').run,
    ).toContain('git show origin/main:scripts/release/active-release.mjs');
    const parity = step(
      mergeBack,
      'Verify immutable tag package bytes match npm',
    ).run;
    expect(parity).toContain('git worktree add --detach');
    expect(parity).toContain('pnpm build');
    expect(parity).toContain('verify-published.mjs --version "$VERSION"');
  });
});

describe('stable publish requires the cut commit release-check (spec:AST-030 FR12, DEC-11)', () => {
  it('checks the marker cut commit before anything is built or published', () => {
    const names = stable.steps.map(candidate => candidate.name);
    const guard = names.indexOf(
      'Require a passing release-check at the exact cut commit',
    );
    expect(guard).toBeGreaterThan(
      names.indexOf('Validate marked release branch, tag commit, and plan'),
    );
    expect(guard).toBeLessThan(names.indexOf('Build all packages'));
    expect(guard).toBeLessThan(names.indexOf('Publish changed packages'));
    const script = stable.steps[guard].with.script;
    expect(script).toContain('scripts/release/release-check-receipt.mjs');
    expect(script).toContain('.release/active.json');
    expect(script).toContain('requireReleaseCheck(');
    // The cut commit also needs a passing full unit run (FR21).
    expect(script).toContain('requireUnitRun(');
    expect(stable.steps[guard]['continue-on-error']).toBeUndefined();
    expect(stable.permissions.actions).toBe('read');
  });
});
