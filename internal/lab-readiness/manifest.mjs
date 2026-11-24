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
];
