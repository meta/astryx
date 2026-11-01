// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global module, require */

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  classifyDesignDecisionChange,
} = require('./component-design-decisions.cjs');
const {
  parseAuthority,
  parseKind,
  parseOwnerFile,
} = require('./knowledge-frontmatter.cjs');
const crypto = require('node:crypto');
const {SPEC_MIRROR_PREFIX} = require('./review-signal-decision.cjs');
/* eslint-enable @typescript-eslint/no-require-imports */

const GATE_STATUS_CONTEXT = 'spec-owner-approval';
const TRUSTED_STATUS_CREATOR = 'github-actions[bot]';

// The workflow trigger filters comments with GitHub's `startsWith` against the
// raw body, which neither trims nor lowercases. Every parser below applies the
// same precondition, so a comment the trigger drops can never be read as a
// decision by a run started for some other event.
const OWNER_COMMAND_PREFIXES = ['/approve-spec', '/revoke-spec'];

function isDispatchableOwnerCommand(body) {
  return (
    typeof body === 'string' &&
    OWNER_COMMAND_PREFIXES.some(prefix => body.startsWith(prefix))
  );
}

function parseOwnerCommand(body, headSha) {
  if (!isDispatchableOwnerCommand(body)) return null;
  // A commit SHA is case-insensitive everywhere else in git and GitHub, so a
  // copy-pasted uppercase head still names it.
  const target = parseOwnerCommandTarget(body);
  if (!target?.sha || target.sha !== headSha.toLowerCase()) return null;
  return target.approved;
}

/**
 * Recognize that a comment was meant as an owner command, whatever it names.
 * Only a well-formed command decides the gate; this looser shape exists so a
 * near-miss command is explained in the gate's details instead of ignored.
 */
function parseOwnerCommandIntent(body) {
  if (!isDispatchableOwnerCommand(body)) return null;
  const match = body
    .trimEnd()
    .match(/^\/(approve|revoke)-spec(?![-\w])([\s\S]*)$/);
  if (!match) return null;
  return {verb: match[1], argument: match[2].trim()};
}

/**
 * Explain why a recognized owner command does not decide the gate, or return
 * null when it does. The reasons are the two silent failures owners hit: a
 * command that names no full head SHA, and one that names a superseded commit.
 */
function describeOwnerCommandProblem(intent) {
  if (!intent) return null;
  if (!intent.argument) {
    return intent.verb === 'approve'
      ? 'it did not name a commit; post /approve-spec with the full head SHA'
      : null;
  }
  if (!/^[0-9a-f]{40}$/i.test(intent.argument)) {
    return 'it did not name exactly one full 40-character commit SHA';
  }
  return null;
}

