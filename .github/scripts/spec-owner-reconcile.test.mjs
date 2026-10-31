// Copyright (c) Meta Platforms, Inc. and affiliates.

/* global Buffer */

import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {canonicalRunUrl} = require('./spec-owner-decision.cjs');
const {
  isCommandComment,
  reconcileSpecOwnerGate,
} = require('./spec-owner-reconcile.cjs');

const head = 'abcdef1234567890abcdef1234567890abcdef12';
const nextHead = '1111111111111111111111111111111111111111';
const repository = 'meta/astryx';
const workspace = path.resolve(import.meta.dirname, '../..');
const env = {
  REVIEW_LABEL: 'needs:spec-owner-review',
};

function context({
  runId,
  eventName = 'pull_request_target',
  action = 'ready_for_review',
  actor = 'cixzhang',
  author = 'cixzhang',
  headSha = head,
  headRepository = repository,
  comment,
  review,
}) {
  return {
    actor,
    eventName,
    runId,
    runAttempt: 1,
    repo: {owner: 'meta', repo: 'astryx'},
    payload: {
      action,
      issue: eventName === 'issue_comment' ? {number: 17} : undefined,
      comment,
      review,
      pull_request:
        eventName === 'issue_comment'
          ? undefined
          : {
              number: 17,
              updated_at: '2026-08-30T10:00:00Z',
              user: {login: author},
              head: {
                sha: headSha,
                repo: {full_name: headRepository},
              },
            },
    },
  };
}

const reviewGate = (description, state = 'pending') => ({
  sha: head,
  context: 'review-required',
  state,
  description,
  creator: {login: 'github-actions[bot]'},
});

function trustedStatus({
  runId,
  statusContext = 'spec-owner-approval',
  state = 'pending',
  description = 'Reconciling.',
  sha = head,
}) {
  return {
    sha,
    context: statusContext,
    state,
    description,
    target_url: canonicalRunUrl(repository, String(runId), '1'),
    creator: {login: 'github-actions[bot]'},
    created_at: '2026-08-30T10:00:00Z',
    updated_at: '2026-08-30T10:00:00Z',
  };
}

