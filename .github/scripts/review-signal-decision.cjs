// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global module */

// Trusted-base helper for review-signal.yml. Keep dependency-free CommonJS.

function isSafeSpace(filePath) {
  return (
    /^packages\/lab\//.test(filePath) ||
    /^apps\/(sandbox|storybook)\//.test(filePath)
  );
}

function classifyReviewSignalPaths(changedFiles) {
  let hasSafeBoundaryRename = false;
  const files = changedFiles.filter(file => {
    if (
      typeof file.previous_filename === 'string' &&
      isSafeSpace(file.filename) !== isSafeSpace(file.previous_filename)
    ) {
      hasSafeBoundaryRename = true;
    }
    const sides = [file.filename, file.previous_filename].filter(
      value => typeof value === 'string' && value.length > 0,
    );
    return sides.length === 0 || !sides.every(isSafeSpace);
  });
  const paths = [
    ...new Set(
      files.flatMap(file =>
        [file.filename, file.previous_filename].filter(
          value => typeof value === 'string' && value.length > 0,
        ),
      ),
    ),
  ];
  return {files, hasSafeBoundaryRename, paths};
}

// GitHub's collaborator-permission API reports `admin`, `write`, `read`, or
// `none`; maintain and custom write-based roles report `write`. Anything else,
// including a missing or malformed response, is not write access.
function hasWritePermission(permissionResponse) {
  const permission = permissionResponse?.permission;
  return permission === 'admin' || permission === 'write';
}

// The review app is configured by its exact GitHub login (for example
// `name[bot]`). An unset or malformed value disables the review-app path.
function normalizeReviewApp(value) {
  const login = String(value ?? '')
    .trim()
    .toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\[bot\]$/.test(login) ? login : '';
}

