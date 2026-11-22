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

/**
 * When a head was pushed: the later of its commit's committer date and the
 * creation of its first check suite, as GitHub reports them; null when either
 * cannot be read. GitHub re-binds older reviews to a new head (their
 * `commit_id` names the new head), so only a review submitted at or after
 * this time reviewed the head.
 * @param {{github: any, owner: string, repo: string, sha: string}} input
 * @returns {Promise<string | null>}
 */
async function readHeadPushedAt({github, owner, repo, sha}) {
  try {
    const {data: commit} = await github.rest.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });
    const committed = commit?.commit?.committer?.date;
    if (!committed || !Number.isFinite(Date.parse(committed))) return null;
    const {data: suites} = await github.rest.checks.listSuitesForRef({
      owner,
      repo,
      ref: sha,
      per_page: 100,
    });
    const created = (suites?.check_suites ?? [])
      .map(suite => suite.created_at)
      .filter(at => Number.isFinite(Date.parse(at ?? '')))
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
    return created && Date.parse(created) > Date.parse(committed)
      ? created
      : committed;
  } catch {
    return null;
  }
}

/**
 * The code and design review state of a head from its reviews. A review
 * counts only when it names the head and was submitted at or after
 * `headPushedAt` (readHeadPushedAt); without a push time no review counts.
 */
