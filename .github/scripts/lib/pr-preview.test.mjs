// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';
import yaml from 'yaml';

import {
  branchPreviewOrigin,
  confirmOrStandDown,
  confirmSourceRunIdentity,
  PR_ANALYSIS_MARKER,
  reconcilePrComment,
  resolveWorkflowRunPullRequest,
  validateAnalysisMetadata,
} from './pr-preview.mjs';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
// The branch alias of identity() opened from the base repository; from the
// fork in identity() the alias passes 63 characters and has no link.
const VERCEL_ORIGIN =
  'https://astryx-git-fix-failed-ci-preview-links-fbopensource.vercel.app';
const ROOT = path.resolve(import.meta.dirname, '../../..');
const REQUIRE = createRequire(import.meta.url);
const ASYNC_FUNCTION = Object.getPrototypeOf(async function () {}).constructor;
const PR_COMMENT_WORKFLOW = yaml.parse(
  fs.readFileSync(path.join(ROOT, '.github/workflows/pr-comment.yml'), 'utf8'),
);
const RESOLVE_SCRIPT = PR_COMMENT_WORKFLOW.jobs.resolve.steps.find(
  step => step.name === 'Resolve trusted PR identity',
).with.script;
const EXECUTABLE_RESOLVE_SCRIPT = RESOLVE_SCRIPT.replace(
  /const \{pathToFileURL\} = require\('node:url'\);\nconst \{resolveWorkflowRunPullRequest\} = await import\([\s\S]*?\n\);/,
  'const resolveWorkflowRunPullRequest = injectedResolve;',
);
const RECONFIRM_SCRIPT = PR_COMMENT_WORKFLOW.jobs.comment.steps.find(
  step => step.name === 'Reconfirm trusted PR identity',
).with.script;
const EXECUTABLE_RECONFIRM_SCRIPT = RECONFIRM_SCRIPT.replace(
  /const \{pathToFileURL\} = require\('node:url'\);\nconst \{confirmOrStandDown\} = await import\([\s\S]*?\n\);/,
  'const confirmOrStandDown = injectedConfirm;',
);
const roots = [];

function identity(overrides = {}) {
  return {
    prNumber: 5697,
    headSha: HEAD,
    headRef: 'fix-failed-ci-preview-links',
    headRepository: 'cixzhang/astryx',
    headRepositoryId: '321',
    baseRepository: 'meta/astryx',
    baseSha: BASE,
    sourceRunId: 33321033727,
    sourceRunAttempt: 1,
    sourceConclusion: 'success',
    draft: false,
    ...overrides,
  };
}

function sourceRun(value = identity()) {
  return {
    id: value.sourceRunId,
    run_attempt: value.sourceRunAttempt,
    name: 'CI',
    event: 'pull_request',
    conclusion: value.sourceConclusion,
    head_sha: value.headSha,
    head_branch: value.headRef,
    head_repository: {
      id: Number(value.headRepositoryId),
      full_name: value.headRepository,
      owner: {login: value.headRepository.split('/')[0]},
    },
    pull_requests: [],
  };
}

function pull(value = identity()) {
  return {
    number: value.prNumber,
    state: 'open',
    draft: value.draft,
    head: {
      sha: value.headSha,
      ref: value.headRef,
      repo: {
        id: Number(value.headRepositoryId),
        full_name: value.headRepository,
      },
    },
    base: {
      sha: value.baseSha,
      repo: {full_name: value.baseRepository},
    },
  };
}

function githubFixture({value = identity(), comments = []} = {}) {
  const state = {
    comments: comments.map(comment => ({...comment})),
    created: [],
    updated: [],
    listedIssues: [],
  };
  const github = {
    rest: {
      actions: {
        getWorkflowRun: vi.fn(async () => ({data: sourceRun(value)})),
      },
      pulls: {
        get: vi.fn(async () => ({data: pull(value)})),
        list: vi.fn(async () => ({data: [pull(value)]})),
      },
      issues: {
        listComments: vi.fn(async ({issue_number}) => {
          state.listedIssues.push(issue_number);
          return {data: state.comments};
        }),
        updateComment: vi.fn(async request => {
          state.updated.push(request);
          const comment = state.comments.find(
            item => item.id === request.comment_id,
          );
          if (comment) comment.body = request.body;
          return {data: comment};
        }),
        createComment: vi.fn(async request => {
          state.created.push(request);
          const comment = {
            id: 9000 + state.created.length,
            user: {type: 'Bot'},
            body: request.body,
          };
          state.comments.push(comment);
          return {data: comment};
        }),
      },
    },
    paginate: vi.fn(async (method, request) => (await method(request)).data),
  };
  return {github, state};
}

