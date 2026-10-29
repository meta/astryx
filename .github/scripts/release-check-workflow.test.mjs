// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Exact-main and release-branch dispatch contracts.
 * @input CI workflow and independent event, dependency, scope, and API fixtures
 * @output Fail-closed release routing and unchanged maintenance/PR assertions
 * @position Node contracts for AST-030 FR12 and DEC-5
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const workflow = yaml.parse(
  fs.readFileSync(new URL('../workflows/ci.yml', import.meta.url), 'utf8'),
);
const jobs = workflow.jobs;
const step = (job, name) => jobs[job].steps.find(item => item.name === name);
const packageJson = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
const releaseJobs = [
  'check-scope',
  'check-components',
  'build-storybook',
  'typecheck',
  'visual-scout',
  'pr-visual',
  'pr-a11y-shard',
  'pr-a11y-audit',
  'pr-a11y-guards',
  'pr-a11y-specs',
  'pr-a11y',
  'a11y-contracts-shard',
  'a11y-contracts',
  'pr-rtl-shard',
  'pr-rtl-merge',
  'pr-rtl',
  'release-check',
];
const fullOutputs = {
  docsite_only: 'false',
  spec_only: 'false',
  tooling_only: 'false',
  has_components: 'true',
  has_rtl_components: 'true',
  has_rtl_harness: 'true',
  force_full_component_audits: 'true',
  has_stable_visual: 'true',
  broad_stable_visual: 'true',
};

function dependencies(job) {
  const names = job.needs == null ? [] : [job.needs].flat();
  return Object.fromEntries(
    names.map(name => [
      name,
      {
        result: name === 'maintenance-request' ? 'skipped' : 'success',
        outputs: {...fullOutputs},
      },
    ]),
  );
}

function runs(
  job,
  {
    event = 'workflow_dispatch',
    operation = 'release-check',
    branch = releaseBranch,
    needs = dependencies(job),
    cancelled = false,
  } = {},
) {
  const expression = (job.if ?? 'true')
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/needs\.([a-z][a-z0-9-]*)/g, 'needs["$1"]');
  // GitHub injects success() unless the expression has a status function.
  if (
    !/\b(always|cancelled|success|failure)\(/.test(expression) &&
    (cancelled || Object.values(needs).some(item => item.result !== 'success'))
  )
    return false;
  return Function(
    'github',
    'inputs',
    'needs',
    'always',
    'cancelled',
    `return Boolean(${expression});`,
  )(
    {event_name: event},
    {operation, 'release-branch': branch},
    needs,
    () => true,
    () => cancelled,
  );
}

function shell(script, env = {}, prefix = '') {
  return spawnSync('bash', ['-eu', '-c', `${prefix}\n${script}`], {
    env: {...process.env, ...env},
    encoding: 'utf8',
  });
}

const sha = 'a'.repeat(40);
const releaseBranch = 'release/v0.6.5';
const planDigest = 'b'.repeat(64);

function mainAuthorityGit(remoteSha = sha, ancestor = true) {
  return `MAIN_FETCHED=false
  git() {
    case "$1" in
      ls-remote) printf '%s\\n' '${remoteSha}\\trefs/heads/main' ;;
      fetch) MAIN_FETCHED=true ;;
      merge-base)
        [ "$MAIN_FETCHED" = true ] || return 98
        return ${ancestor ? 0 : 1}
        ;;
      *) return 99 ;;
    esac
  }`;
}