function createHarness({
  author = 'cixzhang',
  headRepository = repository,
  statuses = [],
  comments = [],
  reviews = [],
  timeline = [],
  labels = [],
  autoMerge = null,
  draft = false,
  onPullGet,
  onCreateStatus,
  onEnableAutoMerge,
  changedFile = {
    filename: 'docs/specs/owner-ready/spec.md',
    status: 'added',
  },
  changedFiles,
  headContent = 'kind: architecture\nauthority: current\n',
  baseContent = '',
  // Spec text by commit, for heads before the current one.
  contentAt = {},
  // Changed files of an earlier commit against the base; the head's files
  // when absent.
  filesAt = {},
  codeGate = {
    sha: head,
    context: 'review-required',
    state: 'success',
    description: 'No code review required.',
    creator: {login: 'github-actions[bot]'},
    created_at: '2026-08-30T09:00:00Z',
  },
} = {}) {
  const files = changedFiles ?? [changedFile];
  const state = {
    pullGets: 0,
    // review-signal's code half of the review gate, already published.
    statuses: [...statuses, ...(codeGate ? [codeGate] : [])],
    comments: [...comments],
    reviews: [...reviews],
    timeline: [...timeline],
    calls: [],
    reads: [],
    summary: null,
    labels: new Set(labels),
    knownLabels: new Set(labels),
    pr: {
      number: 17,
      node_id: 'PR_node',
      state: 'open',
      merged_at: null,
      user: {login: author},
      head: {sha: head, repo: {full_name: headRepository}},
      base: {
        sha: '2222222222222222222222222222222222222222',
        repo: {full_name: repository},
      },
      changed_files: files.length,
      labels: [],
      auto_merge: autoMerge,
      draft,
    },
  };

  function syncLabels() {
    state.pr.labels = [...state.labels].map(name => ({name}));
  }
  syncLabels();

  const methods = {
    getPull: async () => {
      state.pullGets += 1;
      state.reads.push('pull');
      onPullGet?.(state.pullGets, state);
      syncLabels();
      return {data: state.pr};
    },
    listFiles: async () => ({data: files}),
    listReviews: async () => ({data: state.reviews}),
    listComments: async () => ({data: state.comments}),
    listTimeline: async () => ({data: state.timeline}),
    listStatuses: async ({ref}) => {
      state.reads.push('statuses');
      return {data: state.statuses.filter(status => status.sha === ref)};
    },
  };

  const github = {
    paginate: async (method, options) => (await method(options)).data,
    rest: {
      pulls: {
        get: methods.getPull,
        listFiles: methods.listFiles,
        listReviews: methods.listReviews,
      },
      issues: {
        listComments: methods.listComments,
        listEventsForTimeline: methods.listTimeline,
        getLabel: async ({name}) => {
          if (!state.knownLabels.has(name)) {
            const error = new Error('Not found');
            error.status = 404;
            throw error;
          }
          return {data: {name}};
        },
        createLabel: async ({name}) => {
          state.knownLabels.add(name);
          state.calls.push(`create-label:${name}`);
        },
        addLabels: async ({labels: added}) => {
          for (const name of added) state.labels.add(name);
          syncLabels();
          state.calls.push(`add-label:${added.join(',')}`);
        },
        removeLabel: async ({name}) => {
          if (!state.labels.delete(name)) {
            const error = new Error('Not found');
            error.status = 404;
            throw error;
          }
          syncLabels();
          state.calls.push(`remove-label:${name}`);
        },
        createComment: async ({body}) => {
          state.comments.push({
            user: {login: 'github-actions[bot]'},
            body,
            created_at: '2026-08-30T10:00:30Z',
          });
          state.calls.push('create-comment');
          return {data: {body}};
        },
      },
      repos: {
        compareCommitsWithBasehead: async ({basehead}) => ({
          data: {files: filesAt[basehead.split('...')[1]] ?? files},
        }),
        listCommitStatusesForRef: methods.listStatuses,
        createCommitStatus: async input => {
          onCreateStatus?.(input, state);
          state.reads.push(`status:${input.context}:${input.state}`);
          const status = {
            id: (state.nextStatusId = (state.nextStatusId ?? 0) + 1),
            ...input,
            creator: {login: 'github-actions[bot]'},
            created_at: '2026-08-30T10:00:30Z',
            updated_at: '2026-08-30T10:00:30Z',
          };
          state.statuses.unshift(status);
          state.calls.push(`status:${input.context}:${input.state}`);
          return {data: status};
        },
        getContent: async ({ref, path: filePath}) => ({
          data: {
            content: Buffer.from(
              `${ref}:${filePath}` in contentAt
                ? contentAt[`${ref}:${filePath}`]
                : ref in contentAt
                  ? contentAt[ref]
                  : ref === state.pr.head.sha
                    ? headContent
                    : baseContent,
            ).toString('base64'),
          },
        }),
      },
    },
    graphql: async query => {
      if (query.includes('enablePullRequestAutoMerge')) {
        onEnableAutoMerge?.(state);
        state.pr.auto_merge = {merge_method: 'squash'};
        state.calls.push('enable-auto-merge');
      } else if (query.includes('disablePullRequestAutoMerge')) {
        state.pr.auto_merge = null;
        state.calls.push('disable-auto-merge');
      }
      return {};
    },
  };
  const core = {
    info: message => state.calls.push(`info:${message}`),
    warning: message => state.calls.push(`warning:${message}`),
    summary: {
      addRaw(markdown) {
        state.summary = markdown;
        return this;
      },
      write: async () => {},
    },
  };
  return {github, core, state};
}

async function run(harness, runContext) {
  await reconcileSpecOwnerGate({
    github: harness.github,
    context: runContext,
    core: harness.core,
    workspace,
    env,
  });
}

// Statuses this run published, without the seeded code half of the gate.
function published(state) {
  return state.statuses.filter(
    status =>
      !(
        status.context === 'review-required' &&
        status.created_at === '2026-08-30T09:00:00Z'
      ),
  );
}

function latestReviewGate(state) {
  return state.statuses.find(status => status.context === 'review-required');
}

function latestGateStatus(state) {
  return state.statuses.find(
    status => status.context === 'spec-owner-approval',
  );
}

const designRecord = {
  filename: 'docs/design/interaction-states.md',
  status: 'added',
};
const currentDesign = 'kind: design\nauthority: current\n';
const componentRecord = {
  filename: 'packages/core/src/Button/Button.spec.md',
  status: 'modified',
};
function currentComponentSpec(decision, body = 'Body.') {
  return `---\nkind: component\nauthority: current\n---\n\n## Design relationships\n\n${body}\n\n### Design decisions\n\n<!-- design-decisions:v1 -->\n\n| ID | Decision | Intent or reason | Applies to | Allowed variation |\n| --- | --- | --- | --- | --- |\n| DD1 | ${decision} | Preserve emphasis. | Default state | Theme tokens may vary. |\n\n### Theming anatomy\n`;
}

// Exact-head approval by a real spec owner. The approval cases below
// need an approved head; they must not borrow the design self-attestation.
const specOwnerReview = {
  user: {login: 'imdreamrunner'},
  state: 'APPROVED',
  commit_id: head,
  submitted_at: '2026-08-30T09:59:00Z',
};

function createApprovedHarness(options = {}) {
  return createHarness({reviews: [specOwnerReview], ...options});
}

