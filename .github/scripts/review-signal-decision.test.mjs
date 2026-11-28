// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  classifyReviewSignalPaths,
  composeReviewGate,
  hasWritePermission,
  normalizeReviewApp,
  readCodeGate,
  readHeadPushedAt,
  readSpecGate,
  resolveReviewApprovals,
  TRAINER_WAITING_TEXT,
  needsTrainerPass,
  ownerRemovedLabelAtHead,
  trainerPassed,
  OWNER_CLEARED_TEXT,
} = require('./review-signal-decision.cjs');

const head1 = '1111111111111111111111111111111111111111';
const head2 = '2222222222222222222222222222222222222222';
// When the head under review was pushed; reviews default to after it.
const PUSHED = '2026-11-20T10:00:00Z';
const AFTER = '2026-11-20T11:00:00Z';
const BEFORE = '2026-11-19T09:00:00Z';
const approval = (
  login,
  commitId,
  state = 'APPROVED',
  submittedAt = AFTER,
) => ({
  user: {login},
  commit_id: commitId,
  state,
  submitted_at: submittedAt,
});
const APP = 'review-app[bot]';
const appReview = (commitId, state = 'APPROVED', submittedAt = AFTER) => ({
  user: {login: APP, type: 'Bot'},
  commit_id: commitId,
  state,
  submitted_at: submittedAt,
});
const resolveWithApp = (reviews, {authorHasWrite = true, ...rest} = {}) =>
  resolveReviewApprovals({
    reviews,
    headSha: head2,
    headPushedAt: PUSHED,
    engOwners: ['engineer'],
    designOwners: ['designer'],
    reviewApp: APP,
    authorHasWrite,
    ...rest,
  });

describe('reviews GitHub re-binds to a new head', () => {
  // `headPushedAt` defaults to PUSHED only when the key is absent, so a test
  // can pass undefined.
  const resolve = (reviews, options = {}) =>
    resolveReviewApprovals({
      reviews,
      headSha: head2,
      headPushedAt: 'headPushedAt' in options ? options.headPushedAt : PUSHED,
      engOwners: ['engineer'],
      designOwners: ['designer'],
      reviewApp: APP,
      authorHasWrite: true,
    });

  it('does not count an approval submitted before the head was pushed', () => {
    // GitHub reports the older approval's commit_id as the new head.
    expect(resolve([appReview(head2, 'APPROVED', BEFORE)])).toMatchObject({
      codeApproved: false,
      codeApprovedBy: null,
    });
    expect(
      resolve([approval('engineer', head2, 'APPROVED', BEFORE)]),
    ).toMatchObject({codeApproved: false});
    expect(
      resolve([approval('designer', head2, 'APPROVED', BEFORE)]),
    ).toMatchObject({designApproved: false});
  });

  it('counts an approval submitted after the push', () => {
    expect(
      resolve([
        appReview(head2, 'APPROVED', BEFORE),
        appReview(head2, 'APPROVED', AFTER),
      ]),
    ).toMatchObject({codeApproved: true, codeApprovedBy: 'review-app'});
  });

  it('counts no review when the push time cannot be read', () => {
    for (const unread of [null, undefined, '', 'not a time']) {
      expect(
        resolve(
          [
            appReview(head2, 'APPROVED', AFTER),
            approval('engineer', head2, 'APPROVED', AFTER),
          ],
          {headPushedAt: unread},
        ),
      ).toEqual({
        codeApproved: false,
        codeApprovedBy: null,
        codeWithdrawn: false,
        designApproved: false,
      });
    }
  });

  it("does not let an owner's re-bound request for changes block or withdraw", () => {
    expect(
      resolve([
        approval('engineer', head2, 'CHANGES_REQUESTED', BEFORE),
        appReview(head2, 'APPROVED', AFTER),
      ]),
    ).toMatchObject({codeApproved: true, codeWithdrawn: false});
    expect(
      resolve([approval('engineer', head2, 'CHANGES_REQUESTED', BEFORE)]),
    ).toMatchObject({codeApproved: false, codeWithdrawn: false});
  });

  it('gives no trainer pass for a re-bound owner approval', () => {
    expect(
      trainerPassed({
        reviews: [approval('engineer', head2, 'APPROVED', BEFORE)],
        headSha: head2,
        headPushedAt: PUSHED,
        engOwners: ['engineer'],
      }),
    ).toBe(false);
  });
});