async function githubScript(
  script,
  {
    branch = releaseBranch,
    ref = `refs/heads/${branch}`,
    remoteSha = sha,
    expectedHead = sha,
    checkedHead = expectedHead,
    plan = planDigest,
    needs,
    apiFails = false,
    compareStatus = 'identical',
  } = {},
) {
  const summary = {
    addHeading() {
      return this;
    },
    addRaw() {
      return this;
    },
    async write() {},
  };
  const execute = Object.getPrototypeOf(async function () {}).constructor(
    'context',
    'github',
    'core',
    'process',
    script,
  );
  return execute(
    {ref, sha, repo: {owner: 'example', repo: 'design-system'}},
    {
      rest: {
        git: {
          async getRef(request) {
            expect(request.ref).toBe(`heads/${branch}`);
            if (apiFails) throw new Error('API unavailable');
            return {data: {object: {sha: remoteSha}}};
          },
        },
        repos: {
          async compareCommitsWithBasehead(request) {
            expect(request.basehead).toBe(`${expectedHead}...${remoteSha}`);
            return {data: {status: compareStatus}};
          },
        },
      },
    },
    {summary},
    {
      env: {
        RELEASE_NEEDS: JSON.stringify(needs),
        RELEASE_BRANCH: branch,
        EXPECTED_HEAD: expectedHead,
        CHECKED_HEAD: checkedHead,
        PLAN_DIGEST: plan,
      },
    },
  );
}

function assertReleaseRouting(candidate) {
  for (const [name, job] of Object.entries(candidate.jobs)) {
    expect(runs(job), name).toBe(releaseJobs.includes(name));
  }
}