function createDesignHarness(options = {}) {
  return createHarness({
    author: 'ernestt',
    changedFile: designRecord,
    headContent: currentDesign,
    ...options,
  });
}

describe('spec owner workflow reconciliation', () => {
  it('clears the gate on an exact-head ENGOWNER review', async () => {
    const harness = createApprovedHarness();

    await run(harness, context({runId: 100n}));

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'success',
      description: expect.stringContaining('Spec approved by @imdreamrunner'),
    });
  });

  it('accepts every current ENGOWNER for a non-design spec', async () => {
    const review = {
      user: {login: 'josephfarina'},
      state: 'APPROVED',
      commit_id: head,
      submitted_at: '2026-08-30T10:00:00Z',
    };
    const harness = createHarness({reviews: [review]});

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'pull_request_review',
        action: 'submitted',
        actor: 'josephfarina',
        review,
      }),
    );

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'success',
      description: expect.stringContaining('Spec approved by @josephfarina'),
    });
  });

  it('does not let a DESIGNOWNER approve a non-design spec', async () => {
    const review = {
      user: {login: 'ernestt'},
      state: 'APPROVED',
      commit_id: head,
      submitted_at: '2026-08-30T10:00:00Z',
    };
    const harness = createHarness({reviews: [review]});

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'pull_request_review',
        action: 'submitted',
        actor: 'ernestt',
        review,
      }),
    );

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'pending',
      description: expect.stringContaining(
        'an eng owner can reply /approve-spec <sha>',
      ),
    });
    expect(harness.state.calls).not.toContain('enable-auto-merge');
  });

  it('lets a DESIGNOWNER approve a visual spec', async () => {
    const review = {
      user: {login: 'ernestt'},
      state: 'APPROVED',
      commit_id: head,
      submitted_at: '2026-08-30T10:00:00Z',
    };
    const harness = createDesignHarness({
      author: 'outside-contributor',
      reviews: [review],
    });

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'pull_request_review',
        action: 'submitted',
        actor: 'ernestt',
        author: 'outside-contributor',
        review,
      }),
    );

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'success',
      description: expect.stringContaining('Spec approved by @ernestt'),
    });
  });

  it.each([
    'packages/core/src/__tests__/TopLevel.spec.md',
    'packages/core/src/Button/.hidden/Hidden.spec.md',
    'packages/core/src/Button/.Hidden.spec.md',
    'packages/core/src/Button/generated/Generated.spec.md',
  ])('does not owner-gate ignored component spec path %s', async filename => {
    const harness = createHarness({
      changedFile: {filename, status: 'added'},
      headContent: 'kind: module\nauthority: current\n',
    });

    await run(harness, context({runId: 100n, action: 'synchronize'}));

    expect(latestGateStatus(harness.state)).toMatchObject({
      state: 'success',
      description: 'Mirrors review-required · spec ok',
    });
    expect(harness.state.calls).not.toContain('enable-auto-merge');
  });

  it('keeps a current theme change pending without exact-head approval', async () => {
    const harness = createHarness({
      changedFile: {
        filename: 'packages/themes/neutral/neutral.spec.md',
        status: 'added',
      },
      headContent: 'kind: theme\nauthority: current\n',
    });

    await run(
      harness,
      context({
        runId: 100n,
        action: 'synchronize',
        actor: 'rubyycheung',
      }),
    );

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'pending',
      description: expect.stringContaining(
        'a design or eng owner can reply /approve-spec <sha>',
      ),
    });
    expect(harness.state.calls).not.toContain('enable-auto-merge');
    expect(harness.state.pr.auto_merge).toBe(null);
  });

  it.each([
    'docs/themes/neutral.md',
    'packages/themes/neutral/Theme.spec.md',
    'packages/themes/neutral/subdir/neutral.spec.md',
  ])(
    'keeps misplaced current theme candidate %s pending and non-merging',
    async filename => {
      const harness = createHarness({
        changedFile: {filename, status: 'added'},
        headContent: 'kind: theme\nauthority: current\n',
      });

      await run(
        harness,
        context({
          runId: 100n,
          action: 'synchronize',
          actor: 'rubyycheung',
        }),
      );

      expect(latestReviewGate(harness.state)).toMatchObject({
        state: 'pending',
        description: expect.stringContaining(
          'a design or eng owner can reply /approve-spec <sha>',
        ),
      });
      expect(harness.state.calls).not.toContain('enable-auto-merge');
      expect(
        harness.state.calls.some(call =>
          call.includes('No knowledge records changed'),
        ),
      ).toBe(false);
    },
  );

  it('accepts an exact-head derived theme-owner review for a current theme record', async () => {
    const review = {
      user: {login: 'rubyycheung'},
      state: 'APPROVED',
      commit_id: head,
      submitted_at: '2026-08-30T10:00:00Z',
    };
    const harness = createHarness({
      changedFile: {
        filename: 'packages/themes/neutral/neutral.spec.md',
        status: 'added',
      },
      headContent:
        'kind: theme\nauthority: current\nadditional_owners: [self-declared-owner]\n',
      reviews: [review],
    });

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'pull_request_review',
        action: 'submitted',
        actor: 'rubyycheung',
        review,
      }),
    );

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'success',
      description: expect.stringContaining('@rubyycheung'),
    });
  });

  it('accepts an exact-head ENGOWNER review for a current theme record', async () => {
    const review = {
      user: {login: 'czarandy'},
      state: 'APPROVED',
      commit_id: head,
      submitted_at: '2026-08-30T10:00:00Z',
    };
    const harness = createHarness({
      changedFile: {
        filename: 'packages/themes/neutral/neutral.spec.md',
        status: 'added',
      },
      headContent: 'kind: theme\nauthority: current\n',
      reviews: [review],
    });

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'pull_request_review',
        action: 'submitted',
        actor: 'czarandy',
        review,
      }),
    );

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'success',
      description: expect.stringContaining('@czarandy'),
    });
  });

  it('does not authorize a theme record through its self-declared owners', async () => {
    const review = {
      user: {login: 'self-declared-owner'},
      state: 'APPROVED',
      commit_id: head,
      submitted_at: '2026-08-30T10:00:00Z',
    };
    const harness = createHarness({
      changedFile: {
        filename: 'packages/themes/neutral/neutral.spec.md',
        status: 'added',
      },
      headContent:
        'kind: theme\nauthority: current\nadditional_owners: [self-declared-owner]\n',
      reviews: [review],
    });

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'pull_request_review',
        action: 'submitted',
        actor: 'self-declared-owner',
        review,
      }),
    );

    expect(harness.state.pullGets).toBe(0);
    expect(published(harness.state)).toEqual([]);
  });

  it('abandons the old event when the live head changes', async () => {
    const harness = createHarness({
      onPullGet: (count, state) => {
        if (count === 2) state.pr.head.sha = nextHead;
      },
    });

    await run(harness, context({runId: 100n}));

    expect(harness.state.calls).not.toContain('enable-auto-merge');
    expect(
      harness.state.statuses.filter(
        status =>
          status.context === 'spec-owner-approval' && status.sha === head,
      ),
    ).toHaveLength(1);
  });

  it('yields to a newer run id instead of applying stale approval', async () => {
    const harness = createHarness({
      statuses: [trustedStatus({runId: 101n, state: 'success'})],
    });

    await run(harness, context({runId: 100n}));

    expect(harness.state.calls).not.toContain('enable-auto-merge');
    expect(latestGateStatus(harness.state)).toMatchObject({
      state: 'success',
      target_url: canonicalRunUrl(repository, '101', '1'),
    });
    expect(
      harness.state.calls.some(call => call.includes('yielded to newer run')),
    ).toBe(true);
  });

  it('restores the review gate from a newer run it yields to', async () => {
    const harness = createHarness({
      headContent: 'kind: architecture\nauthority: current\n',
      comments: [{user: {login: 'cixzhang'}, body: `/approve-spec ${head}`}],
      statuses: [
        trustedStatus({
          runId: 101n,
          description: 'Mirrors review-required · spec waiting (eng)',
        }),
      ],
    });

    await run(harness, context({runId: 100n}));

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'pending',
      target_url: canonicalRunUrl(repository, '101', '1'),
    });
  });

  it('keeps the newer run\u2019s link when it yields to a newer success', async () => {
    const harness = createHarness({
      statuses: [
        trustedStatus({
          runId: 101n,
          state: 'success',
          description: 'Mirrors review-required \u00b7 spec ok (@cixzhang)',
        }),
      ],
    });

    await run(harness, context({runId: 100n}));

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'success',
      target_url: canonicalRunUrl(repository, '101', '1'),
    });
  });

  it('restores a newer decision that lands just before the waiting write', async () => {
    let landed = false;
    const harness = createHarness({
      onCreateStatus: (input, state) => {
        if (landed || input.context !== 'review-required') return;
        landed = true;
        // A newer run decides success just before this run's waiting write.
        state.statuses.unshift(
          trustedStatus({
            runId: 101n,
            state: 'success',
            description: 'Mirrors review-required \u00b7 spec ok (@cixzhang)',
          }),
        );
      },
    });

    await run(harness, context({runId: 100n}));

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'success',
      target_url: canonicalRunUrl(repository, '101', '1'),
    });
  });

  it('keeps the review gate waiting when a run fails part-way', async () => {
    // An approved head: the gate succeeded on the earlier run.
    const harness = createHarness({
      statuses: [
        {
          sha: head,
          context: 'review-required',
          state: 'success',
          description:
            '\u2705 Spec approved by @cixzhang \u00b7 No code review required.',
          creator: {login: 'github-actions[bot]'},
        },
      ],
    });
    harness.github.rest.pulls.listFiles = async () => {
      throw new Error('listFiles failed');
    };

    await expect(run(harness, context({runId: 100n}))).rejects.toThrow();

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'pending',
      description: '\u23f3 Checking for spec changes\u2026',
    });
  });

  it('leads with code review, and relinks the same text to a newer run', async () => {
    const harness = createHarness({
      headContent: 'kind: architecture\nauthority: current\n',
      codeGate: reviewGate('Waiting on code review: core change'),
    });

    await run(harness, context({runId: 100n}));
    await run(harness, context({runId: 101n}));

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'pending',
      description: 'Waiting on code review: core change (+ spec approval)',
      target_url: canonicalRunUrl(repository, '101', '1'),
    });
  });

  it('skips fork owner reviews before any GitHub API work', async () => {
    const review = {
      user: {login: 'cixzhang'},
      state: 'APPROVED',
      commit_id: head,
      submitted_at: '2026-08-30T10:00:00Z',
    };
    const messages = [];
    const github = new Proxy(
      {},
      {
        get() {
          throw new Error('GitHub API accessed');
        },
      },
    );

    await reconcileSpecOwnerGate({
      github,
      context: context({
        runId: 100n,
        eventName: 'pull_request_review',
        action: 'submitted',
        headRepository: 'contributor/astryx',
        review,
      }),
      core: {info: message => messages.push(message)},
      workspace,
      env,
    });

    expect(messages).toEqual([
      'Skipping fork pull request review; use an exact-head owner command to reconcile.',
    ]);
  });

  it('orders a dismissal after an earlier command by its timeline time', async () => {
    const review = {
      id: 17,
      user: {login: 'imdreamrunner'},
      state: 'DISMISSED',
      commit_id: head,
      submitted_at: '2026-08-30T09:00:00Z',
      updated_at: '2026-08-30T10:02:00Z',
    };
    // A same-owner command at 10:01 (a non-author owner, as GitHub accepts no
    // review from the author); the dismissal is dated by its 10:02
    // timeline event, so it is the latest act and the gate waits.
    const command = {
      user: {login: 'imdreamrunner'},
      body: `/approve-spec ${head}`,
      created_at: '2026-08-30T10:01:00Z',
    };
    const harness = createHarness({
      comments: [command],
      reviews: [review],
      timeline: [
        {
          event: 'review_dismissed',
          created_at: '2026-08-30T10:02:00Z',
          dismissed_review: {review_id: 17},
        },
      ],
    });

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'pull_request_review',
        action: 'dismissed',
        review,
      }),
    );

    expect(latestGateStatus(harness.state).state).toBe('pending');
  });

  it('keeps mixed DD and component-contract edits waiting for engineering', async () => {
    const harness = createHarness({
      author: 'ernestt',
      changedFile: componentRecord,
      baseContent: currentComponentSpec('Use a quiet label.'),
      headContent: currentComponentSpec(
        'Keep the label quiet.',
        'Changed behavioral contract.',
      ),
      reviews: [
        {
          user: {login: 'rubyycheung'},
          state: 'APPROVED',
          commit_id: head,
          submitted_at: '2026-08-30T09:59:00Z',
        },
      ],
    });

    await run(
      harness,
      context({runId: 100n, actor: 'ernestt', author: 'ernestt'}),
    );

    expect(latestReviewGate(harness.state)).toMatchObject({
      state: 'pending',
      description: expect.stringContaining('an eng owner can reply'),
    });
    expect(harness.state.calls).not.toContain('enable-auto-merge');
  });

  it('reconciles same-repository owner reviews automatically', async () => {
    const review = {
      user: {login: 'czarandy'},
      state: 'APPROVED',
      commit_id: head,
      submitted_at: '2026-08-30T10:00:00Z',
    };
    const harness = createHarness({reviews: [review]});

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'pull_request_review',
        action: 'submitted',
        review,
      }),
    );

    expect(harness.state.pullGets).toBeGreaterThan(0);
    expect(latestReviewGate(harness.state).state).toBe('success');
  });

  it('reconciles an exact-head owner command for a fork current-spec PR', async () => {
    const comment = {
      user: {login: 'cixzhang'},
      body: `/approve-spec ${head}`,
      created_at: '2026-08-30T10:00:00Z',
    };
    const harness = createHarness({
      headRepository: 'contributor/astryx',
      comments: [comment],
    });

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'issue_comment',
        action: 'created',
        comment,
      }),
    );

    expect(harness.state.pullGets).toBeGreaterThan(0);
    expect(latestReviewGate(harness.state).state).toBe('success');
  });

  it('rejects valid-shaped non-owner commands before API work', async () => {
    const harness = createHarness();
    const comment = {
      user: {login: 'contributor'},
      body: `/approve-spec ${head}`,
      created_at: '2026-08-30T10:00:00Z',
    };

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'issue_comment',
        actor: 'contributor',
        comment,
      }),
    );

    expect(harness.state.pullGets).toBe(0);
    expect(published(harness.state)).toEqual([]);
  });

  it('rejects non-owner reviews before API work', async () => {
    const harness = createHarness();
    const review = {
      user: {login: 'contributor'},
      state: 'APPROVED',
      commit_id: head,
      submitted_at: '2026-08-30T10:00:00Z',
    };

    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'pull_request_review',
        action: 'submitted',
        actor: 'contributor',
        review,
      }),
    );

    expect(harness.state.pullGets).toBe(0);
    expect(published(harness.state)).toEqual([]);
  });

  it('rejects ordinary comments before any API work', async () => {
    const harness = createHarness();
    const ordinaryComment = {
      user: {login: 'contributor'},
      body: 'Looks good to me',
    };

    expect(isCommandComment('issue_comment', {comment: ordinaryComment})).toBe(
      false,
    );
    await run(
      harness,
      context({
        runId: 100n,
        eventName: 'issue_comment',
        comment: ordinaryComment,
      }),
    );
    expect(harness.state.pullGets).toBe(0);
  });

  describe('a settled head is never re-decided', () => {
    it('publishes nothing once the pull request has merged', async () => {
      const harness = createApprovedHarness();
      harness.state.pr.merged_at = '2026-08-30T09:58:00Z';
      harness.state.pr.state = 'closed';

      await run(harness, context({runId: 100n}));

      expect(published(harness.state)).toEqual([]);
      expect(harness.state.calls).toEqual([
        'info:The pull request is already merged or closed; the gate does not rewrite a settled head.',
      ]);
    });

    it('publishes nothing once the pull request has closed unmerged', async () => {
      const harness = createApprovedHarness();
      harness.state.pr.state = 'closed';

      await run(harness, context({runId: 100n}));

      expect(published(harness.state)).toEqual([]);
      expect(harness.state.calls).not.toContain(
        'status:spec-owner-approval:pending',
      );
    });

    it('does not upgrade a head that merges while the run reconciles', async () => {
      // The incident shape: the owner event arrives, the pull request merges
      // unapproved, and the late run must not write approval onto that head.
      const harness = createApprovedHarness({
        onPullGet: (count, state) => {
          if (count >= 3) {
            state.pr.merged_at = '2026-08-30T10:00:15Z';
            state.pr.state = 'closed';
          }
        },
      });

      await run(harness, context({runId: 100n}));

      expect(
        harness.state.statuses.some(
          status =>
            status.context === 'spec-owner-approval' &&
            status.state === 'success',
        ),
      ).toBe(false);
      expect(harness.state.calls).not.toContain('enable-auto-merge');
      expect(
        harness.state.calls.some(call =>
          call.includes('settled while this run reconciled'),
        ),
      ).toBe(true);
    });

    it('reports a success that raced the merge and stops before auto-merge', async () => {
      // The window between the last read and the write cannot be closed with
      // GitHub's APIs. When it loses, the run must say so and go no further.
      let publishedAt = null;
      const harness = createApprovedHarness({
        onPullGet: (count, state) => {
          if (publishedAt !== null && count > publishedAt) {
            state.pr.merged_at = '2026-08-30T10:00:20Z';
            state.pr.state = 'closed';
          }
        },
        onCreateStatus: (input, state) => {
          if (
            input.context === 'spec-owner-approval' &&
            input.state === 'success'
          ) {
            publishedAt = state.pullGets;
          }
        },
      });

      await run(harness, context({runId: 100n}));

      expect(harness.state.calls).not.toContain('enable-auto-merge');
      expect(harness.state.pr.auto_merge).toBe(null);
      expect(
        harness.state.calls.some(call =>
          call.includes('treat that status as unverified'),
        ),
      ).toBe(true);
    });

    it('reads the live pull request as the last call before publishing', async () => {
      const harness = createApprovedHarness();

      await run(harness, context({runId: 100n}));

      const reads = harness.state.reads;
      const publish = reads.indexOf('status:spec-owner-approval:success');
      expect(publish).toBeGreaterThan(0);
      expect(reads[publish - 1]).toBe('pull');
    });

    it('does not enable auto-merge on a head that settled after the status landed', async () => {
      // Past the terminal write and its verification, the enable path has its
      // own read; that read must also refuse a settled pull request.
      let publishedAt = null;
      const harness = createApprovedHarness({
        onPullGet: (count, state) => {
          if (publishedAt !== null && count >= publishedAt + 2) {
            state.pr.merged_at = '2026-08-30T10:00:25Z';
            state.pr.state = 'closed';
          }
        },
        onCreateStatus: (input, state) => {
          if (
            input.context === 'spec-owner-approval' &&
            input.state === 'success'
          ) {
            publishedAt = state.pullGets;
          }
        },
      });

      await run(harness, context({runId: 100n}));

      expect(latestReviewGate(harness.state).state).toBe('success');
      expect(harness.state.calls).not.toContain('enable-auto-merge');
      expect(harness.state.pr.auto_merge).toBe(null);
    });
  });

  it('does not restore a newer run\u2019s status onto a settled head', async () => {
    // Yielding writes too. If the pull request merged while this run worked,
    // the newer run's status is no more publishable than this run's own.
    const harness = createApprovedHarness({
      statuses: [trustedStatus({runId: 101n, state: 'success'})],
      onPullGet: (count, state) => {
        if (count >= 2) {
          state.pr.merged_at = '2026-08-30T10:00:10Z';
          state.pr.state = 'closed';
        }
      },
    });

    await run(harness, context({runId: 100n}));

    expect(
      harness.state.statuses.filter(
        status =>
          status.context === 'spec-owner-approval' &&
          status.target_url === canonicalRunUrl(repository, '101', '1'),
      ),
    ).toHaveLength(1);
    expect(harness.state.calls).not.toContain('enable-auto-merge');
  });

  it('still restores a newer run\u2019s status on a live head', async () => {
    const harness = createApprovedHarness({
      statuses: [trustedStatus({runId: 101n, state: 'success'})],
    });

    await run(harness, context({runId: 100n}));

    expect(latestGateStatus(harness.state)).toMatchObject({
      state: 'success',
      target_url: canonicalRunUrl(repository, '101', '1'),
    });
    expect(
      harness.state.calls.some(call => call.includes('yielded to newer run')),
    ).toBe(true);
  });

  describe('one approval binds the spec content (DEC-14)', () => {
    const oldHead = '3333333333333333333333333333333333333333';
    const draftRecord = [
      '---',
      'kind: architecture',
      'id: architecture:owner-ready',
      'authority: draft',
      'approved_by: null',
      'approved_at: null',
      '---',
      '',
      '# Owner ready',
      '',
      'The contract.',
      '',
    ].join('\n');
    const currentRecord = draftRecord
      .replace('authority: draft', 'authority: current')
      .replace('approved_by: null', 'approved_by: cixzhang')
      .replace('approved_at: null', 'approved_at: 2026-10-28');
    const changedRecord = currentRecord.replace(
      'The contract.',
      'A different contract.',
    );
    const waiting =
      '⏳ Waiting for human spec approval: an eng owner can reply /approve-spec <sha>';

    function ownerComment(
      body,
      createdAt = '2026-08-30T10:05:00Z',
      login = 'cixzhang',
    ) {
      return {user: {login}, body, created_at: createdAt};
    }

    async function commentRun(harness, comment, runId = 100n) {
      harness.state.comments.push(comment);
      await run(
        harness,
        context({
          runId,
          eventName: 'issue_comment',
          action: 'created',
          comment,
        }),
      );
    }

    it('keeps an ENGOWNER-authored spec PR pending until /approve-spec <head>', async () => {
      const harness = createHarness({headContent: currentRecord});

      await run(harness, context({runId: 100n}));

      expect(latestReviewGate(harness.state)).toMatchObject({
        state: 'pending',
        description: waiting,
      });
      expect(latestGateStatus(harness.state)).toMatchObject({
        state: 'pending',
        description: 'Mirrors review-required · spec waiting (eng)',
      });
      expect(harness.state.calls).not.toContain('create-comment');
      expect(harness.state.summary).toContain(`/approve-spec ${head}`);
      expect(harness.state.summary).toContain('architecture:owner-ready');
      expect(harness.state.summary).toContain('Owner ready');

      await commentRun(harness, ownerComment(`/approve-spec ${head}`), 101n);
      expect(latestReviewGate(harness.state)).toMatchObject({
        state: 'success',
        description: '✅ Spec approved by @cixzhang · No code review required.',
      });
      expect(latestGateStatus(harness.state).description).toBe(
        'Mirrors review-required · spec ok (@cixzhang)',
      );
    });

    it.each([
      ['a commit that changes no spec text', 'currentRecord', 'review'],
      ['the draft-to-current flip', 'draftRecord', 'command'],
    ])('keeps an approval across %s', async (_name, earlier, act) => {
      const harness = createHarness({
        headContent: currentRecord,
        contentAt: {
          [oldHead]: earlier === 'draftRecord' ? draftRecord : currentRecord,
        },
        reviews:
          act === 'review' ? [{...specOwnerReview, commit_id: oldHead}] : [],
        comments:
          act === 'command' ? [ownerComment(`/approve-spec ${oldHead}`)] : [],
      });

      await run(harness, context({runId: 100n}));

      expect(latestReviewGate(harness.state).state).toBe('success');
    });

    it('resets an approval when spec text changes, and says so', async () => {
      const harness = createHarness({
        headContent: changedRecord,
        contentAt: {[oldHead]: currentRecord},
        comments: [ownerComment(`/approve-spec ${oldHead}`)],
      });

      await run(harness, context({runId: 100n}));

      expect(latestReviewGate(harness.state)).toMatchObject({
        state: 'pending',
        description: waiting,
      });
      expect(harness.state.summary).toContain(
        'Spec changed after approval at 2026-08-30T10:05:00Z',
      );
    });

    it('resets an approval when the head drops an approved spec path', async () => {
      const dropped = 'docs/specs/dropped/spec.md';
      const harness = createHarness({
        headContent: currentRecord,
        contentAt: {
          [oldHead]: currentRecord,
          [`${head}:docs/specs/dropped/spec.md`]: 'base text\n',
          [`${oldHead}:docs/specs/dropped/spec.md`]: 'approved text\n',
        },
        // The approved commit also changed a record the head reverted.
        filesAt: {
          [oldHead]: [
            {filename: 'docs/specs/owner-ready/spec.md', status: 'added'},
            {filename: dropped, status: 'modified'},
          ],
        },
        comments: [ownerComment(`/approve-spec ${oldHead}`)],
      });

      await run(harness, context({runId: 100n}));

      expect(latestReviewGate(harness.state)).toMatchObject({
        state: 'pending',
        description: waiting,
      });
    });

    it('reads a spec wait as satisfied code review, not an older code wait', async () => {
      const harness = createHarness({
        headContent: currentRecord,
        comments: [ownerComment(`/approve-spec ${head}`)],
        // review-clear cleared code review under a spec wait.
        statuses: [reviewGate(waiting)],
        codeGate: reviewGate(
          'Waiting on code review: core change (+ spec approval)',
        ),
      });

      await run(harness, context({runId: 100n}));

      expect(latestReviewGate(harness.state).state).toBe('success');
    });

    it('names the owner whose request for changes holds the gate', async () => {
      const harness = createHarness({
        headContent: currentRecord,
        comments: [ownerComment(`/approve-spec ${head}`)],
        reviews: [
          {
            user: {login: 'imdreamrunner'},
            state: 'CHANGES_REQUESTED',
            commit_id: head,
            submitted_at: '2026-08-30T10:06:00Z',
          },
        ],
      });

      await run(harness, context({runId: 100n}));

      expect(latestReviewGate(harness.state)).toMatchObject({
        state: 'pending',
        description:
          '⏳ Waiting for human spec approval: @imdreamrunner requested changes and can reply /approve-spec <sha>',
      });
    });

    it('recomposes when code review is withdrawn while it writes', async () => {
      let injected = false;
      const harness = createHarness({
        headContent: currentRecord,
        comments: [ownerComment(`/approve-spec ${head}`)],
        // review-clear withdraws code approval between this job's read and write.
        onCreateStatus: (input, state) => {
          if (input.context !== 'review-required' || injected) return;
          injected = true;
          state.statuses.unshift({
            ...reviewGate('Waiting on code review after approval withdrawal.'),
            id: 999,
          });
        },
      });

      await run(harness, context({runId: 100n}));

      expect(latestReviewGate(harness.state)).toMatchObject({
        state: 'pending',
        description: 'Waiting on code review after approval withdrawal.',
      });
    });

    it('withdraws on /revoke-spec, says who, and approves again after it', async () => {
      const harness = createHarness({
        headContent: currentRecord,
        comments: [ownerComment(`/approve-spec ${head}`)],
      });

      await commentRun(
        harness,
        ownerComment('/revoke-spec', '2026-08-30T10:10:00Z'),
      );
      expect(latestReviewGate(harness.state)).toMatchObject({
        state: 'pending',
        description: waiting,
      });
      expect(harness.state.summary).toContain(
        'Approval revoked by @cixzhang at 2026-08-30T10:10:00Z',
      );

      await commentRun(
        harness,
        ownerComment(`/approve-spec ${head}`, '2026-08-30T10:15:00Z'),
        101n,
      );
      expect(latestReviewGate(harness.state).state).toBe('success');
    });

    it('never counts an approving review by the author', async () => {
      const harness = createHarness({
        headContent: currentRecord,
        reviews: [{...specOwnerReview, user: {login: 'cixzhang'}}],
      });

      await run(harness, context({runId: 100n}));

      expect(latestReviewGate(harness.state).state).toBe('pending');
    });
  });
});
