// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  OWNER_COMMAND_PREFIXES,
  canonicalRunUrl,
  describeOwnerCommandProblem,
  isDispatchableOwnerCommand,
  newestGateRun,
  parseCanonicalRunId,
  parseOwnerCommand,
  parseOwnerCommandIntent,
  parseOwnerFile,
  requiredApprovalGroups,
  resolveOwnerDecision,
} = require('./spec-owner-decision.cjs');
const {
  fingerprintSpecContent,
  parseOwnerCommandTarget,
} = require('./spec-owner-decision.cjs');
const {
  composeReviewGate,
  readSpecGate,
} = require('./review-signal-decision.cjs');

const head = 'abcdef1234567890abcdef1234567890abcdef12';
const owner = {login: 'cixzhang'};
const componentPath = 'packages/core/src/Button/Button.spec.md';

function componentRecord({body = 'Body.', decision = null} = {}) {
  const block =
    decision === null
      ? ''
      : `\n\n### Design decisions\n\n<!-- design-decisions:v1 -->\n\n| ID | Decision | Intent or reason | Applies to | Allowed variation |\n| --- | --- | --- | --- | --- |\n| DD1 | ${decision} | Preserve emphasis. | Default state | Theme tokens may vary. |`;
  return `---\nkind: component\nauthority: current\n---\n\n## Design relationships\n\n${body}${block}\n\n### Theming anatomy\n`;
}