function resolveReviewApprovals({
  reviews,
  headSha,
  headPushedAt,
  engOwners,
  designOwners,
  reviewApp = '',
  authorHasWrite = false,
}) {
  const app = normalizeReviewApp(reviewApp);
  const pushedAt = Date.parse(headPushedAt ?? '');
  const latestByUser = new Map();
  let appState = null;
  for (const review of reviews) {
    const login = review.user?.login?.toLowerCase();
    if (
      !login ||
      review.commit_id !== headSha ||
      // A review submitted before the head was pushed is a re-bound review
      // of an older head.
      !Number.isFinite(pushedAt) ||
      !(Date.parse(review.submitted_at ?? '') >= pushedAt) ||
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

// A stack is pull requests into main that each contain the one below. Each
// description carries the same whole line, bottom first: `Stack: #a → #b`.
const STACK_LINE = /^Stack: #\d+(?:[ \t]*(?:→|->)[ \t]*#\d+)+[ \t]*$/;

/** Every whole `Stack:` line in a description, each as its numbers. */
function stackLinesOf(body) {
  return String(body ?? '')
    .split(/\r?\n/)
    .filter(line => STACK_LINE.test(line))
    .map(line => (line.match(/#\d+/g) ?? []).map(ref => Number(ref.slice(1))));
}

/**
 * The stacks whose `Stack:` line in a member's description lists the member
 * below the top: each top's number and the line.
 * @param {{number: number, body?: string | null}} member
 */
function stackTopsOf({number, body}) {
  return stackLinesOf(body)
    .filter(line => {
      const at = line.indexOf(number);
      return (
        at >= 0 && at < line.length - 1 && new Set(line).size === line.length
      );
    })
    .map(line => ({top: line[line.length - 1], line}));
}

/** Whether a review body has the bullet `**#<member>**: approved`. */
function namesMemberApproved(body, member) {
  const lead = `**#${member}**: approved`;
  return String(body ?? '')
    .split(/\r?\n/)
    .some(
      line =>
        line.startsWith(lead) &&
        !/^[A-Za-z]/.test(line.slice(lead.length)) &&
        !/\bnot\b|changes/i.test(line),
    );
}

/**
 * Whether the stack top's review approves a stack member for the heavy turn
 * only (spec:AST-030 FR20). The review app reviews a stack at its top. Its
 * latest verdict at the top's exact current head, submitted after that head
 * was pushed, must approve, after the member's latest push too, with the
 * bullet `**#<member>**: approved`. The member's head must be in the top's
 * head, and both descriptions must carry the same `Stack:` line. So the
 * review read the member's current head. A missing push time counts nothing.
 * @param {{
 *   member: number,
 *   memberHeadPushedAt: string | null,
 *   line: number[],
 *   top: {body?: string | null, head: {sha: string}},
 *   topHeadPushedAt: string | null,
 *   topReviews: any[],
 *   reviewApp: string,
 *   memberInTopHead: boolean,
 * }} input
 */
function stackTopApproves({
  member,
  memberHeadPushedAt,
  line,
  top,
  topHeadPushedAt,
  topReviews,
  reviewApp,
  memberInTopHead,
}) {
  const app = normalizeReviewApp(reviewApp);
  const memberPushed = Date.parse(memberHeadPushedAt ?? '');
  const topPushed = Date.parse(topHeadPushedAt ?? '');
  if (
    !app ||
    memberInTopHead !== true ||
    !Number.isFinite(memberPushed) ||
    !Number.isFinite(topPushed)
  )
    return false;
  const key = line.join(' ');
  if (!stackLinesOf(top.body).some(each => each.join(' ') === key))
    return false;
  let latest = null;
  for (const review of topReviews) {
    const at = Date.parse(review.submitted_at ?? '');
    if (
      review.user?.login?.toLowerCase() !== app ||
      review.user?.type !== 'Bot' ||
      review.commit_id !== top.head.sha ||
      !['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state) ||
      // A review submitted before the top's head was pushed is re-bound.
      !(at >= topPushed)
    )
      continue;
    if (latest == null || at >= Date.parse(latest.submitted_at))
      latest = review;
  }
  return (
    latest?.state === 'APPROVED' &&
    Date.parse(latest.submitted_at) >= memberPushed &&
    namesMemberApproved(latest.body, member)
  );
}

// A pull request the review app opens is the app's own work, which it cannot
// approve: its code review is a trainer pass, an engineering owner's approval
// of its exact head. Other bots stay exempt.
// The success text an engineering owner's exact-head approval leaves. It is
// review-clear's own, so review-clear re-gates it when that approval is
// withdrawn or dismissed.
const OWNER_CLEARED_TEXT = 'Cleared by code-owner approval.';
const TRAINER_WAITING_TEXT =
  "Waiting on code review: a trainer pass, an engineering owner's approval of this exact head.";

/** Whether a pull request's author is the review app named in `REVIEW_APP`. */
function needsTrainerPass({author, reviewApp}) {
  const app = normalizeReviewApp(reviewApp);
  return app !== '' && String(author ?? '').toLowerCase() === app;
}

/** Whether an engineering owner's latest exact-head review approves. */
function trainerPassed({reviews, headSha, headPushedAt, engOwners}) {
  return resolveReviewApprovals({
    reviews,
    headSha,
    headPushedAt,
    engOwners,
    designOwners: [],
  }).codeApproved;
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
const SPEC_RECONCILING_PREFIX = 'Reconciling exact head ';
const SPEC_CHECKING_TEXT = '⏳ Checking for spec changes…';
// An owner approval on this head that a running reconcile checks again.
const SPEC_CARRIED_TEXT = '⏳ Spec approval carried (verifying)';
// What a code wait adds for a spec half that is not satisfied.
const SPEC_SUFFIX = {
  waiting: ' (+ spec approval)',
  checking: ' (+ spec check)',
  carried: ' · spec approval carried (verifying)',
};
// A run over the spec-owner job's request budget decides nothing; a
// maintainer's dispatch decides (spec:AST-030 FR15).
const SPEC_TOO_LARGE_TEXT =
  '⏳ Too large to reconcile automatically: a maintainer can run the Review signal workflow for this PR';
const CODE_WAITING_PREFIX = 'Waiting on code review';
const REVIEW_COMPLETE = 'Review complete.';

// GitHub lists a ref's statuses newest first.
function trustedStatuses(statuses, contextName) {
  return (statuses ?? []).filter(
    status =>
      status.context === contextName &&
      status.creator?.login === TRUSTED_STATUS_CREATOR,
  );
}

function isOwnerApproval(status) {
  const description = status.description ?? '';
  return (
    status.state === 'success' &&
    description.startsWith(SPEC_MIRROR_PREFIX) &&
    /^ok \(.+\)$/.test(description.slice(SPEC_MIRROR_PREFIX.length))
  );
}

/**
 * The spec half, from the newest trusted `spec-owner-approval`. With none yet
 * (or a failed read) it fails closed; the spec-owner job composes on publish.
 * While a run decides a head again, an owner approval of that head shows as
 * carried, but the half stays unsatisfied until the run decides.
 */
function readSpecGate(statuses) {
  const specStatuses = trustedStatuses(statuses, SPEC_GATE_CONTEXT);
  const status = specStatuses[0];
  if (!status)
    return {known: false, satisfied: false, text: SPEC_CHECKING_TEXT};
  if ((status.description ?? '').startsWith(SPEC_RECONCILING_PREFIX)) {
    const decided = specStatuses.find(earlier =>
      (earlier.description ?? '').startsWith(SPEC_MIRROR_PREFIX),
    );
    if (decided && isOwnerApproval(decided)) {
      return {
        known: true,
        satisfied: false,
        carried: true,
        text: SPEC_CARRIED_TEXT,
        url: status.target_url,
      };
    }
    // No decision yet, or one that needed no owner approval: ask nothing.
    if (!decided || decided.state === 'success') {
      return {
        known: false,
        satisfied: false,
        text: SPEC_CHECKING_TEXT,
        url: status.target_url,
      };
    }
  }
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
    if (rest.startsWith('too large')) {
      return {known: true, satisfied: false, text: SPEC_TOO_LARGE_TEXT};
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
    const suffix = Object.values(SPEC_SUFFIX).find(text =>
      description.endsWith(text),
    );
    return {
      gated: true,
      description: suffix ? description.slice(0, -suffix.length) : description,
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
    let suffix = '';
    // A spec half not decided yet asks nothing of the owners.
    if (spec && !spec.satisfied) {
      if (spec.carried) suffix = SPEC_SUFFIX.carried;
      else if (spec.known === false) suffix = SPEC_SUFFIX.checking;
      else suffix = SPEC_SUFFIX.waiting;
    }
    const withSpec = `${codeDescription}${suffix}`;
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
  SPEC_RECONCILING_PREFIX,
  SPEC_TOO_LARGE_TEXT,
  SPEC_WAITING_TEXT,
  OWNER_CLEARED_TEXT,
  TRAINER_WAITING_TEXT,
  classifyReviewSignalPaths,
  composeReviewGate,
  readCodeGate,
  readSpecGate,
  hasWritePermission,
  isSafeSpace,
  needsTrainerPass,
  normalizeReviewApp,
  readHeadPushedAt,
  resolveReviewApprovals,
  stackLinesOf,
  stackTopApproves,
  stackTopsOf,
  trainerPassed,
};