function fixture(value = identity(), {analysis = true, a11y = true} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-preview-'));
  roots.push(root);
  const paths = {
    analysis: path.join(root, 'analysis.json'),
    metadata: path.join(root, 'pr-meta.json'),
    a11y: path.join(root, 'a11y.json'),
    visual: path.join(root, 'missing-visual.json'),
  };
  if (analysis) {
    fs.writeFileSync(
      paths.analysis,
      JSON.stringify({
        newComponents: [],
        modifiedComponents: ['Card'],
        componentStats: {Card: {package: '@astryxdesign/core'}},
        bundlePackages: [],
        totalBundle: null,
      }),
    );
    fs.writeFileSync(
      paths.metadata,
      JSON.stringify({
        prNumber: value.prNumber,
        shortHash: value.headSha.slice(0, 7),
        headSha: value.headSha,
        headRepository: value.headRepository,
        baseRepository: value.baseRepository,
        runId: value.sourceRunId,
        runAttempt: value.sourceRunAttempt,
      }),
    );
  }
  if (a11y) {
    fs.writeFileSync(
      paths.a11y,
      '{"components":{},"summary":{"componentsAudited":0,"totalViolations":0}}',
    );
  }
  return paths;
}

async function reconcile({
  value: requested = identity(),
  previewAvailable = false,
  analysis = true,
  a11y = true,
  comments = [],
  githubFixtureValue: fixtureValue,
  createIfMissing,
  fallbackMessage,
  execute,
  baseStats,
} = {}) {
  const value = previewAvailable
    ? {...requested, headRepository: requested.baseRepository}
    : requested;
  const githubFixtureValue = fixtureValue ?? value;
  const paths = fixture(value, {analysis, a11y});
  const baseStatsPath = path.join(
    path.dirname(paths.analysis),
    'size-base.json',
  );
  if (baseStats) fs.writeFileSync(baseStatsPath, JSON.stringify(baseStats));
  const {github, state} = githubFixture({
    value: githubFixtureValue,
    comments,
  });
  const core = {info: vi.fn(), warning: vi.fn()};
  const result = await reconcilePrComment({
    github,
    core,
    context: {
      repo: {owner: 'meta', repo: 'astryx'},
      serverUrl: 'https://github.com',
    },
    expectedIdentity: value,
    analysisPath: paths.analysis,
    metadataPath: paths.metadata,
    baseStatsPath,
    a11yPath: paths.a11y,
    visualPath: paths.visual,
    createIfMissing,
    fallbackMessage,
    execute,
  });
  return {result, state, core, github, paths};
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

describe('trusted PR preview identity', () => {
  it('does not treat the live pull-request base on the run as the tested base', async () => {
    // GitHub reports the pull request's live base on `run.pull_requests`, so
    // after main advances it names a base the run never tested. Checking the
    // visual report against it rejected correct reports.
    const current = identity();
    const {github} = githubFixture({value: current});
    const run = {
      ...sourceRun(current),
      pull_requests: [
        {
          number: current.prNumber,
          head: {sha: HEAD},
          base: {sha: 'c'.repeat(40)},
        },
      ],
    };
    const resolved = await resolveWorkflowRunPullRequest({
      github,
      owner: 'meta',
      repo: 'astryx',
      run,
    });
    expect(resolved).not.toHaveProperty('testedBaseSha');
    const prepare = PR_COMMENT_WORKFLOW.jobs.comment.steps.find(
      step => step.name === 'Prepare canonical visual report',
    );
    expect(prepare.env).not.toHaveProperty('BASE_SHA');
    expect(prepare.run).not.toContain('--base-sha');
  });

  it('resolves a fork run through the trusted owner and branch fallback', async () => {
    const value = identity();
    const {github} = githubFixture({value});
    const run = sourceRun(value);

    const resolved = await resolveWorkflowRunPullRequest({
      github,
      owner: 'meta',
      repo: 'astryx',
      run,
    });

    expect(resolved).toMatchObject(value);
    expect(github.rest.pulls.list).toHaveBeenCalledWith({
      owner: 'meta',
      repo: 'astryx',
      state: 'open',
      head: 'cixzhang:fix-failed-ci-preview-links',
      per_page: 100,
    });
  });

  it('skips a stale rerun when no open pull request remains', async () => {
    const value = identity();
    const {github} = githubFixture({value});
    github.rest.pulls.list.mockResolvedValue({data: []});

    await expect(
      resolveWorkflowRunPullRequest({
        github,
        owner: 'meta',
        repo: 'astryx',
        run: sourceRun(value),
      }),
    ).resolves.toBeNull();
  });

  it('skips a stale rerun whose directly referenced pull request is closed', async () => {
    const value = identity();
    const {github} = githubFixture({value});
    github.rest.pulls.get.mockResolvedValue({
      data: {...pull(value), state: 'closed'},
    });
    const run = {
      ...sourceRun(value),
      pull_requests: [{number: value.prNumber}],
    };

    await expect(
      resolveWorkflowRunPullRequest({
        github,
        owner: 'meta',
        repo: 'astryx',
        run,
      }),
    ).resolves.toBeNull();
  });

  it('executes the stale workflow path without classifying or publishing it', async () => {
    const value = identity();
    const {github} = githubFixture({value});
    const resolve = vi.fn(async () => null);
    const core = {notice: vi.fn(), setOutput: vi.fn()};
    const previousWorkspace = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = ROOT;

    try {
      await new ASYNC_FUNCTION(
        'require',
        'context',
        'github',
        'core',
        'injectedResolve',
        EXECUTABLE_RESOLVE_SCRIPT,
      )(
        REQUIRE,
        {
          repo: {owner: 'meta', repo: 'astryx'},
          payload: {workflow_run: sourceRun(value)},
        },
        github,
        core,
        resolve,
      );
    } finally {
      if (previousWorkspace === undefined) delete process.env.GITHUB_WORKSPACE;
      else process.env.GITHUB_WORKSPACE = previousWorkspace;
    }

    expect(EXECUTABLE_RESOLVE_SCRIPT).not.toBe(RESOLVE_SCRIPT);
    expect(resolve).toHaveBeenCalledWith({
      github,
      owner: 'meta',
      repo: 'astryx',
      run: sourceRun(value),
    });
    expect(core.notice).toHaveBeenCalledWith(
      expect.stringContaining('no open pull request remains'),
    );
    expect(core.setOutput).toHaveBeenCalledWith('valid', 'false');
    expect(github.rest.pulls.get).not.toHaveBeenCalled();
    expect(github.paginate).not.toHaveBeenCalled();
  });

  it.each([
    ['closed', {state: 'closed'}],
    ['pushed to a newer head', {head: {sha: 'e'.repeat(40)}}],
  ])(
    'skips the comment job without failing when the pull request is %s before it runs',
    async (_label, change) => {
      const value = identity();
      const {github} = githubFixture({value});
      const moved = pull(value);
      Object.assign(moved, change, {
        head: {...moved.head, ...change.head},
      });
      github.rest.pulls.get.mockResolvedValue({data: moved});
      const core = {info: vi.fn(), setOutput: vi.fn()};
      const previousEnv = {...process.env};
      Object.assign(process.env, {
        GITHUB_WORKSPACE: ROOT,
        PR_NUMBER: String(value.prNumber),
        HEAD_SHA: value.headSha,
        HEAD_REPOSITORY: value.headRepository,
        HEAD_REPOSITORY_ID: value.headRepositoryId,
        HEAD_REF: value.headRef,
        BASE_REPOSITORY: value.baseRepository,
        SOURCE_RUN_ID: String(value.sourceRunId),
        SOURCE_RUN_ATTEMPT: String(value.sourceRunAttempt),
        SOURCE_CONCLUSION: value.sourceConclusion,
      });

      try {
        await new ASYNC_FUNCTION(
          'require',
          'context',
          'github',
          'core',
          'injectedConfirm',
          EXECUTABLE_RECONFIRM_SCRIPT,
        )(
          REQUIRE,
          {repo: {owner: 'meta', repo: 'astryx'}},
          github,
          core,
          confirmOrStandDown,
        );
      } finally {
        process.env = previousEnv;
      }

      expect(EXECUTABLE_RECONFIRM_SCRIPT).not.toBe(RECONFIRM_SCRIPT);
      expect(core.setOutput).toHaveBeenCalledWith('valid', 'false');
      expect(core.setOutput).not.toHaveBeenCalledWith('valid', 'true');
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('nothing to publish'),
      );
    },
  );

  it('still fails the comment job when the run itself no longer matches', async () => {
    // A run's head never changes. A mismatch there is not churn.
    await expect(
      confirmOrStandDown({
        github: githubFixture({value: identity({headSha: 'f'.repeat(40)})})
          .github,
        core: {info: vi.fn()},
        owner: 'meta',
        repo: 'astryx',
        expected: identity(),
      }),
    ).rejects.toThrow(/headSha does not match/);
  });

  it('fails rather than stands down when the run differs and the pull request also moved', async () => {
    const value = identity();
    const {github} = githubFixture({value});
    github.rest.actions.getWorkflowRun.mockResolvedValue({
      data: sourceRun(identity({headSha: 'f'.repeat(40)})),
    });
    github.rest.pulls.get.mockResolvedValue({
      data: pull(identity({headSha: 'e'.repeat(40)})),
    });
    await expect(
      confirmOrStandDown({
        github,
        core: {info: vi.fn()},
        owner: 'meta',
        repo: 'astryx',
        expected: value,
      }),
    ).rejects.toThrow(/headSha does not match/);
  });

  it('keeps every write-capable job behind the valid identity output', () => {
    const writeCapableJobs = Object.entries(PR_COMMENT_WORKFLOW.jobs)
      .filter(([, job]) =>
        Object.values(job.permissions ?? {}).some(value => value === 'write'),
      )
      .map(([name]) => name);

    expect(writeCapableJobs).toEqual([
      'spec-only-reconcile',
      'comment',
      'report',
    ]);
    // The report job writes only a commit status, for the head the trusted
    // event names; it mutates no pull request.
    expect(PR_COMMENT_WORKFLOW.jobs.report.permissions).toEqual({
      statuses: 'write',
    });
    for (const name of writeCapableJobs.filter(job => job !== 'report')) {
      expect(PR_COMMENT_WORKFLOW.jobs[name].if, name).toContain(
        "needs.resolve.outputs.valid == 'true'",
      );
    }
  });

  it('skips a stale rerun whose pull request has moved to a newer head', async () => {
    // The branch was pushed after the source run was rerun: the run's report
    // has no current pull request, and the newer head has its own run.
    const trusted = identity();
    const moved = identity({headSha: 'e'.repeat(40)});
    const {github} = githubFixture({value: moved});

    await expect(
      resolveWorkflowRunPullRequest({
        github,
        owner: 'meta',
        repo: 'astryx',
        run: sourceRun(trusted),
      }),
    ).resolves.toBeNull();
  });

  it.each([
    ['wrong head repository', {headRepository: 'someone/astryx'}],
    ['wrong base repository', {baseRepository: 'someone/astryx'}],
  ])('rejects a candidate with the %s', async (_label, overrides) => {
    const trusted = identity();
    const candidate = identity(overrides);
    const {github} = githubFixture({value: candidate});

    await expect(
      resolveWorkflowRunPullRequest({
        github,
        owner: 'meta',
        repo: 'astryx',
        run: sourceRun(trusted),
      }),
    ).rejects.toThrow(/expected exactly one current pull request/);
  });

  it('rejects workflow dispatch without a PR-backed CI run', async () => {
    const value = identity();
    const {github} = githubFixture({value});
    const run = {...sourceRun(value), event: 'workflow_dispatch'};

    await expect(
      resolveWorkflowRunPullRequest({
        github,
        owner: 'meta',
        repo: 'astryx',
        run,
      }),
    ).rejects.toThrow(/expected exactly one current pull request/);
  });
});

