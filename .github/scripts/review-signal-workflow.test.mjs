// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Review signal workflow contracts, including executable helper loading.
 * @input The actual privileged script, trusted helper bytes, and stub GitHub APIs.
 * @output Ref-provenance, fail-closed, and unchanged review-routing assertions.
 * @position Node regression coverage for review-signal.yml.
 */

import {Buffer} from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import YAML from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/review-signal.yml'),
  'utf8',
);
const parsed = YAML.parse(workflow);
const script = parsed.jobs.flag.steps.find(
  step => step.name === 'Detect signals and route',
).with.script;
const HELPER_PATH = '.github/scripts/review-signal-decision.cjs';
const WORKFLOW_SHA = '1'.repeat(40);
const OLD_BASE = '2'.repeat(40);
const HEAD = '3'.repeat(40);

async function runSignal({
  eventName = 'workflow_dispatch',
  baseSha = OLD_BASE,
  backfill = false,
  helperMissing = false,
  reviews = [],
  reviewApp = '',
  permission = 'write',
  rateRemaining = 5000,
  batch = '',
  draft = false,
  // The spec-owner job's decision for a PR that changes no spec record.
  specStatuses = [
    {
      context: 'spec-owner-approval',
      state: 'success',
      description: 'Mirrors review-required · spec ok',
      creator: {login: 'github-actions[bot]'},
    },
  ],
} = {}) {
  const pr = {
    number: 42,
    user: {login: 'contributor', type: 'User'},
    base: {sha: baseSha, ref: 'main'},
    head: {sha: HEAD, ref: 'feature'},
    changed_files: 1,
    draft,
    labels: [{name: 'needs:code-review'}, {name: 'community'}],
  };
  const mutations = {
    createCommitStatus: vi.fn(),
    addLabels: vi.fn(),
    removeLabel: vi.fn(),
    requestReviewers: vi.fn(),
    updateCheck: vi.fn(),
    graphql: vi.fn(),
  };
  const getContent = vi.fn(async ({path: filePath, ref}) => {
    if (filePath === HELPER_PATH) {
      if (ref !== WORKFLOW_SHA || helperMissing) {
        throw Object.assign(new Error('Not Found'), {status: 404});
      }
    } else if (
      filePath !== '.github/scripts/lib/classify-visual.js' ||
      ref !== baseSha
    ) {
      throw new Error(`Unexpected content read: ${ref}:${filePath}`);
    }
    return {
      data: {
        type: 'file',
        content: Buffer.from(
          fs.readFileSync(path.join(root, filePath)),
        ).toString('base64'),
      },
    };
  });
  const github = {
    paginate: async (method, options) => (await method(options)).data,
    request: async () => ({data: ''}),
    graphql: mutations.graphql,
    rest: {
      pulls: {
        get: vi.fn(async () => ({data: pr})),
        // Like GitHub's list endpoint, the listed PR omits changed_files.
        list: vi.fn(async () => ({data: [{...pr, changed_files: undefined}]})),
        listFiles: vi.fn(async () => ({
          data: [{filename: 'README.md', status: 'modified'}],
        })),
        listReviews: async () => ({data: reviews}),
        requestReviewers: mutations.requestReviewers,
      },
      repos: {
        getContent,
        createCommitStatus: mutations.createCommitStatus,
        listCommitStatusesForRef: vi.fn(async () => ({
          data:
            typeof specStatuses === 'function' ? specStatuses() : specStatuses,
        })),
        getCollaboratorPermissionLevel: vi.fn(async () => {
          if (permission instanceof Error) throw permission;
          return {data: {permission}};
        }),
      },
      issues: {
        addLabels: mutations.addLabels,
        removeLabel: mutations.removeLabel,
      },
      rateLimit: {
        get: vi.fn(async () => ({
          data: {
            resources: {
              core: {remaining: rateRemaining, limit: 5000, reset: 1793412000},
            },
          },
        })),
      },
      checks: {
        listForRef: async () => ({data: {check_runs: []}}),
        update: mutations.updateCheck,
      },
    },
  };
  const core = {info: vi.fn(), warning: vi.fn(), setFailed: vi.fn()};
  const execute = new Function(
    'github',
    'context',
    'core',
    'process',
    'Buffer',
    `return (async () => {\n${script}\n})();`,
  );
  await execute(
    github,
    {
      repo: {owner: 'meta', repo: 'astryx'},
      sha: WORKFLOW_SHA,
      eventName,
      payload:
        eventName === 'workflow_dispatch'
          ? {inputs: {pr: backfill ? '' : '42', batch}}
          : {pull_request: pr},
    },
    core,
    {
      env: {
        ...parsed.env,
        ENG_OWNERS: '@engineer',
        DESIGN_OWNERS: '@designer',
        REVIEW_APP: reviewApp,
      },
    },
    Buffer,
  );
  return {github, core, mutations, getContent};
}

