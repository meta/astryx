// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import YAML from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const workflowSource = fs.readFileSync(
  path.join(root, '.github/workflows/review-clear.yml'),
  'utf8',
);
const helperSource = fs.readFileSync(
  path.join(root, '.github/scripts/review-signal-decision.cjs'),
  'utf8',
);
const script = YAML.parse(workflowSource).jobs.clear.steps.find(
  step => step.name === 'Reconcile the exact-head code gate',
).with.script;
const execute = new Function(
  'github',
  'context',
  'core',
  'process',
  'Buffer',
  `return (async () => {\n${script}\n})();`,
);

// The workflow's own commit (the default branch's head), and a PR base older
// than the decision helper.
const trustedSha = 'cccccccccccccccccccccccccccccccccccccccc';
const oldBaseSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const helperPath = '.github/scripts/review-signal-decision.cjs';
const head1 = '1111111111111111111111111111111111111111';
const head2 = '2222222222222222222222222222222222222222';
const head3 = '3333333333333333333333333333333333333333';
const review = (state, commitId = head2) => ({
  user: {login: 'engineer'},
  state,
  commit_id: commitId,
});
const gateStatus = (state, description) => ({
  context: 'review-required',
  creator: {login: 'github-actions[bot]'},
  description,
  state,
});
const pendingGate = gateStatus(
  'pending',
  'Waiting on code review: core runtime change',
);
const clearedGate = gateStatus('success', 'Cleared by code-owner approval.');
const APP = 'review-app[bot]';
const APP_CLEARED = 'Cleared by review-app approval for a write-access author.';
const appClearedGate = gateStatus('success', APP_CLEARED);
const appReview = (state, commitId = head2) => ({
  user: {login: APP, type: 'Bot'},
  state,
  commit_id: commitId,
});
const ungatedSuccess = gateStatus('success', 'No code review required.');
// The spec-owner job's decision for a PR that changes no spec record.
const specOk = {
  context: 'spec-owner-approval',
  state: 'success',
  description: 'Mirrors review-required · spec ok',
  creator: {login: 'github-actions[bot]'},
};

function harness(
  reviews,
  {
    helperAt = [trustedSha],
    labels = ['needs:code-review'],
    moveAfterFirstRead = false,
    statusFailure = false,
    statuses = [pendingGate],
    reviewApp = '',
    permission = 'write',
  } = {},
) {
  const calls = [];
  let pullReads = 0;
  const full = {
    number: 17,
    head: {sha: head2},
    base: {sha: oldBaseSha},
    user: {login: 'author', type: 'User'},
    labels: labels.map(name => ({name})),
  };
  const methods = {
    listCommitStatusesForRef: async () => ({data: [...statuses, specOk]}),
    listReviews: async () => ({data: reviews}),
  };
  const github = {
    paginate: async (method, options) => (await method(options)).data,
    rest: {
      pulls: {
        get: async () => {
          pullReads += 1;
          return {
            data:
              moveAfterFirstRead && pullReads > 1
                ? {...full, head: {sha: head3}}
                : full,
          };
        },
        list: async () => ({data: []}),
        listReviews: methods.listReviews,
      },
      repos: {
        getContent: async ({ref, path: filePath}) => {
          calls.push(`read:${ref}:${filePath}`);
          if (!helperAt.includes(ref)) {
            throw Object.assign(new Error('Not Found'), {status: 404});
          }
          return {
            data: {
              type: 'file',
              content: Buffer.from(helperSource).toString('base64'),
            },
          };
        },
        listCommitStatusesForRef: methods.listCommitStatusesForRef,
        getCollaboratorPermissionLevel: async ({username}) => {
          calls.push(`permission:${username}`);
          if (permission instanceof Error) throw permission;
          return {data: {permission}};
        },
        createCommitStatus: async input => {
          calls.push({type: 'status-attempt', input});
          if (statusFailure) throw new Error('persistent status failure');
          calls.push({type: 'status', input});
        },
      },
      issues: {
        addLabels: async input => calls.push({type: 'add-label', input}),
        removeLabel: async input => calls.push({type: 'remove-label', input}),
      },
      checks: {
        listForRef: async () => ({data: {check_runs: []}}),
        update: async input => calls.push({type: 'check-update', input}),
      },
    },
  };
  const context = {
    repo: {owner: 'meta', repo: 'astryx'},
    sha: trustedSha,
    payload: {
      workflow_run: {
        pull_requests: [{number: 17}],
      },
    },
  };
  const core = {
    info: message => calls.push(`info:${message}`),
    setFailed: message => calls.push(`failed:${message}`),
    warning: message => calls.push(`warning:${message}`),
  };
  const processValue = {
    env: {ENG_OWNERS: '@engineer', REVIEW_APP: reviewApp},
  };
  return {calls, context, core, github, processValue};
}