describe('PR Comment keeps its outcome off main', () => {
  // workflow_run attaches these jobs to main's latest commit, so a failing step
  // here would turn main red for a pull request's problem.
  const LANE = ['resolve', 'spec-only-reconcile', 'comment', 'report'];
  const OPTIONAL = new Set(['actions/download-artifact@v8']);

  it.each(LANE)('never fails the run from the %s job', name => {
    for (const step of PR_COMMENT_WORKFLOW.jobs[name].steps) {
      expect(step['continue-on-error'], `${name}: ${step.name}`).toBe(true);
    }
  });

  it.each(['resolve', 'spec-only-reconcile', 'comment'])(
    'counts every required %s step in the outcome it reports',
    name => {
      const job = PR_COMMENT_WORKFLOW.jobs[name];
      for (const step of job.steps.filter(item => !OPTIONAL.has(item.uses))) {
        expect(step.id, `${name}: ${step.name}`).toBeTruthy();
        expect(job.outputs.failed, `${name}: ${step.name}`).toContain(
          `steps.${step.id}.outcome == 'failure'`,
        );
      }
      for (const step of job.steps.filter(item => OPTIONAL.has(item.uses))) {
        expect(job.outputs.failed).not.toContain(`steps.${step.id}.`);
      }
    },
  );

  it('reports the outcome on the head of the run the event names', () => {
    const report = PR_COMMENT_WORKFLOW.jobs.report;
    expect(report.needs).toEqual(['resolve', 'spec-only-reconcile', 'comment']);
    const [step] = report.steps;
    expect(step.env.HEAD_SHA).toBe('${{ github.event.workflow_run.head_sha }}');
    for (const name of ['resolve', 'spec-only-reconcile', 'comment']) {
      expect(step.env.FAILED).toContain(
        `needs.${name}.outputs.failed == 'true'`,
      );
    }
    // A cancelled job published nothing; it is not an up-to-date report.
    expect(step.env.FAILED).toContain("contains(needs.*.result, 'cancelled')");
  });

  it.each([
    [
      'resolve',
      'Resolve trusted PR identity',
      "steps.checkout.outcome == 'success'",
    ],
    [
      'spec-only-reconcile',
      'Remove stale preview links from an existing report',
      "steps.checkout.outcome == 'success'",
    ],
    [
      'comment',
      'Reconfirm trusted PR identity',
      "steps.setup.outcome == 'success'",
    ],
  ])(
    'still skips the %s work after its checkout or install fails',
    (job, name, condition) => {
      const step = PR_COMMENT_WORKFLOW.jobs[job].steps.find(
        item => item.name === name,
      );
      expect(step.if).toBe(condition);
    },
  );

  it('gates every later comment step on the confirmed identity', () => {
    const steps = PR_COMMENT_WORKFLOW.jobs.comment.steps;
    const after = steps.slice(
      steps.findIndex(step => step.id === 'identity') + 1,
    );
    for (const step of after) {
      expect(step.if, step.name).toContain(
        "steps.identity.outputs.valid == 'true'",
      );
    }
  });

  it.each([
    ['true', 'failure'],
    ['false', 'success'],
  ])('posts PR Comment as a status when FAILED=%s', async (failed, state) => {
    const [step] = PR_COMMENT_WORKFLOW.jobs.report.steps;
    const createCommitStatus = vi.fn(async () => ({}));
    const previousEnv = {...process.env};
    Object.assign(process.env, {HEAD_SHA: HEAD, FAILED: failed});
    try {
      await new ASYNC_FUNCTION('context', 'github', step.with.script)(
        {
          repo: {owner: 'meta', repo: 'astryx'},
          serverUrl: 'https://github.com',
          runId: 42,
        },
        {rest: {repos: {createCommitStatus}}},
      );
    } finally {
      process.env = previousEnv;
    }
    expect(createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'meta',
        repo: 'astryx',
        sha: HEAD,
        context: 'PR Comment',
        state,
        target_url: 'https://github.com/meta/astryx/actions/runs/42',
      }),
    );
  });
});