function expectTrustedHelperRead(getContent) {
  expect(
    getContent.mock.calls
      .map(([input]) => input)
      .filter(input => input.path === HELPER_PATH),
  ).toEqual([
    {
      owner: 'meta',
      repo: 'astryx',
      ref: WORKFLOW_SHA,
      path: HELPER_PATH,
    },
  ]);
}

describe('review-signal trusted helper ref', () => {
  it('only runs the helper-loading job in trusted execution contexts', () => {
    expect(parsed.jobs.flag.if.trim()).toBe(
      "github.event_name == 'pull_request_target' || github.event_name == 'workflow_dispatch'",
    );
    expect(
      parsed.jobs.flag.steps.some(step =>
        step.uses?.startsWith('actions/checkout@'),
      ),
    ).toBe(false);
  });

  it.each([
    ['old-base dispatch', {eventName: 'workflow_dispatch'}],
    ['old-base backfill', {eventName: 'workflow_dispatch', backfill: true}],
    [
      'current-base dispatch',
      {eventName: 'workflow_dispatch', baseSha: WORKFLOW_SHA},
    ],
    ['old-base PR event', {eventName: 'pull_request_target'}],
    [
      'current-base PR event',
      {eventName: 'pull_request_target', baseSha: WORKFLOW_SHA},
    ],
  ])(
    'loads the helper from the workflow SHA for %s',
    async (_name, options) => {
      const h = await runSignal(options);
      expectTrustedHelperRead(h.getContent);
      expect(h.core.setFailed).not.toHaveBeenCalled();
      expect(h.core.warning).not.toHaveBeenCalled();
      expect(h.mutations.createCommitStatus).toHaveBeenCalledExactlyOnceWith({
        owner: 'meta',
        repo: 'astryx',
        sha: HEAD,
        context: 'review-required',
        state: 'pending',
        description: 'Waiting on code review: community contribution',
      });
      if (options.eventName === 'workflow_dispatch') {
        // A backfill lists the open PRs, then reads each in full.
        if (options.backfill) {
          expect(h.github.rest.pulls.list).toHaveBeenCalledOnce();
        }
        expect(h.github.rest.pulls.get).toHaveBeenCalledOnce();
      } else {
        expect(h.github.rest.pulls.get).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    ['its batch', {batch: '1/2'}, true],
    ['another batch', {batch: '2/2'}, false],
    ['a draft', {draft: true}, false],
  ])(
    'a backfill flags a PR in %s only when it should',
    async (_name, options, flagged) => {
      const h = await runSignal({
        eventName: 'workflow_dispatch',
        backfill: true,
        ...options,
      });
      expect(h.core.setFailed).not.toHaveBeenCalled();
      expect(h.mutations.createCommitStatus).toHaveBeenCalledTimes(
        flagged ? 1 : 0,
      );
    },
  );

  it('refuses a malformed batch before reading any PR', async () => {
    const h = await runSignal({
      eventName: 'workflow_dispatch',
      backfill: true,
      batch: '3/2',
    });
    expect(h.core.setFailed).toHaveBeenCalledExactlyOnceWith(
      'batch must be k/n with 1 <= k <= n; got "3/2".',
    );
    expect(h.github.rest.pulls.get).not.toHaveBeenCalled();
  });

  it('stops a backfill before the token runs low, and says so', async () => {
    const h = await runSignal({
      eventName: 'workflow_dispatch',
      backfill: true,
      rateRemaining: 1000,
    });
    expect(h.core.setFailed).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(
        'Backfill stopped before PR #42 (1 left): 1000 of 5000',
      ),
    );
    expect(h.github.rest.pulls.get).not.toHaveBeenCalled();
    expect(h.mutations.createCommitStatus).not.toHaveBeenCalled();
  });

  it.each(['workflow_dispatch', 'pull_request_target'])(
    'fails closed if the helper is missing at the workflow SHA for %s',
    async eventName => {
      const h = await runSignal({eventName, helperMissing: true});
      expectTrustedHelperRead(h.getContent);
      expect(h.core.warning).toHaveBeenCalledWith(
        'Failed to flag PR #42: Not Found',
      );
      expect(h.core.setFailed).toHaveBeenCalledExactlyOnceWith(
        'One or more PRs failed to flag; see warnings.',
      );
      expect(h.github.rest.pulls.listFiles).not.toHaveBeenCalled();
      for (const mutation of Object.values(h.mutations)) {
        expect(mutation).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    [OLD_BASE, 'pending'],
    [HEAD, 'success'],
  ])(
    'keeps approval bound to the current PR head, not the helper ref (%s)',
    async (reviewedSha, state) => {
      const h = await runSignal({
        reviews: [
          {
            user: {login: 'engineer'},
            state: 'APPROVED',
            commit_id: reviewedSha,
          },
        ],
      });
      expectTrustedHelperRead(h.getContent);
      expect(h.core.setFailed).not.toHaveBeenCalled();
      expect(h.mutations.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({sha: HEAD, state}),
      );
    },
  );
});

describe('review-signal appearance-only contract', () => {
  it('keeps the embedded privileged script syntactically valid', () => {
    const parsed = YAML.parse(workflow);
    const script = parsed.jobs.flag.steps.find(
      step => step.name === 'Detect signals and route',
    ).with.script;
    expect(
      () =>
        new Function(
          'github',
          'context',
          'core',
          'process',
          'Buffer',
          `return (async () => {\n${script}\n})();`,
        ),
    ).not.toThrow();
  });

  it('loads the dependency-free classifier and trusted base/head source bytes', () => {
    expect(workflow).not.toContain('ref: pr.base.ref');
    expect(workflow).toContain('ref: pr.base.sha');
    expect(workflow).toContain(
      "path: '.github/scripts/lib/classify-visual.js'",
    );
    expect(workflow).toContain('pr.base.repo.full_name');
    expect(workflow).toContain('pr.base.sha');
    expect(workflow).toContain('pr.head.repo.full_name');
    expect(workflow).toContain('pr.head.sha');
    expect(workflow).toContain(
      'sources[file.filename] = {base: baseSource, head: headSource}',
    );
    expect(workflow).toContain('if (coreChange || designReasons.length === 0)');
    expect(workflow).toContain(
      "throw new Error('classify-visual.js must stay dependency-free')",
    );
  });

  it('resolves engineering and design approvals only for the current head', () => {
    expect(workflow).toContain(
      "path: '.github/scripts/review-signal-decision.cjs'",
    );
    expect(workflow).toContain('headSha: pr.head.sha');
    expect(workflow).toContain('codeHighRisk && codeApproved');
    expect(workflow).toContain("'Cleared by code-owner approval.'");
    expect(workflow).toContain(
      "throw new Error('review-signal-decision.cjs must stay dependency-free')",
    );
  });

  it('routes safe-space changes using both current and previous paths', () => {
    expect(workflow).toContain(
      'reviewDecision.classifyReviewSignalPaths(allFiles)',
    );
    expect(workflow).toContain('hasSafeBoundaryRename');
    expect(workflow).toContain(
      "codeReasons.push('safe-space boundary rename')",
    );
    expect(workflow).toContain(
      'const isSafeSpace = reviewDecision.isSafeSpace',
    );
    expect(workflow).not.toContain('!isLab(f.filename)');
  });

  it('anchors approval, changes-requested, and dismissal review events', () => {
    expect(workflow).toContain('types: [submitted, dismissed]');
    expect(workflow).toContain(
      'contains(fromJSON(\'["approved","changes_requested","dismissed"]\'), github.event.review.state)',
    );
  });

  it('limits self-service to a DESIGNOWNER with only the proven Core visual reason', () => {
    expect(workflow).toContain(
      'const appearanceOnly = visualClassification?.appearanceOnly === true',
    );
    expect(workflow).toContain(
      "codeReasons.length === 1 && codeReasons[0] === 'core visual change'",
    );
    expect(workflow).toContain(
      'authorIsDesign && appearanceOnly && onlyCoreVisualChange',
    );
    expect(workflow).toContain('!designOwnerAppearanceSelfServe');
  });

  it('keeps contributors and classifier failures on the engineering gate', () => {
    const communityReason = workflow.indexOf(
      "codeReasons.push('community contribution')",
    );
    const narrowReasonCheck = workflow.indexOf(
      "codeReasons.length === 1 && codeReasons[0] === 'core visual change'",
    );
    expect(communityReason).toBeGreaterThan(-1);
    expect(narrowReasonCheck).toBeGreaterThan(communityReason);
    expect(workflow).toContain('let visualClassification = null');
    expect(workflow).toContain(
      'Content-based visual classification failed closed',
    );
  });
});

describe('review-signal review-app approval for write-access authors', () => {
  const APP = 'review-app[bot]';
  const appReview = (state, commitId = HEAD) => ({
    user: {login: APP, type: 'Bot'},
    state,
    commit_id: commitId,
  });
  const gateStatus = mutations =>
    mutations.createCommitStatus.mock.calls.map(([input]) => ({
      state: input.state,
      description: input.description,
    }));

  it('clears a write-access author whose exact head the app approved', async () => {
    const {mutations, github} = await runSignal({
      eventName: 'pull_request_target',
      reviews: [appReview('APPROVED')],
      reviewApp: APP,
    });

    expect(
      github.rest.repos.getCollaboratorPermissionLevel,
    ).toHaveBeenCalledWith({
      owner: 'meta',
      repo: 'astryx',
      username: 'contributor',
    });
    expect(gateStatus(mutations)).toEqual([
      {
        state: 'success',
        description:
          'Cleared by review-app approval for a write-access author.',
      },
    ]);
  });

  it('keeps the gate pending when the latest exact-head app verdict requests changes', async () => {
    const {mutations} = await runSignal({
      eventName: 'pull_request_target',
      reviews: [appReview('APPROVED'), appReview('CHANGES_REQUESTED')],
      reviewApp: APP,
    });

    expect(gateStatus(mutations)).toEqual([
      expect.objectContaining({state: 'pending'}),
    ]);
  });

  it('keeps a no-write author (including a fork author) waiting on an engineering owner', async () => {
    const {mutations} = await runSignal({
      eventName: 'pull_request_target',
      reviews: [appReview('APPROVED')],
      reviewApp: APP,
      permission: 'read',
    });

    expect(gateStatus(mutations)).toEqual([
      expect.objectContaining({state: 'pending'}),
    ]);
  });

  it('gates a pushed head until the app approves that head', async () => {
    const OLD_HEAD = '4'.repeat(40);
    const {mutations} = await runSignal({
      eventName: 'pull_request_target',
      reviews: [appReview('APPROVED', OLD_HEAD)],
      reviewApp: APP,
    });

    expect(gateStatus(mutations)).toEqual([
      expect.objectContaining({state: 'pending'}),
    ]);
  });

  it('fails closed to the engineering-owner path when permission cannot be read', async () => {
    const {mutations, core} = await runSignal({
      eventName: 'pull_request_target',
      reviews: [appReview('APPROVED')],
      reviewApp: APP,
      permission: new Error('503'),
    });

    expect(gateStatus(mutations)).toEqual([
      expect.objectContaining({state: 'pending'}),
    ]);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Could not read author permission'),
    );
  });

  it('does not read permission or count the app when REVIEW_APP is unset', async () => {
    const {mutations, github} = await runSignal({
      eventName: 'pull_request_target',
      reviews: [appReview('APPROVED')],
    });

    expect(
      github.rest.repos.getCollaboratorPermissionLevel,
    ).not.toHaveBeenCalled();
    expect(gateStatus(mutations)).toEqual([
      expect.objectContaining({state: 'pending'}),
    ]);
  });
});
