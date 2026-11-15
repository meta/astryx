// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file manifest.mjs
 * @description Declares each lab graduation candidate and the readiness checks
 *   that cannot be proven from the repo — the ones that live in an RFC, a code
 *   review, or a person's judgement. Everything derivable from the source tree
 *   is computed in `automated.mjs` and overrides whatever is claimed here.
 * @input none — static data, hand-maintained alongside the RFC and PRs
 * @output CANDIDATES
 * @position Read by `audit.mjs`. This file is the honest boundary of the
 *   tooling: a claim here is a citation, not a proof.
 *
 * Declaring a check `passed` requires an `evidence` link a reviewer can open.
 * `audit.mjs` demotes any evidence-free `passed` claim to `in_progress`, so an
 * optimistic manifest cannot inflate the score.
 *
 * SYNC: When a tracking issue closes or a PR merges, update the state and the
 * evidence link here in the same change.
 */

/** @typedef {{label: string, url: string}} Evidence */

const issue = n => ({
  label: `Issue #${n}`,
  url: `https://github.com/meta/astryx/issues/${n}`,
});
const pr = n => ({
  label: `PR #${n}`,
  url: `https://github.com/meta/astryx/pull/${n}`,
});
const issueComment = (n, id, label) => ({
  label,
  url: `https://github.com/meta/astryx/issues/${n}#issuecomment-${id}`,
});

/**
 * The lab components currently queued for promotion into core.
 *
 * `stateProps` lists the states the public API advertises. The automated audit
 * requires each one to appear in both a story (so a reviewer can see it) and a
 * test (so it cannot silently regress).
 */
export const CANDIDATES = [
  {
    id: 'list-input',
    displayName: 'List Input',
    sourceDir: 'ListInput',
    targetPackage: '@astryxdesign/core',
    trackingIssue: 4531,
    voteIssue: 4531,
    storyTitle: 'Lab/ListInput',
    storybookStoryId: 'lab-listinput--tag-options',
    publicExports: ['ListInput'],
    stateProps: ['isDisabled', 'isLoading', 'status'],
    summary: 'Compact editor for short collections of simple records.',
    declared: {
      triage: {
        state: 'passed',
        note: 'RFC #4531 was accepted and closed with a named owner.',
        evidence: [issue(4531)],
      },
      internalResearch: {
        state: 'passed',
        note: 'The accepted RFC audits existing Astryx and internal patterns.',
        evidence: [issue(4531)],
      },
      externalResearch: {
        state: 'passed',
        note: 'The accepted RFC compares external design-system precedents.',
        evidence: [issue(4531)],
      },
      useCases: {
        state: 'passed',
        note: 'Primary use cases, non-goals, and constraints are in the RFC and the component doc.',
        evidence: [issue(4531)],
      },
      draftSpec: {
        state: 'passed',
        note: 'RFC #4531 describes the component contract and intended behavior.',
        evidence: [issue(4531)],
      },
      surfaceAudit: {
        state: 'passed',
        note: 'Composition, variants, states, and theme targets are enumerated in the RFC and the component doc.',
        evidence: [issue(4531)],
      },
      specReview: {
        state: 'passed',
        note: 'Design and engineering feedback was resolved before the RFC closed.',
        evidence: [issue(4531)],
      },
      apiArbitration: {
        state: 'passed',
        note: 'Three API models were evaluated across six scenarios in the RFC.',
        evidence: [issue(4531)],
      },
      finalizedSpec: {
        state: 'passed',
        note: 'The closed RFC is the accepted build baseline.',
        evidence: [issue(4531)],
      },
      reviewAndCI: {
        state: 'passed',
        note: 'PR #4740 merged with required checks green.',
        evidence: [pr(4740)],
      },
      mergedPR: {
        state: 'passed',
        note: 'Merged into main on 2026-08-07.',
        evidence: [pr(4740)],
      },
      visualQuality: {state: 'not_started'},
      compositionQuality: {state: 'not_started'},
      scopeBoundary: {state: 'not_started'},
      archivedReview: {state: 'not_started'},
    },
  },

  {
    id: 'transfer-list',
    displayName: 'Transfer List',
    sourceDir: 'TransferList',
    targetPackage: '@astryxdesign/core',
    trackingIssue: 3281,
    voteIssue: 3281,
    storyTitle: 'Lab/TransferList',
    storybookStoryId: 'lab-transferlist--basic',
    publicExports: ['TransferList', 'TransferListSelector', 'transferListVars'],
    stateProps: ['isReorderable', 'hasSearch', 'hasSelectAll', 'hasClear'],
    summary: 'Controlled dual-panel input for moving options between lists.',
    declared: {
      triage: {
        state: 'passed',
        note: 'RFC #3281 confirms the problem and scope.',
        evidence: [issue(3281)],
      },
      internalResearch: {
        state: 'passed',
        note: 'The RFC audits existing Astryx collection patterns.',
        evidence: [issue(3281)],
      },
      externalResearch: {
        state: 'passed',
        note: 'The RFC compares external transfer-list precedents.',
        evidence: [issue(3281)],
      },
      useCases: {
        state: 'passed',
        note: 'Use cases and non-goals are documented in the RFC.',
        evidence: [issue(3281)],
      },
      draftSpec: {
        state: 'passed',
        note: 'RFC #3281 describes the intended contract.',
        evidence: [issue(3281)],
      },
      surfaceAudit: {
        state: 'in_progress',
        note: 'Design review closed the naming and composition questions: the listbox semantics are withdrawn and the unbuilt Listbox primitive is split into its own RFC. TransferListSelector shipped after the audit was written and its prop surface is still not covered.',
        evidence: [
          issue(3281),
          pr(4773),
          issueComment(
            3281,
            5403206870,
            'Design review: ARIA semantics resolved',
          ),
        ],
      },
      specReview: {
        state: 'passed',
        note: 'Design review resolved the blocking RFC feedback, ruling that role=group plus semantic lists is correct because role=option forbids the interactive row descendants this component ships.',
        evidence: [
          issueComment(
            3281,
            5403206870,
            'Design review: ARIA semantics resolved',
          ),
        ],
      },
      apiArbitration: {
        state: 'passed',
        note: 'The RFC weighs competing selection APIs before choosing.',
        evidence: [issue(3281)],
      },
      finalizedSpec: {
        state: 'passed',
        note: 'The listbox-versus-lists contradiction is settled: the RFC accessibility section is amended to the shipped semantics. RFC #3281 stays open only for the Listbox primitive, which is out of scope for this component.',
        evidence: [
          issueComment(
            3281,
            5403206870,
            'Design review: ARIA semantics resolved',
          ),
        ],
      },
      reviewAndCI: {
        state: 'in_progress',
        note: 'Neither PR #4773 nor the carrier PR #4769 carries an approving review.',
        evidence: [pr(4773), pr(4769)],
      },
      mergedPR: {
        state: 'passed',
        note: 'Carrier PR #4769 merged into main on 2026-08-16.',
        evidence: [pr(4769)],
      },
      visualQuality: {state: 'not_started'},
      compositionQuality: {state: 'not_started'},
      scopeBoundary: {state: 'not_started'},
      archivedReview: {state: 'not_started'},
    },
  },
];