function resolveReviewApprovals({
  reviews,
  headSha,
  engOwners,
  designOwners,
  reviewApp = '',
  authorHasWrite = false,
}) {
  const app = normalizeReviewApp(reviewApp);
  const latestByUser = new Map();
  let appState = null;
  for (const review of reviews) {
    const login = review.user?.login?.toLowerCase();
    if (
      !login ||
      review.commit_id !== headSha ||
      review.state === 'COMMENTED' ||
      !['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)
    ) {
      continue;
    }
    if (app && login === app) {
      // Only the app itself can author a review under its `[bot]` login, but
      // also require GitHub's Bot account type so a lookalike never counts.
      if (review.user?.type === 'Bot') appState = review.state;
      continue;
    }
    latestByUser.set(login, review.state);
  }

  let ownerApproved = false;
  let designApproved = false;
  let ownerWithdrawn = false;
  for (const [login, state] of latestByUser) {
    if (state === 'APPROVED') {
      if (engOwners.includes(login)) ownerApproved = true;
      if (designOwners.includes(login)) designApproved = true;
      continue;
    }
    if (
      (state === 'CHANGES_REQUESTED' || state === 'DISMISSED') &&
      engOwners.includes(login)
    ) {
      ownerWithdrawn = true;
    }
  }

  // The review app decides the engineering gate only for a write-access
  // author, only by its latest exact-head verdict, and never over an
  // engineering owner's exact-head request for changes.
  const appCounts = Boolean(app) && authorHasWrite === true;
  const appApproved = appCounts && appState === 'APPROVED' && !ownerWithdrawn;
  const appWithdrawn =
    appCounts && (appState === 'CHANGES_REQUESTED' || appState === 'DISMISSED');
  const codeApproved = ownerApproved || appApproved;
  let codeApprovedBy = null;
  if (ownerApproved) codeApprovedBy = 'owner';
  else if (appApproved) codeApprovedBy = 'review-app';
  return {
    codeApproved,
    codeApprovedBy,
    codeWithdrawn: !codeApproved && (ownerWithdrawn || appWithdrawn),
    designApproved,
  };
}

// One review gate (architecture:knowledge-contracts DEC-14, spec:AST-030
// FR15): every writer of `review-required` composes code review and the spec
// half that `spec-owner-approval` mirrors.

const REVIEW_GATE_CONTEXT = 'review-required';
const SPEC_GATE_CONTEXT = 'spec-owner-approval';
const TRUSTED_STATUS_CREATOR = 'github-actions[bot]';
const SPEC_WAITING_PREFIX = '⏳ Waiting for human spec approval: ';
const SPEC_WAITING_TEXT = {
  eng: `${SPEC_WAITING_PREFIX}an eng owner can reply /approve-spec <sha>`,
  design: `${SPEC_WAITING_PREFIX}a design or eng owner can reply /approve-spec <sha>`,
  // An owner's request for changes on the current content holds the gate.
  held: login =>
    `${SPEC_WAITING_PREFIX}@${login} requested changes and can reply /approve-spec <sha>`,
};
const SPEC_MIRROR_PREFIX = 'Mirrors review-required · spec ';
const SPEC_CHECKING_TEXT = '⏳ Checking for spec changes…';
const CODE_WAITING_PREFIX = 'Waiting on code review';
const REVIEW_COMPLETE = 'Review complete.';

// GitHub lists a ref's statuses newest first.
function newestTrusted(statuses, contextName) {
  return (
    (statuses ?? []).find(
      status =>
        status.context === contextName &&
        status.creator?.login === TRUSTED_STATUS_CREATOR,
    ) ?? null
  );
}

/**
 * The spec half, from the newest trusted `spec-owner-approval`. With none yet
 * (or a failed read) it fails closed; the spec-owner job composes on publish.
 */
function readSpecGate(statuses) {
  const status = newestTrusted(statuses, SPEC_GATE_CONTEXT);
  if (!status)
    return {known: false, satisfied: false, text: SPEC_CHECKING_TEXT};
  return {...readSpecStatus(status), url: status.target_url};
}

function readSpecStatus(status) {
  const description = status.description ?? '';
  if (description.startsWith(SPEC_MIRROR_PREFIX)) {
    const rest = description.slice(SPEC_MIRROR_PREFIX.length);
    const holder = rest.match(/^waiting \(changes @([\w-]+)\)/)?.[1];
    if (holder) {
      return {
        known: true,
        satisfied: false,
        text: SPEC_WAITING_TEXT.held(holder),
      };
    }
    if (rest.startsWith('waiting (design)')) {
      return {known: true, satisfied: false, text: SPEC_WAITING_TEXT.design};
    }
    if (rest.startsWith('waiting')) {
      return {known: true, satisfied: false, text: SPEC_WAITING_TEXT.eng};
    }
    const approvers = rest.match(/^ok \((.+)\)$/)?.[1];
    if (approvers && status.state === 'success') {
      return {
        known: true,
        satisfied: true,
        text: `✅ Spec approved by ${approvers}`,
      };
    }
  }
  // An earlier gate's status: success counts; anything else is re-read.
  return status.state === 'success'
    ? {known: true, satisfied: true, text: null}
    : {known: true, satisfied: false, text: SPEC_CHECKING_TEXT};
}

function parseCodeGate(status) {
  const description = status.description ?? '';
  if (status.state === 'success') {
    // Drop a spec approval this gate already carries.
    const code = description.replace(/^✅ Spec approved by [^·]+ · /, '');
    return {gated: false, description: code};
  }
  if (description.startsWith(CODE_WAITING_PREFIX)) {
    return {
      gated: true,
      description: description.replace(/ \(\+ spec approval\)$/, ''),
    };
  }
  return {gated: false, description: REVIEW_COMPLETE};
}

/**
 * The code half of `review-required`, from the newest status carrying one
 * (spec waits and the `Review complete.` placeholder carry none). A newer spec
 * wait means satisfied code review; `{latest: false}` skips that, for
 * review-clear's ownership check.
 */
function readCodeGate(statuses, {latest = true} = {}) {
  const gates = (statuses ?? []).filter(
    gate =>
      gate.context === REVIEW_GATE_CONTEXT &&
      gate.creator?.login === TRUSTED_STATUS_CREATOR,
  );
  if (gates.length === 0) return null;
  const coded = gates.find(gate => {
    const description = gate.description ?? '';
    return !(
      description.startsWith(SPEC_WAITING_PREFIX) ||
      description === SPEC_CHECKING_TEXT ||
      parseCodeGate(gate).description === REVIEW_COMPLETE
    );
  });
  const code = coded ? parseCodeGate(coded) : null;
  if (!latest || coded === gates[0]) {
    return code ?? {gated: false, description: REVIEW_COMPLETE};
  }
  return {
    gated: false,
    description: code && !code.gated ? code.description : REVIEW_COMPLETE,
  };
}

/** The one review gate: code review leads; success needs both; never red. */
function composeReviewGate({codeGated, codeDescription, spec}) {
  if (codeGated) {
    const withSpec =
      spec && !spec.satisfied
        ? `${codeDescription} (+ spec approval)`
        : codeDescription;
    return {
      state: 'pending',
      description: (withSpec.length <= 140 ? withSpec : codeDescription).slice(
        0,
        140,
      ),
    };
  }
  if (spec && !spec.satisfied) {
    // The spec decision's run is where the command to copy lives.
    return {state: 'pending', description: spec.text, target_url: spec.url};
  }
  const done = codeDescription || REVIEW_COMPLETE;
  const withSpec = spec?.text ? `${spec.text} · ${done}` : done;
  return {
    state: 'success',
    description: withSpec.length <= 140 ? withSpec : (spec?.text ?? done),
  };
}

module.exports = {
  REVIEW_GATE_CONTEXT,
  SPEC_GATE_CONTEXT,
  SPEC_MIRROR_PREFIX,
  SPEC_WAITING_TEXT,
  classifyReviewSignalPaths,
  composeReviewGate,
  readCodeGate,
  readSpecGate,
  hasWritePermission,
  isSafeSpace,
  normalizeReviewApp,
  resolveReviewApprovals,
};