async function run(h) {
  await execute(h.github, h.context, h.core, h.processValue, Buffer);
}

function mutations(calls) {
  return calls.filter(call =>
    ['add-label', 'remove-label', 'status'].includes(call?.type),
  );
}

describe('review-clear exact-head workflow', () => {
  it('does not let an H1 approval mutate the H2 gate', async () => {
    const h = harness([review('APPROVED', head1)]);

    await run(h);

    expect(mutations(h.calls)).toEqual([]);
    expect(h.calls).toContain(`read:${trustedSha}:${helperPath}`);
  });

  it('resolves the gate when the PR base predates the decision helper', async () => {
    // The helper exists only at the workflow's own commit, as for a PR
    // whose base is older than the helper.
    const h = harness([review('APPROVED')], {helperAt: [trustedSha]});

    await run(h);

    expect(h.calls).not.toContain(`read:${oldBaseSha}:${helperPath}`);
    expect(h.calls).toContainEqual(
      expect.objectContaining({type: 'remove-label'}),
    );
    expect(h.calls).toContainEqual({
      type: 'status',
      input: expect.objectContaining({
        sha: head2,
        state: 'success',
        description: 'Cleared by code-owner approval.',
      }),
    });
  });

  it('fails clearly, without touching the gate, when the decision helper is missing', async () => {
    const h = harness([review('APPROVED')], {helperAt: []});

    await run(h);

    expect(mutations(h.calls)).toEqual([]);
    expect(h.calls).toContain(
      `failed:Cannot resolve the code gate for PR #17: ${helperPath} could not be loaded at ${trustedSha} (not found).`,
    );
  });

  it('does not create a gate for a head that review-signal marked ungated', async () => {
    const h = harness([review('APPROVED')], {
      labels: [],
      statuses: [ungatedSuccess],
    });

    await run(h);

    expect(mutations(h.calls)).toEqual([]);
  });

  it('does not trust an unowned green review-required status', async () => {
    const h = harness([review('CHANGES_REQUESTED')], {
      labels: [],
      statuses: [
        {
          ...clearedGate,
          creator: {login: 'untrusted-user'},
        },
      ],
    });

    await run(h);

    expect(mutations(h.calls)).toEqual([]);
  });

  it('clears an owned gate for an entitled approval on the exact head', async () => {
    const h = harness([review('APPROVED')]);

    await run(h);

    expect(h.calls).toContainEqual(
      expect.objectContaining({type: 'remove-label'}),
    );
    expect(h.calls).toContainEqual({
      type: 'status',
      input: expect.objectContaining({
        sha: head2,
        context: 'review-required',
        state: 'success',
        description: 'Cleared by code-owner approval.',
      }),
    });
  });

  it('restores a previously green owned gate after exact-head changes requested', async () => {
    const h = harness([review('APPROVED'), review('CHANGES_REQUESTED')], {
      labels: [],
      statuses: [clearedGate],
    });

    await run(h);

    const pendingIndex = h.calls.findIndex(
      call => call?.type === 'status' && call.input.state === 'pending',
    );
    const labelIndex = h.calls.findIndex(call => call?.type === 'add-label');
    expect(pendingIndex).toBeGreaterThan(-1);
    expect(labelIndex).toBeGreaterThan(pendingIndex);
    expect(h.calls).toContainEqual(
      expect.objectContaining({type: 'add-label'}),
    );
    expect(h.calls).toContainEqual({
      type: 'status',
      input: expect.objectContaining({
        sha: head2,
        context: 'review-required',
        state: 'pending',
        description: 'Waiting on code review after approval withdrawal.',
      }),
    });
  });

  it('restores a gate cleared under a spec wait and then spec-approved, on changes requested', async () => {
    const specWait = gateStatus(
      'pending',
      '⏳ Waiting for human spec approval: an eng owner can reply /approve-spec <sha>',
    );
    const h = harness([review('APPROVED'), review('CHANGES_REQUESTED')], {
      labels: [],
      // Newest first: /approve-spec, review-clear's clear, the code wait.
      statuses: [
        gateStatus(
          'success',
          '✅ Spec approved by @cixzhang · Review complete.',
        ),
        specWait,
        gateStatus(
          'pending',
          'Waiting on code review: core runtime change (+ spec approval)',
        ),
      ],
    });

    await run(h);

    expect(h.calls).toContainEqual({
      type: 'status',
      input: expect.objectContaining({
        state: 'pending',
        description: 'Waiting on code review after approval withdrawal.',
      }),
    });
  });

  it('does not mutate the label when the pending status persistently fails', async () => {
    const h = harness([review('APPROVED'), review('CHANGES_REQUESTED')], {
      labels: [],
      statusFailure: true,
      statuses: [clearedGate],
    });

    await expect(run(h)).rejects.toThrow('persistent status failure');

    expect(h.calls).toContainEqual(
      expect.objectContaining({
        type: 'status-attempt',
        input: expect.objectContaining({state: 'pending'}),
      }),
    );
    expect(h.calls.some(call => call?.type === 'status')).toBe(false);
    expect(h.calls.some(call => call?.type === 'add-label')).toBe(false);
  });

  it('restores a previously green owned gate after exact-head dismissal', async () => {
    const h = harness([review('APPROVED'), review('DISMISSED')], {
      labels: [],
      statuses: [clearedGate],
    });

    await run(h);

    expect(h.calls).toContainEqual(
      expect.objectContaining({type: 'add-label'}),
    );
    expect(h.calls).toContainEqual(
      expect.objectContaining({
        type: 'status',
        input: expect.objectContaining({state: 'pending'}),
      }),
    );
  });

  it.each([
    {
      name: 'approval',
      reviews: [review('APPROVED')],
      options: {moveAfterFirstRead: true},
    },
    {
      name: 'withdrawal',
      reviews: [review('APPROVED'), review('CHANGES_REQUESTED')],
      options: {
        labels: [],
        moveAfterFirstRead: true,
        statuses: [clearedGate],
      },
    },
    {
      name: 'dismissal',
      reviews: [review('APPROVED'), review('DISMISSED')],
      options: {
        labels: [],
        moveAfterFirstRead: true,
        statuses: [clearedGate],
      },
    },
  ])(
    'does not mutate after a moved-head $name race',
    async ({reviews, options}) => {
      const h = harness(reviews, options);

      await run(h);

      expect(mutations(h.calls)).toEqual([]);
    },
  );
});