describe('explicit release routing', () => {
  it('uses only the existing workflow and canonical owners, never a push or schedule', () => {
    expect(workflow.on.workflow_dispatch.inputs.operation.options).toContain(
      'release-check',
    );
    expect(workflow.on).not.toHaveProperty('push');
    expect(workflow.on).not.toHaveProperty('schedule');
    expect(jobs['pr-visual'].name).toBe('Stable visual regression');
    assertReleaseRouting(workflow);
  });

  it.each(releaseJobs)('detects a mutation that skips %s', name => {
    const mutant = structuredClone(workflow);
    mutant.jobs[name].if = 'false';
    expect(() => assertReleaseRouting(mutant)).toThrow();
  });

  it.each(['capture', 'promote'])(
    'does not start release-only projection on %s',
    operation => {
      expect(runs(jobs['release-check'], {operation})).toBe(false);
    },
  );

  it.each(['failure', 'cancelled', 'skipped', ''])(
    'keeps the release join reachable after upstream %s',
    result => {
      const needs = dependencies(jobs['release-check']);
      for (const item of Object.values(needs)) item.result = result;
      expect(
        runs(jobs['release-check'], {needs, cancelled: result === 'cancelled'}),
      ).toBe(true);
    },
  );

  it.each([
    'pr-a11y-shard',
    'pr-a11y-guards',
    'pr-a11y-specs',
    'a11y-contracts-shard',
    'visual-scout',
    'pr-visual',
    'pr-rtl-shard',
  ])('blocks %s when its build fails', name => {
    const needs = dependencies(jobs[name]);
    needs['build-storybook'].result = 'failure';
    expect(runs(jobs[name], {needs})).toBe(false);
  });

  it('passes pr-a11y only when both accessibility owners succeed', () => {
    const join = jobs['pr-a11y'];
    const owner = step('pr-a11y', 'Require every accessibility owner');
    expect(join.if).toContain('always()');
    expect(owner.env).toEqual({
      GUARDS_RESULT: '${{ needs.pr-a11y-guards.result }}',
      SPECS_RESULT: '${{ needs.pr-a11y-specs.result }}',
    });
    const result = shell(owner.run, {
      GUARDS_RESULT: 'success',
      SPECS_RESULT: 'success',
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ['failure', 'success'],
    ['cancelled', 'success'],
    ['skipped', 'success'],
    ['success', 'failure'],
    ['success', 'cancelled'],
    ['success', 'skipped'],
  ])('blocks pr-a11y when its owners are %s/%s', (guards, specs) => {
    const join = jobs['pr-a11y'];
    const needs = dependencies(join);
    needs['pr-a11y-guards'].result = guards;
    needs['pr-a11y-specs'].result = specs;
    expect(
      runs(join, {
        needs,
        cancelled: guards === 'cancelled' || specs === 'cancelled',
      }),
    ).toBe(true);
    const result = shell(
      step('pr-a11y', 'Require every accessibility owner').run,
      {GUARDS_RESULT: guards, SPECS_RESULT: specs},
    );
    expect(result.status).not.toBe(0);
  });

  it('keeps dispatch concurrency separate and non-cancelling', () => {
    expect(workflow.concurrency.group).toContain('|| github.run_id');
    expect(workflow.concurrency['cancel-in-progress']).toBe(
      "${{ github.event_name != 'workflow_dispatch' }}",
    );
  });

  it('preserves read-only release jobs and exact-event checkout', () => {
    expect(workflow.permissions).toEqual({});
    for (const name of releaseJobs) {
      expect(jobs[name].permissions ?? {}).not.toHaveProperty(
        'contents',
        'write',
      );
      expect(jobs[name].permissions ?? {}).not.toHaveProperty(
        'actions',
        'write',
      );
      for (const item of jobs[name].steps) {
        if (item.uses?.startsWith('actions/checkout@')) {
          // Omitted ref is the event SHA, not the mutable default branch.
          expect([
            undefined,
            '${{ github.sha }}',
            '${{ github.event.pull_request.head.sha || github.sha }}',
          ]).toContain(item.with?.ref);
          expect(item.with?.repository).toBeUndefined();
        }
      }
    }
  });
});

describe('exact main pre-cut authority', () => {
  const authority = step(
    'check-scope',
    'Validate exact main pre-cut authority',
  );

  it('runs only for an exact-main release-check request', () => {
    expect(runs(authority, {branch: 'main'})).toBe(true);
    expect(runs(authority)).toBe(false);
    expect(runs(authority, {branch: 'main', operation: 'capture'})).toBe(false);
    expect(jobs['check-scope'].outputs.release_head).toContain(
      'steps.main-authority.outputs.head',
    );
  });

  it('binds the run to the requested SHA in current main history', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-main-check-'));
    const output = path.join(dir, 'output');
    try {
      const result = shell(
        authority.run,
        {
          EXPECTED_HEAD: sha,
          GITHUB_REF: 'refs/heads/main',
          GITHUB_SHA: sha,
          GITHUB_OUTPUT: output,
        },
        mainAuthorityGit(),
      );
      expect(result.status, result.stderr).toBe(0);
      expect(fs.readFileSync(output, 'utf8')).toBe(
        `branch=main\nhead=${sha}\n`,
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('accepts a checked SHA that remains an ancestor after main advances', () => {
    const result = shell(
      authority.run,
      {
        EXPECTED_HEAD: sha,
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: sha,
        GITHUB_OUTPUT: '/dev/null',
      },
      mainAuthorityGit('b'.repeat(40)),
    );
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ['wrong ref', {GITHUB_REF: 'refs/heads/candidate', GITHUB_SHA: sha}],
    [
      'wrong checkout',
      {GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'b'.repeat(40)},
    ],
  ])('rejects %s', (_name, values) => {
    const result = shell(
      authority.run,
      {...values, EXPECTED_HEAD: sha, GITHUB_OUTPUT: '/dev/null'},
      mainAuthorityGit(),
    );
    expect(result.status).not.toBe(0);
  });

  it('rejects a checked SHA removed from current main history', () => {
    const result = shell(
      authority.run,
      {
        EXPECTED_HEAD: sha,
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: sha,
        GITHUB_OUTPUT: '/dev/null',
      },
      mainAuthorityGit('b'.repeat(40), false),
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain(
      'Checked main commit is not an ancestor of current main',
    );
  });
});

describe('exact main and release branch completion', () => {
  const join = step(
    'release-check',
    'Require complete exact-head canonical checks',
  ).with.script;
  const complete = Object.fromEntries(
    jobs['release-check'].needs.map(name => [name, {result: 'success'}]),
  );

  it('accepts complete exact release-branch evidence', async () => {
    await expect(
      githubScript(join, {needs: complete}),
    ).resolves.toBeUndefined();
    expect(jobs['release-check'].needs).toEqual([
      'check-scope',
      'check-components',
      'build-storybook',
      'typecheck',
      'pr-visual',
      'pr-a11y',
      'a11y-contracts',
      'pr-a11y-audit',
      'pr-rtl',
    ]);
  });

  it('accepts complete exact-main evidence before a cut', async () => {
    await expect(
      githubScript(join, {branch: 'main', plan: '', needs: complete}),
    ).resolves.toBeUndefined();
  });

  it('accepts complete exact-main evidence after main advances', async () => {
    await expect(
      githubScript(join, {
        branch: 'main',
        remoteSha: 'b'.repeat(40),
        compareStatus: 'ahead',
        plan: '',
        needs: complete,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects exact-main evidence removed from current main history', async () => {
    await expect(
      githubScript(join, {
        branch: 'main',
        remoteSha: 'b'.repeat(40),
        compareStatus: 'diverged',
        plan: '',
        needs: complete,
      }),
    ).rejects.toThrow('not an ancestor of current main');
  });

  it('requires the successful main authority step to bind the expected head', async () => {
    await expect(
      githubScript(join, {
        branch: 'main',
        checkedHead: 'b'.repeat(40),
        plan: '',
        needs: complete,
      }),
    ).rejects.toThrow('Main authority check did not bind the expected head');
  });

  it.each(['refs/heads/main', 'refs/tags/v0.6.5', ''])(
    'rejects a release-branch request from ref %s',
    async ref => {
      await expect(githubScript(join, {ref, needs: complete})).rejects.toThrow(
        'requested branch',
      );
    },
  );

  it('rejects checkout drift from the expected head', async () => {
    await expect(
      githubScript(join, {expectedHead: 'b'.repeat(40), needs: complete}),
    ).rejects.toThrow('does not match expected head');
  });

  it.each(['b'.repeat(40), undefined])(
    'rejects branch drift or a missing remote SHA %s',
    async remoteSha => {
      await expect(
        githubScript(join, {remoteSha: remoteSha ?? '', needs: complete}),
      ).rejects.toThrow('moved during checks');
    },
  );

  it('rejects an unmarked post-bump branch', async () => {
    await expect(
      githubScript(join, {
        branch: 'candidate',
        ref: 'refs/heads/candidate',
        needs: complete,
      }),
    ).rejects.toThrow('marked release branch');
  });

  it('requires a plan digest after the bump', async () => {
    await expect(
      githubScript(join, {plan: '', needs: complete}),
    ).rejects.toThrow('active plan digest');
  });

  it('fails closed when the requested branch cannot be read', async () => {
    await expect(
      githubScript(join, {apiFails: true, needs: complete}),
    ).rejects.toThrow('API unavailable');
  });

  it.each(['failure', 'cancelled', 'skipped', 'neutral', ''])(
    'rejects each required job with outcome %s',
    async result => {
      for (const name of Object.keys(complete)) {
        await expect(
          githubScript(join, {needs: {...complete, [name]: {result}}}),
        ).rejects.toThrow(name);
        const missing = {...complete};
        delete missing[name];
        await expect(githubScript(join, {needs: missing})).rejects.toThrow(
          name,
        );
      }
    },
  );
});

describe('full release scope without PR metadata or maintenance writes', () => {
  it('forces broad scope before any changed-file classification', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-release-scope-'));
    try {
      for (const [job, name, expected] of [
        [
          'check-scope',
          'Determine change scope',
          {
            docsite_only: 'false',
            spec_only: 'false',
            tooling_only: 'false',
            full_suite: 'true',
            release_bump: 'false',
          },
        ],
        [
          'check-components',
          'Check for component changes',
          Object.fromEntries(
            Object.entries(fullOutputs).filter(
              ([key]) => !key.endsWith('_only'),
            ),
          ),
        ],
      ]) {
        const output = path.join(dir, `${job}.txt`);
        const script = step(job, name).run.replaceAll(
          '${{ github.event_name }}',
          'workflow_dispatch',
        );
        const result = shell(
          script,
          {
            GITHUB_OUTPUT: output,
            ...(job === 'check-scope'
              ? {EVENT_NAME: 'workflow_dispatch', BASE_REF: ''}
              : {}),
          },
          'git() { echo "must not inspect changed files" >&2; return 99; }',
        );
        expect(result.status, result.stderr).toBe(0);
        expect(
          Object.fromEntries(
            fs
              .readFileSync(output, 'utf8')
              .trim()
              .split('\n')
              .map(line => line.split('=')),
          ),
        ).toEqual(expected);
      }
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('builds event-SHA Storybook and supplies explicit full audit analysis', () => {
    const identify = step(
      'build-storybook',
      'Identify full release audit scope',
    );
    expect(identify.run).toContain(
      'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
    );
    expect(identify.run).toContain('{"forceFullComponentAudits":true}');
    for (const name of [
      'Upload Storybook artifact',
      'Upload built themes and core',
      'Upload analysis artifact',
    ]) {
      expect(
        runs(step('build-storybook', name), {
          needs: dependencies(jobs['build-storybook']),
        }),
        name,
      ).toBe(true);
    }
    for (const name of [
      'Compute PR preview path',
      'Analyze components',
      'Write PR comment metadata',
    ]) {
      expect(
        runs(step('build-storybook', name), {
          needs: dependencies(jobs['build-storybook']),
        }),
        name,
      ).toBe(false);
    }
  });

  it('runs the canonical accessibility command without a component filter for full scope', () => {
    const audit = step('pr-a11y-audit', 'Run accessibility audit');
    expect(runs(step('pr-a11y-guards', 'Run accessibility audit'))).toBe(false);
    expect(step('pr-a11y-audit', 'Require every audit shard').run).toContain(
      '"$SHARD_RESULT" != success',
    );
    const result = shell(
      audit.run.replaceAll('${{ github.event_name }}', 'workflow_dispatch'),
      {},
      `
      node() {
        if [ "$1" != '.github/scripts/accessibility-audit.js' ]; then return 99; fi
        printf '%s\\n' "$@"
      }
    `,
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('--fail-on-new');
    expect(result.stdout).toContain('--merge-shards');
    expect(result.stdout).not.toContain('--components');
    expect(audit['continue-on-error']).toBeUndefined();
    expect(
      step('a11y-contracts-shard', 'Run accessibility spec-test contracts').env
        .ASTRYX_HEAD_SHA,
    ).toBe('${{ github.event.pull_request.head.sha || github.sha }}');
  });

  it.each([
    [['core/Button'], false],
    [['core/Button', 'lab/Chart'], true],
    [[], true],
  ])(
    'always supplies explicit PR owner filters %j (broad=%s)',
    (owners, broad) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-pr-a11y-'));
      try {
        fs.writeFileSync(
          path.join(dir, 'analysis.json'),
          JSON.stringify({
            diffMode: 'three-dot',
            newComponentOwners: owners,
            modifiedComponentOwners: [],
            unresolvedComponentSources: [],
            forceFullComponentAudits: broad,
          }),
        );
        const result = shell(
          step('pr-a11y-guards', 'Run accessibility audit').run.replaceAll(
            '${{ github.event_name }}',
            'pull_request',
          ),
          {TEST_DIR: dir},
          `node() {
          if [ "$1" = '.github/scripts/a11y-pr-scope.mjs' ]; then
            command node "$1" "$TEST_DIR/analysis.json"
          else
            printf '[%s]\\n' "$@"
          fi
        }`,
        );
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain(
          `[--components]\n[${owners.join(',')}]`,
        );
        expect(result.stdout).toContain('[--fail-on-new]');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
  );

  it('does not silently audit everything when PR scope resolution fails', () => {
    const result = shell(
      step('pr-a11y-guards', 'Run accessibility audit').run.replaceAll(
        '${{ github.event_name }}',
        'pull_request',
      ),
      {},
      `node() {
        if [ "$1" = '.github/scripts/a11y-pr-scope.mjs' ]; then return 1; fi
        echo 'AUDIT MUST NOT RUN'
      }`,
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('AUDIT MUST NOT RUN');
  });

  it('clones full history only where the release-branch validator reads it', () => {
    const checkout = jobs['check-scope'].steps.find(step =>
      step.uses?.startsWith('actions/checkout@'),
    );
    const expression = String(checkout.with['fetch-depth']).replace(
      /^\$\{\{\s*|\s*\}\}$/g,
      '',
    );
    const depth = (event, branch, baseRef = '') =>
      Function(
        'github',
        'inputs',
        'startsWith',
        `return ${expression.replaceAll('==', '===').replaceAll('!===', '!==')};`,
      )(
        {event_name: event, base_ref: baseRef},
        {'release-branch': branch},
        (value, prefix) => String(value).startsWith(prefix),
      );
    expect(depth('workflow_dispatch', releaseBranch)).toBe('0');
    expect(depth('pull_request', '', 'release/v0.6.5')).toBe('0');
    expect(depth('workflow_dispatch', 'main')).toBe('50');
    expect(depth('pull_request', '', 'main')).toBe('50');
  });

  it('keeps exhaustive a11y contracts and their artifacts release-only', () => {
    for (const [job, name] of [
      ['a11y-contracts-shard', 'Run accessibility spec-test contracts'],
      ['a11y-contracts-shard', 'Upload pressed-state pixel evidence'],
      ['a11y-contracts-shard', 'Upload component-audit browser evidence'],
    ]) {
      expect(runs(step(job, name)), name).toBe(true);
      expect(
        runs(step(job, name), {event: 'pull_request', operation: ''}),
        name,
      ).toBe(false);
      expect(runs(step(job, name), {operation: 'capture'}), name).toBe(false);
    }
    expect(runs(jobs['a11y-contracts'])).toBe(true);
    expect(
      runs(jobs['a11y-contracts'], {event: 'pull_request', operation: ''}),
    ).toBe(false);
    const contracts = step(
      'a11y-contracts-shard',
      'Run accessibility spec-test contracts',
    );
    expect(contracts.run).toContain(
      'a11y-contract-shard.mjs --shard "${{ matrix.shard }}/${{ strategy.job-total }}"',
    );
    // File filters must precede `--project`, which is variadic.
    expect(contracts.run).toContain(
      'pnpm exec playwright test "${FILES[@]}" --config playwright.config.ts --project chromium',
    );
    expect(packageJson.scripts['test:a11y-contract']).toBe(
      'playwright test --config playwright.config.ts --project chromium',
    );
    expect(contracts.run).toContain('set -euo pipefail');
    expect(contracts.env.A11Y_CONTRACT_WORKERS).toBe(4);
    // Shard legs that run four pages or workers get four cores.
    for (const job of ['visual-scout', 'pr-a11y-shard']) {
      expect(jobs[job]['runs-on'], job).toBe('4-core-ubuntu');
    }
    expect(
      step('visual-scout', 'Scout this shard of the release plan').run,
    ).toContain('--concurrency 4');
    // Four workers need four cores; on two the CPU-bound specs time out.
    expect(jobs['a11y-contracts-shard']['runs-on']).toBe('4-core-ubuntu');
    expect(contracts['continue-on-error']).toBeUndefined();
    // The join fails closed: a failed shard, or an evidence set no shard
    // produced, blocks release-check through a11y-contracts.
    const join = jobs['a11y-contracts'];
    expect(join.needs).toContain('a11y-contracts-shard');
    expect(
      step('a11y-contracts', 'Require every contract shard').run,
    ).toContain('"$SHARD_RESULT" != success');
    for (const name of [
      'Join pressed-state pixel evidence',
      'Join component-audit browser evidence',
    ]) {
      expect(step('a11y-contracts', name).uses).toBe(
        'actions/upload-artifact/merge@v7',
      );
      expect(step('a11y-contracts', name).with['delete-merged']).toBe(true);
    }
    for (const [job, name] of [
      ['pr-a11y-guards', 'Run modal close visibility guard'],
      ['pr-a11y-guards', 'Run theme var reachability guard'],
      ['pr-a11y-guards', 'Run story play guard'],
      ['pr-a11y-specs', 'Run browser accessibility specs'],
    ]) {
      expect(
        runs(step(job, name), {event: 'pull_request', operation: ''}),
        name,
      ).toBe(true);
      expect(runs(step(job, name)), name).toBe(true);
      expect(step(job, name)['continue-on-error']).toBeUndefined();
    }
  });

  it('keeps all canonical RTL packages and passes full scope to resolver and join', () => {
    expect([
      ...new Set(
        jobs['pr-rtl-shard'].strategy.matrix.include.map(leg => leg.package),
      ),
    ]).toEqual(['core', 'lab', 'charts', 'richtext', 'vega']);
    expect(step('pr-rtl-shard', 'Resolve RTL shard scope').run).toContain(
      '--force-full "${{ needs.check-components.outputs.force_full_component_audits }}"',
    );
    expect(step('pr-rtl', 'Require every applicable RTL shard').run).toContain(
      '--force-full "${{ needs.check-components.outputs.force_full_component_audits }}"',
    );
    expect(step('pr-rtl-shard', 'Require completed RTL shard report').if).toBe(
      'always()',
    );
    expect(step('pr-rtl-shard', 'Run RTL audit')['continue-on-error']).toBe(
      true,
    );
  });

  it('does not run candidate capture or validation during release checks', () => {
    for (const name of [
      'Build canonical maintenance Storybook',
      'Capture canonical visual baseline',
      'Validate canonical baseline capture',
    ]) {
      expect(runs(step('pr-visual', name)), name).toBe(false);
    }
    expect(runs(jobs['maintenance-request'])).toBe(false);
    expect(jobs).not.toHaveProperty('baseline-publication');
    expect(runs(step('pr-visual', 'Download Storybook artifact'))).toBe(true);
    const visual = step('pr-visual', 'Run full release visual check');
    expect(visual.run).toContain('gate.mjs release');
    expect(visual.run).not.toMatch(
      /--(?:sample|only|components|themes|max-shots|tiers|no-scout)\b/,
    );
    expect(visual['continue-on-error']).toBeUndefined();
    expect(
      step('pr-visual', 'Upload release visual verdict and report').with[
        'if-no-files-found'
      ],
    ).toBe('error');
  });

  it.each([
    [0, 'pass', 0],
    [2, 'changed', 0],
    [1, 'failed', 1],
    [0, 'skipped', 1],
    [0, 'unknown', 1],
    [0, '', 1],
  ])(
    'preserves canonical visual policy but rejects incomplete evidence (%s/%s)',
    (code, verdict, expected) => {
      const result = shell(
        step('pr-visual', 'Run full release visual check').run,
        {
          TEST_CODE: String(code),
          TEST_VERDICT: verdict,
          GITHUB_STEP_SUMMARY: '/dev/null',
        },
        `
        node() { return "$TEST_CODE"; }
        jq() { printf '%s' "$TEST_VERDICT"; }
        cat() { :; }
      `,
      );
      expect(result.status, result.stderr).toBe(expected);
    },
  );
});