describe('spec owner decision', () => {
  it('binds approval commands to the current head', () => {
    expect(parseOwnerCommand(`/approve-spec ${head}`, head)).toBe(true);
    expect(
      parseOwnerCommand(
        '/approve-spec 1111111111111111111111111111111111111111',
        head,
      ),
    ).toBe(null);
  });

  it('accepts an owner review only for the current head', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang', 'imdreamrunner'],
      headSha: head,
      comments: [],
      reviews: [
        {
          user: owner,
          state: 'APPROVED',
          commit_id: head,
          submitted_at: '2026-08-30T10:00:00Z',
        },
      ],
    });
    expect(decision.approved).toBe(true);
    expect(decision.source).toBe('review');
  });

  it('requires approval only when current authority is involved', () => {
    const {requiresOwnerApproval} = require('./spec-owner-decision.cjs');
    expect(
      requiresOwnerApproval([
        {baseContent: null, headContent: 'authority: draft'},
      ]),
    ).toBe(false);
    expect(
      requiresOwnerApproval([
        {baseContent: 'authority: draft', headContent: 'authority: "current"'},
      ]),
    ).toBe(true);
    expect(
      requiresOwnerApproval([
        {baseContent: 'authority: current', headContent: 'authority: archived'},
      ]),
    ).toBe(true);
    expect(requiresOwnerApproval([], {complete: false})).toBe(true);
  });

  it('parses DESIGNOWNERS without comment examples', () => {
    expect(
      parseOwnerFile(`
# Uses @handle format and does not grant merge rights.
@rubyycheung @ernestt
# @not-an-owner
@kentonquatman @cvkxx
`),
    ).toEqual(['rubyycheung', 'ernestt', 'kentonquatman', 'cvkxx']);
  });

  it('routes current design and non-design records to separate owner groups', () => {
    expect(
      requiredApprovalGroups([
        {
          path: 'docs/design/selection.md',
          baseContent: null,
          headContent: 'kind: design\nauthority: current',
        },
      ]),
    ).toEqual({spec: false, design: true, theme: false});
    expect(
      requiredApprovalGroups([
        {
          path: 'packages/themes/neutral/neutral.spec.md',
          baseContent: null,
          headContent: 'kind: theme\nauthority: current',
        },
      ]),
    ).toEqual({spec: false, design: false, theme: true});
    expect(
      requiredApprovalGroups([
        {
          path: 'packages/core/src/Button/Button.spec.md',
          baseContent: 'kind: component\nauthority: current',
          headContent: 'kind: component\nauthority: current',
        },
      ]),
    ).toEqual({spec: true, design: false, theme: false});
    expect(
      requiredApprovalGroups(
        [
          {
            path: 'docs/design/selection.md',
            baseContent: 'kind: design\nauthority: current',
            headContent: 'kind: design\nauthority: current',
          },
          {
            path: 'docs/architecture/themes.md',
            baseContent: 'kind: architecture\nauthority: current',
            headContent: 'kind: architecture\nauthority: current',
          },
        ],
        {touchesDesignAssets: true},
      ),
    ).toEqual({spec: true, design: true, theme: false});
    expect(
      requiredApprovalGroups([
        {
          path: 'docs/design/not-a-design-record.md',
          baseContent: null,
          headContent: 'kind: architecture\nauthority: current',
        },
      ]),
    ).toEqual({spec: true, design: false, theme: false});
    expect(
      requiredApprovalGroups([
        {
          path: 'docs/design/themes.md',
          previousPath: 'docs/architecture/themes.md',
          baseContent: 'kind: architecture\nauthority: current',
          headContent: 'kind: design\nauthority: current',
        },
      ]),
    ).toEqual({spec: true, design: true, theme: false});
  });

  it('routes DD-only component changes to design owners', () => {
    expect(
      requiredApprovalGroups([
        {
          path: componentPath,
          baseContent: componentRecord({decision: 'Use a quiet label.'}),
          headContent: componentRecord({decision: 'Keep the label quiet.'}),
        },
      ]),
    ).toEqual({spec: false, design: true, theme: false});
  });

  it('routes mixed DD and component contract changes to both groups', () => {
    expect(
      requiredApprovalGroups([
        {
          path: componentPath,
          baseContent: componentRecord({decision: 'Use a quiet label.'}),
          headContent: componentRecord({
            body: 'Changed contract.',
            decision: 'Keep the label quiet.',
          }),
        },
      ]),
    ).toEqual({spec: true, design: true, theme: false});
  });

  it('keeps component edits without a DD change in engineering', () => {
    expect(
      requiredApprovalGroups([
        {
          path: componentPath,
          baseContent: componentRecord(),
          headContent: componentRecord({body: 'Changed contract.'}),
        },
      ]),
    ).toEqual({spec: true, design: false, theme: false});
  });

  it('fails closed for a renamed component record', () => {
    expect(
      requiredApprovalGroups([
        {
          path: 'packages/core/src/Action/Action.spec.md',
          previousPath: componentPath,
          baseContent: componentRecord(),
          headContent: componentRecord(),
        },
      ]),
    ).toEqual({spec: true, design: true, theme: false});
  });

  it('owner-gates design assets even without a text record', () => {
    expect(requiredApprovalGroups([], {touchesDesignAssets: true})).toEqual({
      spec: false,
      design: true,
      theme: false,
    });
    expect(requiredApprovalGroups([], {complete: false})).toEqual({
      spec: true,
      design: true,
      theme: true,
    });
  });

  it('accepts an exact-head repo-owner review for the theme group', () => {
    const groups = requiredApprovalGroups([
      {
        path: 'packages/themes/neutral/neutral.spec.md',
        baseContent: null,
        headContent: 'kind: theme\nauthority: current',
      },
    ]);
    const decision = resolveOwnerDecision({
      owners: ['cixzhang', 'rubyycheung', 'imdreamrunner'],
      headSha: head,
      comments: [],
      reviews: [
        {
          user: {login: 'rubyycheung'},
          state: 'APPROVED',
          commit_id: head,
          submitted_at: '2026-08-30T10:00:00Z',
        },
      ],
    });

    expect(groups).toEqual({spec: false, design: false, theme: true});
    expect(decision).toMatchObject({
      approved: true,
      owner: 'rubyycheung',
      source: 'review',
    });
  });

  it('does not make a self-declared record owner an approver', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang', 'rubyycheung', 'imdreamrunner'],
      headSha: head,
      comments: [],
      reviews: [
        {
          user: {login: 'self-declared-owner'},
          state: 'APPROVED',
          commit_id: head,
          submitted_at: '2026-08-30T10:00:00Z',
        },
      ],
    });

    expect(decision.approved).toBe(false);
  });

  it('accepts either configured owner', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang', 'imdreamrunner'],
      headSha: head,
      comments: [],
      reviews: [
        {
          user: {login: 'imdreamrunner'},
          state: 'APPROVED',
          commit_id: head,
          submitted_at: '2026-08-30T10:00:00Z',
        },
      ],
    });
    expect(decision.approved).toBe(true);
    expect(decision.owner).toBe('imdreamrunner');
  });

  it('ignores a dismissed owner review', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang', 'imdreamrunner'],
      headSha: head,
      comments: [],
      reviews: [
        {
          user: owner,
          state: 'DISMISSED',
          commit_id: head,
          submitted_at: '2026-08-30T10:01:00Z',
        },
        {
          user: {login: 'imdreamrunner'},
          state: 'APPROVED',
          commit_id: head,
          submitted_at: '2026-08-30T10:00:00Z',
        },
      ],
    });
    expect(decision.approved).toBe(true);
    expect(decision.owner).toBe('imdreamrunner');
  });

  it('keeps the gate blocked when either owner has a current-head objection', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang', 'imdreamrunner'],
      headSha: head,
      comments: [],
      reviews: [
        {
          user: owner,
          state: 'APPROVED',
          commit_id: head,
          submitted_at: '2026-08-30T10:00:00Z',
        },
        {
          user: {login: 'imdreamrunner'},
          state: 'CHANGES_REQUESTED',
          commit_id: head,
          submitted_at: '2026-08-30T10:01:00Z',
        },
      ],
    });
    expect(decision.approved).toBe(false);
    expect(decision.owner).toBe('imdreamrunner');
  });

  it('rejects an approval attached to an older head', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang', 'imdreamrunner'],
      headSha: head,
      comments: [],
      reviews: [
        {
          user: owner,
          state: 'APPROVED',
          commit_id: '1111111111111111111111111111111111111111',
          submitted_at: '2026-08-30T10:00:00Z',
        },
      ],
    });
    expect(decision.approved).toBe(false);
  });

  it('lets the latest owner action revoke an approval', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang', 'imdreamrunner'],
      headSha: head,
      reviews: [
        {
          user: owner,
          state: 'APPROVED',
          commit_id: head,
          submitted_at: '2026-08-30T10:00:00Z',
        },
      ],
      comments: [
        {
          user: owner,
          body: `/revoke-spec ${head}`,
          created_at: '2026-08-30T10:01:00Z',
        },
      ],
    });
    expect(decision.approved).toBe(false);
  });

  it('withdraws only the revoking owner, and holds on a current request for changes', () => {
    const earlier = '1111111111111111111111111111111111111111';
    const at = '2026-08-30T10:01:00Z';
    const decide = ({reviews = [], comments = []}) =>
      resolveOwnerDecision({
        owners: ['cixzhang', 'imdreamrunner'],
        headSha: head,
        reviews: [
          {
            user: {login: 'imdreamrunner'},
            state: 'APPROVED',
            commit_id: head,
            submitted_at: at,
          },
          ...reviews,
        ],
        comments,
        approvesCurrentContent: sha => sha === head,
      }).approved;
    const say = body => ({comments: [{user: owner, body, created_at: at}]});
    const changes = commit_id => ({
      reviews: [
        {user: owner, state: 'CHANGES_REQUESTED', commit_id, submitted_at: at},
      ],
    });

    expect(decide(say('/revoke-spec'))).toBe(true);
    expect(decide(say(`/revoke-spec ${earlier}`))).toBe(true);
    expect(decide(changes(earlier))).toBe(true);
    expect(decide(changes(head))).toBe(false);
  });

  it('ignores commands from other users', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang', 'imdreamrunner'],
      headSha: head,
      reviews: [],
      comments: [
        {
          user: {login: 'someone-else'},
          body: `/approve-spec ${head}`,
          created_at: '2026-08-30T10:00:00Z',
        },
      ],
    });
    expect(decision.approved).toBe(false);
  });

  it('orders dismissal by updated_at instead of the original submission', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang'],
      headSha: head,
      comments: [
        {
          user: owner,
          body: `/approve-spec ${head}`,
          created_at: '2026-08-30T10:01:00Z',
        },
      ],
      reviews: [
        {
          id: 17,
          user: owner,
          state: 'DISMISSED',
          commit_id: head,
          submitted_at: '2026-08-30T09:00:00Z',
          updated_at: '2026-08-30T10:02:00Z',
        },
      ],
    });

    // The dismissal is dated by its update, so it follows the command.
    expect(decision.approved).toBe(false);
    expect(decision.source).toBe(null);
  });

  it('uses review_dismissed timeline time when it is newer', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang'],
      headSha: head,
      comments: [
        {
          user: owner,
          body: `/approve-spec ${head}`,
          created_at: '2026-08-30T10:01:00Z',
        },
      ],
      reviews: [
        {
          id: 17,
          user: owner,
          state: 'DISMISSED',
          commit_id: head,
          submitted_at: '2026-08-30T09:00:00Z',
          updated_at: '2026-08-30T09:30:00Z',
        },
      ],
      dismissalEvents: [
        {
          event: 'review_dismissed',
          created_at: '2026-08-30T10:02:00Z',
          dismissed_review: {review_id: 17},
        },
      ],
    });

    expect(decision.approved).toBe(false);
  });

  it('lets a command after the dismissal approve again', () => {
    const decision = resolveOwnerDecision({
      owners: ['cixzhang'],
      headSha: head,
      comments: [
        {
          user: owner,
          body: `/approve-spec ${head}`,
          created_at: '2026-08-30T10:03:00Z',
        },
      ],
      reviews: [
        {
          id: 17,
          user: owner,
          state: 'DISMISSED',
          commit_id: head,
          submitted_at: '2026-08-30T09:00:00Z',
          updated_at: '2026-08-30T10:02:00Z',
        },
      ],
    });

    expect(decision.approved).toBe(true);
  });
  it('compares workflow run ids without losing integer precision', () => {
    const repository = 'meta/astryx';
    const statuses = ['9007199254740992', '9007199254740993'].map(runId => ({
      context: 'spec-owner-approval',
      state: 'pending',
      description: `Run ${runId}`,
      target_url: canonicalRunUrl(repository, runId, '1'),
      creator: {login: 'github-actions[bot]'},
    }));

    expect(parseCanonicalRunId(statuses[1].target_url, repository)).toBe(
      9007199254740993n,
    );
    expect(newestGateRun(statuses, repository)?.runId).toBe(9007199254740993n);
  });

  describe('recognizing a command that does not decide the gate', () => {
    it('recognizes the owner-command shape whatever it names', () => {
      expect(parseOwnerCommandIntent('/approve-spec')).toEqual({
        verb: 'approve',
        argument: '',
      });
      expect(parseOwnerCommandIntent(`/revoke-spec ${head}  `)).toEqual({
        verb: 'revoke',
        argument: head,
      });
      expect(parseOwnerCommandIntent('/approve-spec abc1234 thanks')).toEqual({
        verb: 'approve',
        argument: 'abc1234 thanks',
      });
    });

    it.each([
      undefined,
      '',
      'Looks good to me',
      '/approve-specs abc',
      '/approve-spec-now',
      `Please run /approve-spec ${head}`,
      `  /approve-spec ${head}`,
      `\t/approve-spec ${head}`,
      `/APPROVE-SPEC ${head}`,
      `> /approve-spec ${head}`,
    ])('does not read %s as an owner command', body => {
      expect(parseOwnerCommandIntent(body)).toBe(null);
    });

    it('refuses to decide on a comment the workflow trigger would drop', () => {
      // resolveOwnerDecision reads every comment on the pull request, not just
      // the one that started the run. A comment GitHub's `startsWith` filter
      // never dispatches must not become approval evidence either.
      for (const body of [
        `  /approve-spec ${head}`,
        `/APPROVE-SPEC ${head}`,
        `> /approve-spec ${head}`,
      ]) {
        expect(isDispatchableOwnerCommand(body)).toBe(false);
        expect(parseOwnerCommand(body, head)).toBe(null);
        expect(
          resolveOwnerDecision({
            reviews: [],
            comments: [{user: owner, body, created_at: '2026-08-30T10:00:00Z'}],
            owners: ['cixzhang'],
            headSha: head,
          }).approved,
        ).toBe(false);
      }
    });

    it('admits exactly what the workflow trigger admits', () => {
      // The trigger is `startsWith(github.event.comment.body, '<prefix>')`:
      // the raw body, untrimmed and case-sensitive.
      const triggerAdmits = body =>
        OWNER_COMMAND_PREFIXES.some(prefix => String(body).startsWith(prefix));

      for (const body of [
        `/approve-spec ${head}`,
        '/approve-spec',
        '/revoke-spec',
        `/revoke-spec ${head}`,
        '/approve-spec abc1234',
        '/approve-spec-now',
        `  /approve-spec ${head}`,
        `/APPROVE-SPEC ${head}`,
        'Looks good to me',
        '',
      ]) {
        expect(isDispatchableOwnerCommand(body), body).toBe(
          triggerAdmits(body),
        );
      }
    });

    it('explains each way a recognized command decides nothing', () => {
      const stale = '1111111111111111111111111111111111111111';
      expect(
        describeOwnerCommandProblem(parseOwnerCommandIntent('/approve-spec')),
      ).toContain('did not name a commit');
      expect(
        describeOwnerCommandProblem(
          parseOwnerCommandIntent('/approve-spec abc1234'),
        ),
      ).toContain('full 40-character commit SHA');
      // A well-formed SHA is decided by comparing its spec content (DEC-14),
      // and a bare /revoke-spec withdraws.
      for (const body of [`/approve-spec ${stale}`, '/revoke-spec']) {
        expect(
          describeOwnerCommandProblem(parseOwnerCommandIntent(body)),
          body,
        ).toBe(null);
      }
    });

    it('accepts a commit SHA in either casing', () => {
      const upper = head.toUpperCase();

      // A SHA copied from a UI that renders it uppercase is the same commit.
      // The validator and the parser must agree, or the gate reports no
      // problem while silently ignoring the command.
      expect(parseOwnerCommand(`/approve-spec ${upper}`, head)).toBe(true);
      expect(parseOwnerCommand(`/revoke-spec ${upper}`, head)).toBe(false);
      expect(
        describeOwnerCommandProblem(
          parseOwnerCommandIntent(`/approve-spec ${upper}`),
        ),
      ).toBe(null);
      expect(parseOwnerCommand(`/approve-spec ${head}`, upper)).toBe(true);
    });

    it('agrees with the validator on every recognized command', () => {
      const stale = '1111111111111111111111111111111111111111';

      for (const body of [
        `/approve-spec ${head}`,
        `/approve-spec ${head.toUpperCase()}`,
        `/revoke-spec ${head}`,
        '/approve-spec',
        '/revoke-spec',
        '/approve-spec abc1234',
        `/approve-spec ${stale}`,
        `/approve-spec ${head} please`,
      ]) {
        const parsed = parseOwnerCommandTarget(body) !== null;
        const problem = describeOwnerCommandProblem(
          parseOwnerCommandIntent(body),
        );
        // Exactly one holds: the command reads as a decision, or the gate
        // can say why it does not.
        expect(parsed, body).toBe(problem === null);
      }
    });
  });
});

