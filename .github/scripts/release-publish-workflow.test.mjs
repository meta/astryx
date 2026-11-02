// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawn, spawnSync} from 'node:child_process';
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
  for (const file of [
    'publish-order.mjs',
    'publish-package.mjs',
    'registry.mjs',
  ]) {
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

/*
 * A registry stand-in on a local port that answers as npm does. The private
 * canary-only package's `latest` version document answers each status in
 * `NATIVE_STATUSES` in turn (the last one repeats; `000` drops the
 * connection). Its dist-tags answer 401, as npm answers for a missing scoped
 * package. Other dist-tags answer 200 and other version documents 404. Each
 * request path is logged.
 */
const REGISTRY_STUB = `
import fs from 'node:fs';
import http from 'node:http';
const statuses = process.env.NATIVE_STATUSES.split(',');
let nativeReads = 0;
const server = http.createServer((request, response) => {
  const url = decodeURIComponent(request.url);
  fs.appendFileSync(process.env.REQUEST_LOG, url + '\\n');
  if (url === '/-/package/@astryxdesign/native/dist-tags') {
    response.writeHead(401).end('"Unauthorized"');
    return;
  }
  if (url === '/@astryxdesign/native/latest') {
    const status = statuses[Math.min(nativeReads, statuses.length - 1)];
    nativeReads += 1;
    if (status === '000') return request.socket.destroy();
    response.writeHead(Number(status)).end('{}');
    return;
  }
  response.writeHead(url.startsWith('/-/package/') ? 200 : 404).end('{}');
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
`;

async function startRegistryStub(root, nativeStatuses) {
  const script = path.join(root, 'registry-stub.mjs');
  const requestLog = path.join(root, 'requests.log');
  fs.writeFileSync(script, REGISTRY_STUB);
  fs.writeFileSync(requestLog, '');
  const child = spawn(process.execPath, [script], {
    env: {
      ...process.env,
      NATIVE_STATUSES: nativeStatuses,
      REQUEST_LOG: requestLog,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.once('data', data => resolve(String(data).trim()));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => fs.readFileSync(requestLog, 'utf8'),
    stop: () => child.kill(),
  };
}

async function runCanaryPublish({
  nativeStatuses,
  failingPackage = '',
  failOnce = '',
}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-canary-publish-'));
  const publishLog = path.join(root, 'publish.log');
  const registry = await startRegistryStub(root, nativeStatuses);
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
    writeExecutable(root, 'pnpm', PNPM_STUB);
    const publisherEnv = {
      ...withPublisher(root),
      ASTRYX_PUBLISH_REGISTRY: registry.url,
    };

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
          FAIL_ONCE: failOnce,
          FAIL_PACKAGE: failingPackage,
          GITHUB_SHA: 'abcdef1234567890',
          PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
          PUBLISH_LOG: publishLog,
          RUNNER_TEMP: runnerTemp,
        },
      },
    );
    return {
      ...result,
      requests: registry.requests(),
      published: fs.existsSync(publishLog)
        ? fs.readFileSync(publishLog, 'utf8')
        : '',
    };
  } finally {
    registry.stop();
    fs.rmSync(root, {recursive: true, force: true});
  }
}

/** Runs the stable publish step over two packages with stubbed npm and pnpm. */
function runStablePublish({
  failingPackage = '',
  failOnce = '',
  verifyExit = null,
} = {}) {
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
    // Listed before Core and depends on it: the publish order moves it after.
    writeJson(root, 'packages/cli/package.json', {
      name: '@astryxdesign/cli',
      version: '0.7.7',
      dependencies: {'@astryxdesign/core': '0.7.7'},
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
    if (verifyExit !== null) writeVerifierStub(root, verifyExit);
    const githubOutput = path.join(root, 'github-output');
    fs.writeFileSync(githubOutput, '');
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
          GITHUB_OUTPUT: githubOutput,
          PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
          PUBLISH_LOG: publishLog,
          RELEASE_VERSION: '0.7.7',
        },
      },
    );
    return {
      ...result,
      output: fs.readFileSync(githubOutput, 'utf8'),
      published: fs.existsSync(publishLog)
        ? fs.readFileSync(publishLog, 'utf8')
        : '',
    };
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

/** A registry verifier stand-in that exits with `code`. */
function writeVerifierStub(root, code) {
  const file = path.join(root, 'scripts/npm/verify-published.mjs');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `process.exit(${code});\n`);
}