describe('confirmSourceRunIdentity reads the attempt the event reported', () => {
  it('accepts the reported attempt after a newer rerun of the same run started', async () => {
    const expected = identity({
      sourceRunAttempt: 1,
      sourceConclusion: 'failure',
    });
    const {github} = githubFixture({value: expected});
    // The latest attempt is a rerun still in progress; the event was for attempt 1.
    github.rest.actions.getWorkflowRun.mockResolvedValue({
      data: {...sourceRun(expected), run_attempt: 2, conclusion: null},
    });
    github.rest.actions.getWorkflowRunAttempt = vi.fn(
      async ({attempt_number}) => ({
        data: {...sourceRun(expected), run_attempt: attempt_number},
      }),
    );

    await expect(
      confirmSourceRunIdentity({
        github,
        owner: 'meta',
        repo: 'astryx',
        expected,
      }),
    ).resolves.toMatchObject({
      sourceRunId: expected.sourceRunId,
      sourceRunAttempt: 1,
      headSha: expected.headSha,
    });
    expect(github.rest.actions.getWorkflowRunAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        run_id: expected.sourceRunId,
        attempt_number: 1,
      }),
    );
  });

  it('still refuses when the reported attempt tested a different head', async () => {
    const expected = identity({sourceRunAttempt: 1});
    const {github} = githubFixture({value: expected});
    github.rest.actions.getWorkflowRunAttempt = vi.fn(async () => ({
      data: {...sourceRun(expected), head_sha: 'e'.repeat(40)},
    }));

    await expect(
      confirmSourceRunIdentity({
        github,
        owner: 'meta',
        repo: 'astryx',
        expected,
      }),
    ).rejects.toThrow(/does not match/);
  });

  it('falls back to the latest attempt when the client cannot read one attempt', async () => {
    const expected = identity({sourceRunAttempt: 1});
    const {github} = githubFixture({value: expected});
    delete github.rest.actions.getWorkflowRunAttempt;

    await expect(
      confirmSourceRunIdentity({
        github,
        owner: 'meta',
        repo: 'astryx',
        expected,
      }),
    ).resolves.toMatchObject({sourceRunAttempt: 1});
  });
});