const record = [
  '---',
  'kind: architecture',
  'authority: draft',
  'approved_by: null',
  'approved_at: null',
  'owners: [cixzhang]',
  '---',
  '',
  '# Example',
  '',
  'The contract.',
  '',
].join('\n');
const fingerprint = content =>
  fingerprintSpecContent([{path: 'docs/a.md', content}]).fingerprint;

describe('spec content fingerprint (DEC-14)', () => {
  it('ignores only the values approval bookkeeping writes', () => {
    const flipped = record
      .replace('authority: draft', 'authority: current')
      .replace('approved_by: null', 'approved_by: cixzhang')
      .replace('approved_at: null', 'approved_at: 2026-10-28');
    expect(fingerprint(flipped)).toBe(fingerprint(record));
    for (const edited of [
      record.replace('The contract.', 'Another contract.'),
      record.replace('owners: [cixzhang]', 'owners: [someone]'),
      `${record}authority: current\n`,
    ]) {
      expect(fingerprint(edited)).not.toBe(fingerprint(record));
    }
  });
});

describe('one review gate', () => {
  const noCode = 'No code review required.';

  it('fails closed before a spec decision, and links a wait to its run', () => {
    const compose = spec =>
      composeReviewGate({codeGated: false, codeDescription: noCode, spec});
    expect(compose(readSpecGate([]))).toMatchObject({
      state: 'pending',
      description: '⏳ Checking for spec changes…',
    });
    const url = 'https://github.com/meta/astryx/actions/runs/7/attempts/1';
    expect(
      compose({known: true, satisfied: false, text: '⏳ wait', url}),
    ).toEqual({state: 'pending', description: '⏳ wait', target_url: url});
  });
});
