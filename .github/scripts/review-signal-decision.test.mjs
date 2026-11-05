// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  classifyReviewSignalPaths,
  hasWritePermission,
  normalizeReviewApp,
  resolveReviewApprovals,
} = require('./review-signal-decision.cjs');

const head1 = '1111111111111111111111111111111111111111';
const head2 = '2222222222222222222222222222222222222222';
const approval = (login, commitId, state = 'APPROVED') => ({
  user: {login},
  commit_id: commitId,
  state,
});
const APP = 'review-app[bot]';
const appReview = (commitId, state = 'APPROVED') => ({
  user: {login: APP, type: 'Bot'},
  commit_id: commitId,
  state,
});
const resolveWithApp = (reviews, {authorHasWrite = true, ...rest} = {}) =>
  resolveReviewApprovals({
    reviews,
    headSha: head2,
    engOwners: ['engineer'],
    designOwners: ['designer'],
    reviewApp: APP,
    authorHasWrite,
    ...rest,
  });

describe('review-signal exact-head approvals', () => {
  it('does not let an H1 engineering approval clear H2', () => {
    expect(
      resolveReviewApprovals({
        reviews: [approval('engineer', head1)],
        headSha: head2,
        engOwners: ['engineer'],
        designOwners: ['designer'],
      }),
    ).toEqual({
      codeApproved: false,
      codeApprovedBy: null,
      codeWithdrawn: false,
      designApproved: false,
    });
  });

  it('does not let an H1 design approval clear H2', () => {
    expect(
      resolveReviewApprovals({
        reviews: [approval('designer', head1)],
        headSha: head2,
        engOwners: ['engineer'],
        designOwners: ['designer'],
      }),
    ).toEqual({
      codeApproved: false,
      codeApprovedBy: null,
      codeWithdrawn: false,
      designApproved: false,
    });
  });

  it('accepts only exact-head approvals and honors later exact-head revocation', () => {
    expect(
      resolveReviewApprovals({
        reviews: [
          approval('engineer', head1),
          approval('engineer', head2),
          approval('designer', head2),
        ],
        headSha: head2,
        engOwners: ['engineer'],
        designOwners: ['designer'],
      }),
    ).toEqual({
      codeApproved: true,
      codeApprovedBy: 'owner',
      codeWithdrawn: false,
      designApproved: true,
    });

    expect(
      resolveReviewApprovals({
        reviews: [
          approval('engineer', head2),
          approval('engineer', head2, 'CHANGES_REQUESTED'),
          approval('designer', head2),
          approval('designer', head2, 'DISMISSED'),
        ],
        headSha: head2,
        engOwners: ['engineer'],
        designOwners: ['designer'],
      }),
    ).toEqual({
      codeApproved: false,
      codeApprovedBy: null,
      codeWithdrawn: true,
      designApproved: false,
    });
  });

  it('keeps an effective exact-head approval when another owner withdraws', () => {
    expect(
      resolveReviewApprovals({
        reviews: [
          approval('engineer-a', head2),
          approval('engineer-b', head2),
          approval('engineer-b', head2, 'CHANGES_REQUESTED'),
        ],
        headSha: head2,
        engOwners: ['engineer-a', 'engineer-b'],
        designOwners: [],
      }),
    ).toEqual({
      codeApproved: true,
      codeApprovedBy: 'owner',
      codeWithdrawn: false,
      designApproved: false,
    });
  });

  it.each([
    {
      name: 'Core to lab',
      file: {
        filename: 'packages/lab/src/Button/Button.tsx',
        previous_filename: 'packages/core/src/Button/Button.tsx',
        status: 'renamed',
      },
      expectedPaths: [
        'packages/lab/src/Button/Button.tsx',
        'packages/core/src/Button/Button.tsx',
      ],
    },
    {
      name: 'unsafe to sandbox',
      file: {
        filename: 'apps/sandbox/src/Button.tsx',
        previous_filename: 'packages/build/src/Button.tsx',
        status: 'renamed',
      },
      expectedPaths: [
        'apps/sandbox/src/Button.tsx',
        'packages/build/src/Button.tsx',
      ],
    },
  ])('retains both sides of a $name rename', ({file, expectedPaths}) => {
    expect(classifyReviewSignalPaths([file])).toEqual({
      files: [file],
      hasSafeBoundaryRename: true,
      paths: expectedPaths,
    });
  });

  it('excludes a rename only when both sides are safe', () => {
    const file = {
      filename: 'apps/storybook/stories/Button.stories.tsx',
      previous_filename: 'apps/sandbox/src/Button.tsx',
      status: 'renamed',
    };
    expect(classifyReviewSignalPaths([file])).toEqual({
      files: [],
      hasSafeBoundaryRename: false,
      paths: [],
    });
  });

  it('stays dependency-free for trusted-base loading', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./review-signal-decision.cjs', import.meta.url)),
      'utf8',
    );
    const mod = {exports: {}};
    new Function('module', 'exports', 'require', source)(
      mod,
      mod.exports,
      () => {
        throw new Error('review-signal-decision.cjs must stay dependency-free');
      },
    );
    expect(typeof mod.exports.resolveReviewApprovals).toBe('function');
  });
});