describe('review-clear review-app approval for write-access authors', () => {
  const statusesOf = calls =>
    calls.filter(call => call?.type === 'status').map(call => call.input);

  it('clears the gate when the app approves a write-access author on the exact head', async () => {
    const h = harness([appReview('APPROVED')], {reviewApp: APP});

    await run(h);

    expect(h.calls).toContain('permission:author');
    expect(statusesOf(h.calls)).toEqual([
      expect.objectContaining({
        sha: head2,
        context: 'review-required',
        state: 'success',
        description: APP_CLEARED,
      }),
    ]);
    expect(h.calls).toContainEqual(
      expect.objectContaining({type: 'remove-label'}),
    );
  });

  it('blocks again when the app later requests changes on the exact head', async () => {
    const h = harness([appReview('APPROVED'), appReview('CHANGES_REQUESTED')], {
      reviewApp: APP,
      labels: [],
      statuses: [appClearedGate],
    });

    await run(h);

    expect(statusesOf(h.calls)).toEqual([
      expect.objectContaining({
        state: 'pending',
        description: 'Waiting on code review after approval withdrawal.',
      }),
    ]);
    expect(h.calls).toContainEqual(
      expect.objectContaining({type: 'add-label'}),
    );
  });

  it.each(['read', 'triage', 'none'])(
    'leaves a %s-permission author waiting on an engineering owner',
    async permission => {
      const h = harness([appReview('APPROVED')], {reviewApp: APP, permission});

      await run(h);

      expect(mutations(h.calls)).toEqual([]);
    },
  );

  it('still clears a no-write author through an engineering-owner approval', async () => {
    const h = harness([appReview('APPROVED'), review('APPROVED')], {
      reviewApp: APP,
      permission: 'read',
    });

    await run(h);

    expect(statusesOf(h.calls)).toEqual([
      expect.objectContaining({
        state: 'success',
        description: 'Cleared by code-owner approval.',
      }),
    ]);
  });

  it('does not let an app approval of an earlier head clear the new head', async () => {
    const h = harness([appReview('APPROVED', head1)], {reviewApp: APP});

    await run(h);

    expect(mutations(h.calls)).toEqual([]);
  });

  it('fails closed when the author permission cannot be read', async () => {
    const h = harness([appReview('APPROVED')], {
      reviewApp: APP,
      permission: new Error('503'),
    });

    await run(h);

    expect(mutations(h.calls)).toEqual([]);
    expect(h.calls).toContainEqual(
      expect.stringContaining('warning:Could not read author permission'),
    );
  });

  it('restores an app-cleared gate when the app path no longer applies', async () => {
    const h = harness([appReview('APPROVED')], {
      reviewApp: APP,
      permission: new Error('503'),
      labels: [],
      statuses: [appClearedGate],
    });

    await run(h);

    expect(statusesOf(h.calls)).toEqual([
      expect.objectContaining({state: 'pending'}),
    ]);
  });

  it('restores an app clear hidden under a spec wait when the app path no longer applies', async () => {
    const h = harness([appReview('APPROVED')], {
      labels: [],
      // REVIEW_APP is unset; newest first: the spec wait over the app's clear.
      statuses: [
        gateStatus(
          'pending',
          '⏳ Waiting for human spec approval: an eng owner can reply /approve-spec <sha>',
        ),
        gateStatus(
          'pending',
          'Waiting on code review: core runtime change (+ spec approval)',
        ),
      ],
    });

    await run(h);

    expect(statusesOf(h.calls).at(-1)).toMatchObject({
      state: 'pending',
      description: expect.stringContaining('withdrawal'),
    });
  });

  it('ignores app reviews when REVIEW_APP is unset', async () => {
    const h = harness([appReview('APPROVED')]);

    await run(h);

    expect(h.calls).not.toContain('permission:author');
    expect(mutations(h.calls)).toEqual([]);
  });

  it("keeps an engineering owner's exact-head request for changes over an app approval", async () => {
    const h = harness([review('CHANGES_REQUESTED'), appReview('APPROVED')], {
      reviewApp: APP,
    });

    await run(h);

    expect(statusesOf(h.calls)).toEqual([
      expect.objectContaining({state: 'pending'}),
    ]);
  });
});