describe('analysis metadata compatibility', () => {
  it('accepts legacy metadata only when trusted run, PR, and head prefix match', () => {
    const value = identity();
    expect(
      validateAnalysisMetadata(
        {
          prNumber: String(value.prNumber),
          shortHash: value.headSha.slice(0, 7),
          runId: String(value.sourceRunId),
        },
        value,
      ),
    ).toBeDefined();
  });

  it.each([
    ['prNumber', '9999', /pull request/],
    ['shortHash', '1234567', /short hash/],
    ['runId', '9999', /source run/],
  ])('rejects mismatched legacy %s', (field, mismatch, error) => {
    const value = identity();
    expect(() =>
      validateAnalysisMetadata(
        {
          prNumber: String(value.prNumber),
          shortHash: value.headSha.slice(0, 7),
          runId: String(value.sourceRunId),
          [field]: mismatch,
        },
        value,
      ),
    ).toThrow(error);
  });

  it('accepts analysis from an earlier attempt of the same run, never a later one', () => {
    // Rerunning only the failed jobs keeps the passing build job's artifact,
    // so attempt 3 reports with analysis written by attempt 1.
    const value = identity({sourceRunAttempt: 3});
    const metadata = runAttempt => ({
      prNumber: value.prNumber,
      shortHash: value.headSha.slice(0, 7),
      headSha: value.headSha,
      headRepository: value.headRepository,
      baseRepository: value.baseRepository,
      runId: value.sourceRunId,
      runAttempt,
    });
    expect(validateAnalysisMetadata(metadata('1'), value)).toBeDefined();
    expect(validateAnalysisMetadata(metadata('3'), value)).toBeDefined();
    for (const attempt of ['4', '0', 'x']) {
      expect(() => validateAnalysisMetadata(metadata(attempt), value)).toThrow(
        /attempt does not match/,
      );
    }
  });

  it('does not ignore mismatched exact identity fields when they are present', () => {
    const value = identity();
    expect(() =>
      validateAnalysisMetadata(
        {
          prNumber: value.prNumber,
          shortHash: value.headSha.slice(0, 7),
          headSha: 'f'.repeat(40),
          headRepository: value.headRepository,
          baseRepository: value.baseRepository,
          runId: value.sourceRunId,
          runAttempt: value.sourceRunAttempt,
        },
        value,
      ),
    ).toThrow(/analysis head does not match/);
  });
});