describe('review-app approval for write-access authors', () => {
  it('clears the code gate for a write-access author on the exact head', () => {
    expect(resolveWithApp([appReview(head2)])).toEqual({
      codeApproved: true,
      codeApprovedBy: 'review-app',
      codeWithdrawn: false,
      designApproved: false,
    });
  });

  it('blocks again when a later exact-head verdict requests changes or is dismissed', () => {
    for (const state of ['CHANGES_REQUESTED', 'DISMISSED']) {
      expect(
        resolveWithApp([appReview(head2), appReview(head2, state)]),
      ).toEqual({
        codeApproved: false,
        codeApprovedBy: null,
        codeWithdrawn: true,
        designApproved: false,
      });
    }
  });

  it('clears again when the latest exact-head verdict approves after a request for changes', () => {
    expect(
      resolveWithApp([appReview(head2, 'CHANGES_REQUESTED'), appReview(head2)])
        .codeApprovedBy,
    ).toBe('review-app');
  });

  it('ignores a later app comment, which is not a verdict', () => {
    expect(
      resolveWithApp([appReview(head2), appReview(head2, 'COMMENTED')])
        .codeApproved,
    ).toBe(true);
  });

  it('still needs an engineering owner when the author lacks write access', () => {
    expect(resolveWithApp([appReview(head2)], {authorHasWrite: false})).toEqual(
      {
        codeApproved: false,
        codeApprovedBy: null,
        codeWithdrawn: false,
        designApproved: false,
      },
    );
    expect(
      resolveWithApp([appReview(head2), approval('engineer', head2)], {
        authorHasWrite: false,
      }).codeApprovedBy,
    ).toBe('owner');
  });

  it('does not carry an app approval of an earlier head to a new head', () => {
    expect(resolveWithApp([appReview(head1)])).toEqual({
      codeApproved: false,
      codeApprovedBy: null,
      codeWithdrawn: false,
      designApproved: false,
    });
  });

  it("keeps an engineering owner's exact-head request for changes over an app approval", () => {
    expect(
      resolveWithApp([
        approval('engineer', head2, 'CHANGES_REQUESTED'),
        appReview(head2),
      ]),
    ).toEqual({
      codeApproved: false,
      codeApprovedBy: null,
      codeWithdrawn: true,
      designApproved: false,
    });
  });

  it('ignores the app when REVIEW_APP is unset or malformed', () => {
    for (const reviewApp of ['', undefined, 'not-a-bot', '  ']) {
      expect(resolveWithApp([appReview(head2)], {reviewApp}).codeApproved).toBe(
        false,
      );
    }
  });

  it('ignores a non-Bot account that matches the configured login', () => {
    expect(
      resolveWithApp([
        {user: {login: APP, type: 'User'}, commit_id: head2, state: 'APPROVED'},
      ]).codeApproved,
    ).toBe(false);
  });

  it('treats only write and admin as write access', () => {
    expect(hasWritePermission({permission: 'admin'})).toBe(true);
    expect(hasWritePermission({permission: 'write'})).toBe(true);
    for (const response of [
      {permission: 'read'},
      {permission: 'none'},
      {permission: 'triage'},
      {},
      null,
      undefined,
    ]) {
      expect(hasWritePermission(response)).toBe(false);
    }
  });

  it('normalizes the configured app login and rejects non-bot values', () => {
    expect(normalizeReviewApp(' Review-App[bot] ')).toBe('review-app[bot]');
    expect(normalizeReviewApp('review-app')).toBe('');
    expect(normalizeReviewApp(undefined)).toBe('');
  });
});