/** Runs one follow-up verification job's script with a verifier stand-in. */
function runFollowUp(job, verifyExit) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-verify-'));
  try {
    writeVerifierStub(root, verifyExit);
    const githubOutput = path.join(root, 'github-output');
    fs.writeFileSync(githubOutput, '');
    const result = spawnSync(
      'bash',
      ['-c', step(job, 'Verify published packages').run],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_OUTPUT: githubOutput,
          RELEASE_VERSION: '0.7.7',
        },
      },
    );
    return {...result, output: fs.readFileSync(githubOutput, 'utf8')};
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

  it('skips only an absent package that was private and canary-only', async () => {
    const result = await runCanaryPublish({nativeStatuses: '404'});

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Skipping absent private canary-only package @astryxdesign/native',
    );
    expect(result.published).toContain('publish ./packages/core');
    expect(result.published).toContain('publish ./packages/themes/neutral');
    expect(result.published).not.toContain('publish ./packages/native');
  });

  it('publishes a bootstrapped private canary-only package normally', async () => {
    const result = await runCanaryPublish({nativeStatuses: '200'});

    expect(result.status).toBe(0);
    expect(result.published).toContain('publish ./packages/native');
  });

  it('asks whether a package exists through its latest version document, never its full document', async () => {
    const result = await runCanaryPublish({nativeStatuses: '200'});
    const requests = result.requests.split('\n');

    expect(requests).toContain('/@astryxdesign/native/latest');
    expect(requests).not.toContain('/@astryxdesign/native');
    expect(requests).not.toContain('/-/package/@astryxdesign/native/dist-tags');
    expect(step(canary, 'Publish canary versions').run).not.toContain('curl');
  });

  it('fails on registry errors instead of treating them as package absence', async () => {
    const result = await runCanaryPublish({nativeStatuses: '503'});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Could not tell whether @astryxdesign/native exists on the registry after 3 lookups.',
    );
    expect(result.stdout).toContain(
      'Canary publish failed for @astryxdesign/native',
    );
    expect(result.stdout).not.toContain('Skipping absent');
    expect(result.published).not.toContain('publish ./packages/native');
  });

  it('records a dropped registry request and continues later packages', async () => {
    const result = await runCanaryPublish({nativeStatuses: '000'});

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'Canary publish failed for @astryxdesign/native',
    );
    expect(result.published).not.toContain('publish ./packages/native');
    expect(result.published).toContain('publish ./packages/themes/neutral');
  });

  it('asks again after an unknown answer and publishes once the package is found', async () => {
    const result = await runCanaryPublish({nativeStatuses: '000,503,200'});

    expect(result.status).toBe(0);
    expect(result.published).toContain('publish ./packages/native');
  });

  it('still fails when a present package cannot publish', async () => {
    const result = await runCanaryPublish({
      failingPackage: 'packages/native',
      nativeStatuses: '200',
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

  it('retries a canary whose first signature is rejected, and passes', async () => {
    const result = await runCanaryPublish({
      failOnce: 'packages/themes/neutral',
      nativeStatuses: '200',
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
      /Stable publish failed for: @astryxdesign\/core @astryxdesign\/cli @astryxdesign\/theme-stone\./u,
    );
    expect(result.published).not.toContain('publish ./packages/themes/stone');
    expect(result.published).toContain('publish ./packages/themes/neutral');
  });

  it('holds back a package listed before its failed dependency', () => {
    const result = runStablePublish({failingPackage: 'packages/core'});

    expect(result.stdout).toContain(
      'Not publishing @astryxdesign/cli@0.7.7 because @astryxdesign/core failed',
    );
    expect(result.published).not.toContain('publish ./packages/cli');
  });

  it('publishes every dependency before the packages that use it', () => {
    const result = runStablePublish();
    const order = result.published
      .split('\n')
      .filter(Boolean)
      .map(line => line.split(' ')[1]);

    expect(order.indexOf('./packages/core')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('./packages/core')).toBeLessThan(
      order.indexOf('./packages/cli'),
    );
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
      '--base HEAD^1',
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
    expect(validation).toContain('--base HEAD^1');
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

  it('passes the release when every package is readable in the first window', () => {
    const result = runStablePublish({verifyExit: 0});

    expect(result.status).toBe(0);
    expect(result.output).toContain('verified=true');
  });

  it('ends the publish job as "not yet readable", not failed, and hands over to a follow-up', () => {
    const result = runStablePublish({verifyExit: 2});

    expect(result.status).toBe(0);
    expect(result.output).toContain('verified=pending');
    expect(result.stdout).toContain('not yet readable on the registry');
  });

  it('still fails the publish job on a verification error', () => {
    const result = runStablePublish({verifyExit: 1});

    expect(result.status).toBe(1);
    expect(result.output).not.toContain('verified=');
  });

  it('runs at most two bounded follow-up verification jobs, each only while packages are pending', () => {
    const first = workflow.jobs['verify-registry-1'];
    const last = workflow.jobs['verify-registry-2'];
    const followUps = Object.keys(workflow.jobs).filter(name =>
      name.startsWith('verify-registry'),
    );

    expect(followUps).toEqual(['verify-registry-1', 'verify-registry-2']);
    expect(stable.outputs.verified).toBe(
      '${{ steps.publish.outputs.verified }}',
    );
    expect(first.needs).toBe('publish');
    expect(first.if).toBe("needs.publish.outputs.verified == 'pending'");
    expect(last.needs).toBe('verify-registry-1');
    expect(last.if).toBe(
      "needs.verify-registry-1.outputs.verified == 'pending'",
    );
    for (const job of [first, last]) {
      expect(job['runs-on']).toBe('ubuntu-latest');
      expect(job['timeout-minutes']).toBeLessThanOrEqual(10);
      expect(job.permissions).toEqual({contents: 'read'});
      expect(step(job, 'Verify published packages').run).toContain(
        'node scripts/npm/verify-published.mjs --version "$RELEASE_VERSION" --tag latest',
      );
    }
  });

  it('hands a still-pending check from the first follow-up to the last one', () => {
    const pending = runFollowUp(workflow.jobs['verify-registry-1'], 2);
    expect(pending.status).toBe(0);
    expect(pending.output).toContain('verified=pending');

    const readable = runFollowUp(workflow.jobs['verify-registry-1'], 0);
    expect(readable.status).toBe(0);
    expect(readable.output).toContain('verified=true');
  });

  it('fails the release when the last follow-up still finds a package unreadable', () => {
    const result = runFollowUp(workflow.jobs['verify-registry-2'], 2);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain(
      'still not readable on the registry after three verification windows',
    );
  });
});