describe('PR comment preview reconciliation', () => {
  it.each([
    ['alias past 63 characters', false],
    ['alias known', true],
  ])('shows both or neither branch links: %s', async (_label, ready) => {
    const {result} = await reconcile({previewAvailable: ready});
    expect(result.body.includes('View Storybook for this PR')).toBe(ready);
    expect(result.body.includes('View Sandbox for this PR')).toBe(ready);
    expect(result.body.includes('> **Preview availability:**')).toBe(!ready);
    if (ready) {
      expect(result.body).toContain(`${VERCEL_ORIGIN}/storybook/`);
      expect(result.body).toContain(`${VERCEL_ORIGIN}/sandbox/`);
    }
    expect(result.body).not.toContain('facebook.github.io/astryx/pr/');
  });

  describe('the fallback report, when there is no trusted analysis', () => {
    const failRender = () => {
      throw new Error('malformed analysis');
    };

    it('links the branch alias under the same preview note as the report', async () => {
      const {result} = await reconcile({
        previewAvailable: true,
        createIfMissing: true,
        execute: failRender,
      });
      expect(result.body).toContain('trusted analysis is unavailable');
      expect(result.body).toContain('> **Preview:** the links below open');
      expect(result.body).toContain('View Storybook for this PR');
    });

    it('points to Vercel when the alias cannot be computed', async () => {
      const {result} = await reconcile({
        value: identity({headRef: `feat/${'long-branch-name-'.repeat(4)}`}),
        previewAvailable: true,
        createIfMissing: true,
        execute: failRender,
      });
      expect(result.body).toContain('> **Preview availability:**');
      expect(result.body).not.toContain('View Storybook for this PR');
    });

    it('says nothing about previews on a draft', async () => {
      const {result} = await reconcile({
        value: identity({draft: true}),
        previewAvailable: true,
        createIfMissing: true,
        execute: failRender,
      });
      expect(result.body).toContain('trusted analysis is unavailable');
      expect(result.body).not.toContain('Preview');
      expect(result.body).not.toContain("Vercel's comment");
      expect(result.body).not.toContain('View Storybook for this PR');
    });
  });

  it('says nothing about previews on a draft', async () => {
    const {result} = await reconcile({value: identity({draft: true})});
    expect(result.body).not.toContain('Preview availability');
    expect(result.body).not.toContain('View Storybook for this PR');
  });

  it('says the accessibility audit did not run when there is no report', async () => {
    const {result} = await reconcile({a11y: false});
    expect(result.body).toContain('did not run on this pull request');
    expect(result.body).not.toContain('No accessibility violations detected');
  });

  it('keeps current trustworthy analysis when source CI fails', async () => {
    const value = identity({sourceConclusion: 'failure'});
    const {result} = await reconcile({value});

    expect(result.body).toContain('Modified Components');
    expect(result.body).toContain('Card');
    expect(result.body).toContain('CI concluded failure');
    expect(result.body).not.toContain('View Storybook for this PR');
    expect(result.body).not.toContain('View Sandbox for this PR');
  });

  it('shows the branch preview even when unrelated CI analysis fails', async () => {
    const value = identity({sourceConclusion: 'failure'});
    const {result} = await reconcile({
      value,
      analysis: false,
      previewAvailable: true,
    });
    expect(result.body).toContain('concluded failure');
    expect(result.body).toContain(`${VERCEL_ORIGIN}/storybook/`);
    expect(result.body).toContain(`${VERCEL_ORIGIN}/sandbox/`);
  });

  it('replaces a stale linked comment when failed CI has no analysis artifact', async () => {
    const value = identity({sourceConclusion: 'failure'});
    const stale = {
      id: 77,
      user: {type: 'Bot'},
      body: `## PR Analysis Report\n\n### 📚 Storybook Preview\nhttps://facebook.github.io/astryx/pr/5697/\n\n### 🧪 Sandbox Preview\nhttps://facebook.github.io/astryx/pr/5697/sandbox/`,
    };

    const {result, state} = await reconcile({
      value,
      analysis: false,
      comments: [stale],
    });

    expect(result.action).toBe('updated');
    expect(state.created).toHaveLength(0);
    expect(state.updated).toHaveLength(1);
    expect(result.body).toContain(PR_ANALYSIS_MARKER);
    expect(result.body).toContain('concluded failure');
    expect(result.body).not.toContain('/pr/5697/');
  });

  it('reconciles an existing spec-only report without creating a new one', async () => {
    const message =
      'The current change only updates durable specifications. Preview links are not shown.';
    const withoutPrior = await reconcile({
      analysis: false,
      createIfMissing: false,
      fallbackMessage: message,
    });
    expect(withoutPrior.result.action).toBe('none');
    expect(withoutPrior.state.created).toHaveLength(0);
    expect(withoutPrior.state.updated).toHaveLength(0);

    const stale = {
      id: 79,
      user: {type: 'Bot'},
      body: '## PR Analysis Report\nhttps://facebook.github.io/astryx/pr/5697/',
    };
    const withPrior = await reconcile({
      analysis: false,
      comments: [stale],
      createIfMissing: false,
      fallbackMessage: message,
    });
    expect(withPrior.result.action).toBe('updated');
    expect(withPrior.result.body).toContain(message);
    expect(withPrior.result.body).not.toContain('/pr/5697/');
    expect(withPrior.state.created).toHaveLength(0);
    expect(withPrior.state.updated).toHaveLength(1);
  });

  it.each([
    ['the exact head', HEAD, true],
    ['another head', 'b'.repeat(40), false],
  ])(
    'passes base size stats only when they name %s',
    async (_label, headSha, used) => {
      const seen = [];
      await reconcile({
        baseStats: {headSha, baseComponentStats: {}, baseBundlePackages: []},
        execute: (_node, args) => {
          seen.push(args);
          return '## PR Analysis Report\n';
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0].includes('--base-stats')).toBe(used);
    },
  );

  it('falls back to a safe current message when analysis rendering fails', async () => {
    const stale = {
      id: 78,
      user: {type: 'Bot'},
      body: '## PR Analysis Report\nhttps://facebook.github.io/astryx/pr/5697/',
    };

    const {result, core} = await reconcile({
      comments: [stale],
      execute: () => {
        throw new Error('malformed analysis');
      },
    });

    expect(result.body).toContain('trusted analysis is unavailable');
    expect(result.body).not.toContain(
      'https://facebook.github.io/astryx/pr/5697/sandbox/',
    );
    expect(result.body).not.toContain('View Storybook for this PR');
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Could not render current analysis'),
    );
  });

  it('stands down when an earlier attempt reports after a newer attempt exists', async () => {
    const first = identity({sourceRunAttempt: 1, sourceConclusion: 'failure'});
    const harness = githubFixture({value: first});
    const firstPaths = fixture(first);
    const core = {info: vi.fn(), warning: vi.fn()};
    // Attempt 2 is the run's latest; the event being processed is attempt 1's.
    harness.github.rest.actions.getWorkflowRun.mockResolvedValue({
      data: {...sourceRun(first), run_attempt: 2, conclusion: 'success'},
    });
    harness.github.rest.actions.getWorkflowRunAttempt = vi.fn(async () => ({
      data: sourceRun(first),
    }));

    const result = await reconcilePrComment({
      github: harness.github,
      core,
      context: {
        repo: {owner: 'meta', repo: 'astryx'},
        serverUrl: 'https://github.com',
      },
      expectedIdentity: first,
      analysisPath: firstPaths.analysis,
      metadataPath: firstPaths.metadata,
      a11yPath: firstPaths.a11y,
      visualPath: firstPaths.visual,
    });

    expect(result.action).toBe('none');
    expect(harness.state.created).toHaveLength(0);
    expect(harness.state.updated).toHaveLength(0);
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('supersedes the reported attempt 1'),
    );
  });

  it('updates one same-PR comment across repeated source attempts', async () => {
    const first = identity({headRepository: 'meta/astryx'});
    const harness = githubFixture({value: first});
    const firstPaths = fixture(first);
    const core = {info: vi.fn(), warning: vi.fn()};
    const common = {
      github: harness.github,
      core,
      context: {
        repo: {owner: 'meta', repo: 'astryx'},
        serverUrl: 'https://github.com',
      },
      visualPath: firstPaths.visual,
    };

    await reconcilePrComment({
      ...common,
      expectedIdentity: first,
      analysisPath: firstPaths.analysis,
      metadataPath: firstPaths.metadata,
      a11yPath: firstPaths.a11y,
    });

    const second = identity({
      headRepository: 'meta/astryx',
      sourceRunAttempt: 2,
    });
    harness.github.rest.actions.getWorkflowRun.mockResolvedValue({
      data: sourceRun(second),
    });
    harness.github.rest.pulls.get.mockResolvedValue({data: pull(second)});
    const secondPaths = fixture(second, {});
    await reconcilePrComment({
      ...common,
      expectedIdentity: second,
      analysisPath: secondPaths.analysis,
      metadataPath: secondPaths.metadata,
      a11yPath: secondPaths.a11y,
      visualPath: secondPaths.visual,
    });

    expect(harness.state.created).toHaveLength(1);
    expect(harness.state.updated).toHaveLength(1);
    expect(harness.state.comments).toHaveLength(1);
    expect(harness.state.comments[0].body).toContain(
      'View Storybook for this PR',
    );
    expect(harness.state.comments[0].body).toContain(
      'View Sandbox for this PR',
    );
    expect(harness.state.listedIssues).toEqual([5697, 5697]);
  });

  it('does not mutate any PR after the source identity becomes stale', async () => {
    const expected = identity();
    const current = identity({headSha: 'f'.repeat(40)});
    const paths = fixture(expected);
    const {github, state} = githubFixture({value: current});

    await expect(
      reconcilePrComment({
        github,
        core: {info: vi.fn(), warning: vi.fn()},
        context: {
          repo: {owner: 'meta', repo: 'astryx'},
          serverUrl: 'https://github.com',
        },
        expectedIdentity: expected,
        analysisPath: paths.analysis,
        metadataPath: paths.metadata,
        a11yPath: paths.a11y,
        visualPath: paths.visual,
      }),
    ).rejects.toThrow(/headSha does not match/);
    expect(state.created).toHaveLength(0);
    expect(state.updated).toHaveLength(0);
    expect(state.listedIssues).toHaveLength(0);
  });

  it('stands down without writing when the head moves while the report renders', async () => {
    const expected = identity();
    const current = identity({headSha: 'f'.repeat(40)});
    const paths = fixture(expected);
    const {github, state} = githubFixture({value: expected});
    const core = {info: vi.fn(), warning: vi.fn()};
    const result = await reconcilePrComment({
      github,
      core,
      context: {
        repo: {owner: 'meta', repo: 'astryx'},
        serverUrl: 'https://github.com',
      },
      expectedIdentity: expected,
      analysisPath: paths.analysis,
      metadataPath: paths.metadata,
      a11yPath: paths.a11y,
      visualPath: paths.visual,
      execute: (command, args, options) => {
        github.rest.pulls.get.mockResolvedValue({data: pull(current)});
        return execFileSync(command, args, options);
      },
    });
    expect(result.action).toBe('none');
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('head does not match source run'),
    );
    expect(state.created).toHaveLength(0);
    expect(state.updated).toHaveLength(0);
  });

  it('does not emit links for dispatch without a PR-backed source run', async () => {
    const value = identity();
    const paths = fixture(value);
    const {github, state} = githubFixture({value});
    github.rest.actions.getWorkflowRun.mockResolvedValue({
      data: {...sourceRun(value), event: 'workflow_dispatch'},
    });

    await expect(
      reconcilePrComment({
        github,
        core: {info: vi.fn(), warning: vi.fn()},
        context: {
          repo: {owner: 'meta', repo: 'astryx'},
          serverUrl: 'https://github.com',
        },
        expectedIdentity: value,
        analysisPath: paths.analysis,
        metadataPath: paths.metadata,
        a11yPath: paths.a11y,
        visualPath: paths.visual,
      }),
    ).rejects.toThrow(/not backed by a pull request/);
    expect(state.created).toHaveLength(0);
    expect(state.updated).toHaveLength(0);
  });

  it('renders the current successful path with the branch links', async () => {
    const value = identity();
    const {result, state} = await reconcile({
      value,
      previewAvailable: true,
    });

    expect(result.action).toBe('created');
    expect(result.body).toContain(PR_ANALYSIS_MARKER);
    expect(result.body).toContain(`${VERCEL_ORIGIN}/storybook/`);
    expect(result.body).toContain(`${VERCEL_ORIGIN}/sandbox/`);
    expect(state.created[0].issue_number).toBe(5697);
    expect(state.listedIssues).toEqual([5697]);
  });

  it.each([
    [
      'a branch in the repository',
      'meta/astryx',
      'fix/dropdown-section-submenu',
      'https://astryx-git-fix-dropdown-section-submenu-fbopensource.vercel.app',
    ],
    [
      'a fork',
      'kyu-rong/astryx',
      'Fix_Slider',
      'https://astryx-git-fork-kyu-rong-fix-slider-fbopensource.vercel.app',
    ],
    [
      'an alias past 63 characters',
      'kyu-rong/astryx',
      'fix-slider-keep-caller-aria-labelledby',
      null,
    ],
  ])(
    'links the Vercel branch alias for %s',
    (_label, headRepository, headRef, origin) => {
      expect(
        branchPreviewOrigin({
          headRef,
          headRepository,
          baseRepository: 'meta/astryx',
        }),
      ).toBe(origin);
    },
  );
});