function candidateTime(candidate) {
  const value = Date.parse(candidate.at);
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

function candidatePriority(candidate) {
  if (candidate.approved === false || candidate.approved === null) return 2;
  return 1;
}

function latestDismissalAt(review, dismissalEvents) {
  const timestamps = [review.updated_at];
  for (const event of dismissalEvents) {
    if (
      event.event === 'review_dismissed' &&
      event.dismissed_review?.review_id === review.id
    ) {
      timestamps.push(event.created_at);
    }
  }
  return timestamps
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function resolveOwnerDecision({
  reviews,
  comments,
  dismissalEvents = [],
  owners,
  headSha,
  // Spec approvals bind content (DEC-14): a review or a command counts when
  // the commit it names carries the current spec content. A `/revoke-spec`
  // without a commit withdraws whatever that owner approved.
  approvesCurrentContent = sha => sha === headSha,
}) {
  const allowed = new Set(owners.map(owner => owner.toLowerCase()));
  const latestByOwner = new Map();

  function consider(login, candidate) {
    const normalizedLogin = login.toLowerCase();
    if (!allowed.has(normalizedLogin) || !candidate.at) return;
    const normalizedCandidate = {...candidate, owner: normalizedLogin};
    const previous = latestByOwner.get(normalizedLogin);
    if (
      !previous ||
      candidateTime(normalizedCandidate) > candidateTime(previous) ||
      (candidateTime(normalizedCandidate) === candidateTime(previous) &&
        candidatePriority(normalizedCandidate) > candidatePriority(previous))
    ) {
      latestByOwner.set(normalizedLogin, normalizedCandidate);
    }
  }

  for (const review of reviews) {
    const login = review.user?.login?.toLowerCase();
    // An approval counts only for the current spec content (DEC-14). A
    // request for changes on it holds the gate; one on other content, or a
    // dismissal, withdraws only that owner's approval.
    if (
      !login ||
      (review.state === 'APPROVED' && !approvesCurrentContent(review.commit_id))
    ) {
      continue;
    }
    if (
      !['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)
    ) {
      continue;
    }
    const dismissedAt =
      review.state === 'DISMISSED'
        ? latestDismissalAt(review, dismissalEvents)
        : null;
    consider(login, {
      approved:
        review.state === 'APPROVED'
          ? true
          : review.state === 'CHANGES_REQUESTED' &&
              approvesCurrentContent(review.commit_id)
            ? false
            : null,
      at:
        dismissedAt ??
        review.submitted_at ??
        review.updated_at ??
        review.created_at,
      source: review.state === 'DISMISSED' ? 'dismissal' : 'review',
    });
  }

  for (const comment of comments) {
    const login = comment.user?.login?.toLowerCase();
    if (!login) continue;
    if (!isDispatchableOwnerCommand(comment.body)) continue;
    const target = parseOwnerCommandTarget(comment.body);
    if (target == null) continue;
    if (target.approved && !approvesCurrentContent(target.sha)) continue;
    // `/revoke-spec` withdraws that owner's approval (DEC-14).
    consider(login, {
      approved: target.approved || null,
      at: comment.created_at,
      source: 'command',
    });
  }

  const decisions = [...latestByOwner.values()];
  const rejected = decisions.find(decision => decision.approved === false);
  if (rejected) return rejected;
  return (
    decisions.find(decision => decision.approved === true) ?? {
      approved: false,
      at: null,
      source: null,
      owner: null,
    }
  );
}

function canonicalRunUrl(repository, runId, runAttempt) {
  return `https://github.com/${repository}/actions/runs/${runId}/attempts/${runAttempt}`;
}

function parseCanonicalRunId(targetUrl, repository) {
  if (typeof targetUrl !== 'string') return null;
  const prefix = `https://github.com/${repository}/actions/runs/`;
  if (!targetUrl.startsWith(prefix)) return null;
  const match = targetUrl
    .slice(prefix.length)
    .match(/^([1-9][0-9]*)\/attempts\/[1-9][0-9]*$/);
  if (!match) return null;
  try {
    return BigInt(match[1]);
  } catch {
    return null;
  }
}

function isTrustedWorkflowStatus(status, repository) {
  return (
    status.creator?.login === TRUSTED_STATUS_CREATOR &&
    parseCanonicalRunId(status.target_url, repository) !== null
  );
}

function newestGateRun(statuses, repository) {
  let newest = null;
  for (const status of statuses) {
    if (
      status.context !== GATE_STATUS_CONTEXT ||
      !isTrustedWorkflowStatus(status, repository)
    ) {
      continue;
    }
    const runId = parseCanonicalRunId(status.target_url, repository);
    if (newest === null || runId > newest.runId) {
      newest = {runId, status};
    }
  }
  return newest;
}

function approvalGroupFor(content, filePath) {
  const kind = parseKind(content, filePath);
  if (kind === 'design') return 'design';
  if (kind === 'theme') return 'theme';
  return 'spec';
}

function requiredApprovalGroups(
  records,
  {complete = true, touchesDesignAssets = false} = {},
) {
  if (!complete) return {spec: true, design: true, theme: true};
  const groups = {spec: false, design: touchesDesignAssets, theme: false};
  for (const record of records) {
    const versions = [
      {content: record.baseContent, path: record.previousPath ?? record.path},
      {content: record.headContent, path: record.path},
    ];
    const currentVersions = versions.filter(
      version => parseAuthority(version.content, version.path) === 'current',
    );
    if (currentVersions.length === 0) continue;

    const touchesComponentOrModule = versions.some(version => {
      const kind = parseKind(version.content, version.path);
      return kind === 'component' || kind === 'module';
    });
    if (touchesComponentOrModule) {
      const change = classifyDesignDecisionChange({
        basePath: record.previousPath ?? record.path,
        headPath: record.path,
        baseContent: record.baseContent,
        headContent: record.headContent,
      });
      if (change.classification === 'dd-only') {
        groups.design = true;
      } else if (change.classification === 'mixed') {
        groups.spec = true;
        groups.design = true;
      } else {
        groups.spec = true;
      }
      continue;
    }

    for (const version of currentVersions) {
      groups[approvalGroupFor(version.content, version.path)] = true;
    }
  }
  return groups;
}

function requiresOwnerApproval(records, options = {}) {
  const groups = requiredApprovalGroups(records, options);
  return groups.spec || groups.design || groups.theme;
}

// --- Spec content an approval binds, and the gate's text (DEC-14). ---

// Recording an approval writes these values, so they never take part in the
// content an approval binds (DEC-14).
const BOOKKEEPING_KEYS = new Set(['authority', 'approved_by', 'approved_at']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * A Markdown record's text without the front-matter values that approval
 * bookkeeping rewrites. Everything else, body and other keys, stays.
 */
function normalizeRecordText(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return normalized;
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return normalized;
  const frontMatter = normalized
    .slice(4, end)
    .split('\n')
    .filter(line => {
      const key = line.match(/^([A-Za-z_][\w-]*)\s*:/)?.[1];
      return key == null || !BOOKKEEPING_KEYS.has(key);
    })
    .join('\n');
  return `---\n${frontMatter}${normalized.slice(end)}`;
}

/**
 * One fingerprint over every changed spec path. Each entry is
 * `{path, content}`, where `content` is the text at the head (`null` when the
 * path is absent there). Markdown is normalized; other files hash as read.
 */
function fingerprintSpecContent(entries) {
  const files = {};
  for (const {path, content} of entries) {
    files[path] =
      content == null
        ? 'absent'
        : sha256(path.endsWith('.md') ? normalizeRecordText(content) : content);
  }
  const fingerprint = sha256(
    Object.keys(files)
      .sort()
      .map(filePath => `${filePath}\0${files[filePath]}\n`)
      .join(''),
  );
  return {fingerprint, files};
}

/**
 * Read an owner command. `/approve-spec <sha>` approves the spec content at
 * that commit; the SHA says which content the owner reviewed. `/revoke-spec`
 * withdraws the owner's approval, with or without a commit.
 */
function parseOwnerCommandTarget(body) {
  if (typeof body !== 'string') return null;
  const match = body
    .trim()
    .match(/^\/(approve|revoke)-spec(?:\s+([0-9a-fA-F]{40}))?$/);
  if (!match) return null;
  if (match[1] === 'approve' && !match[2]) return null;
  return {
    approved: match[1] === 'approve',
    sha: match[2] ? match[2].toLowerCase() : null,
  };
}

function approvedDescription(owners) {
  const names = owners.map(name => `@${name}`).join(', ');
  return `✅ Spec approved by ${names || 'an owner'}`;
}

/**
 * The `spec-owner-approval` description. That context only mirrors the spec
 * half of `review-required` until branch protection stops requiring it; the
 * review gate reads the state from this text.
 */
function mirrorDescription({state, missing, approvers = []}) {
  if (state === 'success') {
    return approvers.length
      ? `${SPEC_MIRROR_PREFIX}ok (${approvers.map(name => `@${name}`).join(', ')})`
      : `${SPEC_MIRROR_PREFIX}ok`;
  }
  if (missing?.heldBy)
    return `${SPEC_MIRROR_PREFIX}waiting (changes @${missing.heldBy})`;
  return `${SPEC_MIRROR_PREFIX}waiting (${missing?.spec ? 'eng' : 'design'})`;
}

module.exports = {
  GATE_STATUS_CONTEXT,
  OWNER_COMMAND_PREFIXES,
  approvedDescription,
  canonicalRunUrl,
  describeOwnerCommandProblem,
  fingerprintSpecContent,
  isDispatchableOwnerCommand,
  mirrorDescription,
  newestGateRun,
  parseAuthority,
  parseCanonicalRunId,
  parseKind,
  parseOwnerCommand,
  parseOwnerCommandIntent,
  parseOwnerCommandTarget,
  parseOwnerFile,
  requiredApprovalGroups,
  requiresOwnerApproval,
  resolveOwnerDecision,
};