describe('readHeadPushedAt', () => {
  const github = ({committed, suites = [], commitFails, suitesFail}) => ({
    rest: {
      repos: {
        getCommit: async () => {
          if (commitFails) throw new Error('unreadable');
          return {data: {commit: {committer: {date: committed}}}};
        },
      },
      checks: {
        listSuitesForRef: async () => {
          if (suitesFail) throw new Error('unreadable');
          return {
            data: {check_suites: suites.map(created_at => ({created_at}))},
          };
        },
      },
    },
  });
  const read = input =>
    readHeadPushedAt({
      github: github(input),
      owner: 'o',
      repo: 'r',
      sha: head2,
    });

  it('is the later of the committer date and the first check suite', async () => {
    expect(
      await read({
        committed: '2026-11-19T08:00:00Z',
        suites: ['2026-11-20T10:05:00Z', '2026-11-20T10:00:00Z'],
      }),
    ).toBe('2026-11-20T10:00:00Z');
    expect(
      await read({
        committed: '2026-11-20T12:00:00Z',
        suites: ['2026-11-20T10:00:00Z'],
      }),
    ).toBe('2026-11-20T12:00:00Z');
    expect(await read({committed: '2026-11-20T12:00:00Z'})).toBe(
      '2026-11-20T12:00:00Z',
    );
  });

  it('is null when either read fails or the commit has no date', async () => {
    expect(await read({commitFails: true})).toBeNull();
    expect(
      await read({committed: '2026-11-20T12:00:00Z', suitesFail: true}),
    ).toBeNull();
    expect(await read({committed: undefined})).toBeNull();
  });
});

describe('review-signal exact-head approvals', () => {
  it('does not let an H1 engineering approval clear H2', () => {
    expect(
      resolveReviewApprovals({
        reviews: [approval('engineer', head1)],
        headSha: head2,
        headPushedAt: PUSHED,
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
        headPushedAt: PUSHED,
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
        headPushedAt: PUSHED,
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
        headPushedAt: PUSHED,
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
        headPushedAt: PUSHED,
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

describe('the review gate text for the spec half', () => {
  const codeWait = 'Waiting on code review: community contribution';
  const trusted = (context, description, state = 'pending') => ({
    context,
    state,
    description,
    target_url: 'https://github.com/meta/astryx/actions/runs/7/attempts/1',
    creator: {login: 'github-actions[bot]'},
  });
  const reconciling = trusted(
    'spec-owner-approval',
    'Reconciling exact head abcdef1.',
  );
  const approvedMirror = trusted(
    'spec-owner-approval',
    'Mirrors review-required · spec ok (@owner)',
    'success',
  );
  const waitingMirror = trusted(
    'spec-owner-approval',
    'Mirrors review-required · spec waiting (eng)',
  );
  const gateFor = (statuses, codeGated = true) =>
    composeReviewGate({
      codeGated,
      codeDescription: codeGated ? codeWait : 'Review complete.',
      spec: readSpecGate(statuses),
    });

  it('asks for nothing before the spec half is decided on a new head', () => {
    for (const statuses of [[], [reconciling]]) {
      expect(gateFor(statuses)).toEqual({
        state: 'pending',
        description: `${codeWait} (+ spec check)`,
      });
    }
  });

  it('shows an approval of this head as carried while a run checks it again', () => {
    const statuses = [reconciling, approvedMirror];

    expect(gateFor(statuses)).toEqual({
      state: 'pending',
      description: `${codeWait} · spec approval carried (verifying)`,
    });
    expect(gateFor(statuses, false)).toMatchObject({
      state: 'pending',
      description: '⏳ Spec approval carried (verifying)',
    });
  });

  it('asks for nothing while a run checks a head that needed no owner approval', () => {
    const decidedWithoutApprovers = trusted(
      'spec-owner-approval',
      'Mirrors review-required · spec ok',
      'success',
    );

    expect(gateFor([reconciling, decidedWithoutApprovers]).description).toBe(
      `${codeWait} (+ spec check)`,
    );
  });

  it('still asks for approval when the last decision on this head waits', () => {
    expect(gateFor([reconciling, waitingMirror]).description).toBe(
      `${codeWait} (+ spec approval)`,
    );
    expect(gateFor([waitingMirror]).description).toBe(
      `${codeWait} (+ spec approval)`,
    );
  });

  it('reads the code half back from every spec suffix', () => {
    for (const suffix of [
      ' (+ spec approval)',
      ' (+ spec check)',
      ' · spec approval carried (verifying)',
    ]) {
      expect(
        readCodeGate([trusted('review-required', `${codeWait}${suffix}`)]),
      ).toEqual({gated: true, description: codeWait});
    }
  });
});

describe("a trainer pass for the review app's own pull requests", () => {
  const HEAD = 'a'.repeat(40);
  const review = (login, state, commitId = HEAD) => ({
    user: {login, type: 'User'},
    state,
    commit_id: commitId,
    submitted_at: AFTER,
  });

  it('applies only to a pull request the review app opened', () => {
    expect(
      needsTrainerPass({
        author: 'Review-App[bot]',
        reviewApp: 'review-app[bot]',
      }),
    ).toBe(true);
    expect(
      needsTrainerPass({
        author: 'dependabot[bot]',
        reviewApp: 'review-app[bot]',
      }),
    ).toBe(false);
    expect(
      needsTrainerPass({author: 'contributor', reviewApp: 'review-app[bot]'}),
    ).toBe(false);
    expect(needsTrainerPass({author: 'review-app[bot]', reviewApp: ''})).toBe(
      false,
    );
  });

  it("passes on an engineering owner's latest approval of the exact head only", () => {
    const engOwners = ['engineer'];
    const passed = reviews =>
      trainerPassed({reviews, headSha: HEAD, headPushedAt: PUSHED, engOwners});
    expect(passed([])).toBe(false);
    expect(passed([review('engineer', 'APPROVED')])).toBe(true);
    expect(passed([review('engineer', 'APPROVED', 'b'.repeat(40))])).toBe(
      false,
    );
    expect(passed([review('someone', 'APPROVED')])).toBe(false);
    expect(
      passed([
        review('engineer', 'APPROVED'),
        review('engineer', 'CHANGES_REQUESTED'),
      ]),
    ).toBe(false);
  });

  it('clears with the text review-clear owns, so review-clear re-gates a withdrawn trainer pass', () => {
    const clear = readFileSync(
      fileURLToPath(new URL('../workflows/review-clear.yml', import.meta.url)),
      'utf8',
    );
    expect(clear).toContain(`const OWNER_CLEARED = '${OWNER_CLEARED_TEXT}';`);
  });

  it('waits with a code-review description that review-clear owns', () => {
    expect(TRAINER_WAITING_TEXT.startsWith('Waiting on code review:')).toBe(
      true,
    );
    expect(TRAINER_WAITING_TEXT.length).toBeLessThanOrEqual(140);
  });
});

describe('ownerRemovedLabelAtHead', () => {
  const LABEL = 'needs:design-review';
  const owners = ['engineer', 'designer'];
  const at = minute => `2026-11-14T17:${String(minute).padStart(2, '0')}:00Z`;
  // The head reached the pull request when review-signal first gated it.
  const arrived = minute => ({
    context: 'review-required',
    creator: {login: 'github-actions[bot]'},
    created_at: at(minute),
  });
  const removed = (login, minute, name = LABEL) => ({
    event: 'unlabeled',
    actor: {login},
    label: {name},
    created_at: at(minute),
  });
  // A pushed commit is listed by its committer date, which can be earlier
  // than both its push and an owner's removal.
  const committed = (minute, sha) => ({
    event: 'committed',
    sha,
    committer: {date: at(minute)},
  });
  // The head commit is passed too, as a rule that reads the head from the
  // timeline's commits would need it; this rule dates the head by its status.
  const decide = (events, headStatuses) =>
    ownerRemovedLabelAtHead({
      events,
      headStatuses,
      label: LABEL,
      owners,
      headSha: head2,
    });

  it('sees an owner removal after the head arrived', () => {
    expect(decide([removed('designer', 30)], [arrived(20)])).toEqual({
      removedAtHead: true,
      by: 'designer',
    });
    // An engineering owner counts too, and logins compare case-insensitively.
    expect(decide([removed('Engineer', 30)], [arrived(20)]).removedAtHead).toBe(
      true,
    );
  });

  it('does not count a removal from before the head arrived, whatever the commit date', () => {
    // As on a real timeline: a commit dated 17:05, pushed at 17:19, after an
    // owner removed the label at 17:14 on the head before it.
    expect(
      decide([committed(5, head2), removed('designer', 14)], [arrived(19)]),
    ).toEqual({removedAtHead: false, by: null});
  });

  it('does not count a removal by someone who is not an owner', () => {
    expect(
      decide([removed('contributor', 30)], [arrived(20)]).removedAtHead,
    ).toBe(false);
  });

  it('counts only the label itself, and only trusted gate statuses for the arrival', () => {
    expect(
      decide([removed('designer', 30, 'needs:code-review')], [arrived(20)])
        .removedAtHead,
    ).toBe(false);
    // No review-required status on the head: its arrival is unknown.
    expect(decide([removed('designer', 30)], []).removedAtHead).toBe(false);
    // A status another account wrote does not date the head.
    expect(
      decide(
        [removed('designer', 30)],
        [{...arrived(20), creator: {login: 'someone'}}],
      ).removedAtHead,
    ).toBe(false);
    // The earliest gate status dates the head, not a later rewrite.
    expect(
      decide([removed('designer', 30)], [arrived(40), arrived(20)])
        .removedAtHead,
    ).toBe(true);
  });
});
