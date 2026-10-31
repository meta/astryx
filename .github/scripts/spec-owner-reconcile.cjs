// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global Buffer, module, process, require */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const {classifyChanges} = require('./change-scope.cjs');
const {
  GATE_STATUS_CONTEXT,
  approvedDescription,
  fingerprintSpecContent,
  mirrorDescription,
  parseOwnerCommandTarget,
  canonicalRunUrl,
  describeOwnerCommandProblem,
  newestGateRun,
  parseOwnerCommandIntent,
  parseAuthority,
  parseKind,
  parseOwnerFile,
  requiredApprovalGroups,
  resolveOwnerDecision,
} = require('./spec-owner-decision.cjs');
const {
  REVIEW_GATE_CONTEXT,
  SPEC_WAITING_TEXT,
  composeReviewGate,
  readCodeGate,
  readSpecGate,
} = require('./review-signal-decision.cjs');
/* eslint-enable @typescript-eslint/no-require-imports */

function isCommandComment(eventName, payload) {
  if (eventName !== 'issue_comment') return true;
  return parseOwnerCommandIntent(payload.comment?.body) !== null;
}

function isAuthorizedEvent(eventName, payload, owners) {
  if (eventName === 'issue_comment') {
    const login = payload.comment?.user?.login?.toLowerCase();
    return Boolean(
      login && owners.has(login) && isCommandComment(eventName, payload),
    );
  }
  if (eventName === 'pull_request_review') {
    const login = payload.review?.user?.login?.toLowerCase();
    return Boolean(login && owners.has(login));
  }
  return true;
}

function labelNames(pr) {
  return new Set(pr.labels.map(label => label.name));
}

function isSpecPath(filePath) {
  const scope = classifyChanges([{filename: filePath}]);
  return scope.touchesKnowledgeRecords || scope.touchesDesignAssets;
}

function isSettled(pr) {
  return Boolean(pr.merged_at) || pr.state === 'closed';
}

async function reconcileSpecOwnerGate({
  github,
  context,
  core,
  workspace = process.env.GITHUB_WORKSPACE,
  env = process.env,
  now = () => new Date(),
}) {
  const {owner, repo} = context.repo;
  const repository = `${owner}/${repo}`;
  if (
    context.eventName === 'pull_request_review' &&
    context.payload.pull_request?.head?.repo?.full_name !== repository
  ) {
    core.info(
      'Skipping fork pull request review; use an exact-head owner command to reconcile.',
    );
    return;
  }

  const designOwners = parseOwnerFile(
    fs.readFileSync(path.join(workspace, '.github/DESIGNOWNERS'), 'utf8'),
  );
  const engineeringOwners = parseOwnerFile(
    fs.readFileSync(path.join(workspace, '.github/ENGOWNERS'), 'utf8'),
  );
  const allOwners = new Set([...engineeringOwners, ...designOwners]);
  if (!isAuthorizedEvent(context.eventName, context.payload, allOwners)) {
    core.info('Ignoring an event from someone outside the eligible owners.');
    return;
  }

  const pullNumber = Number(
    context.payload.pull_request?.number ??
      context.payload.issue?.number ??
      context.payload.inputs?.pr,
  );
  if (!pullNumber) {
    throw new Error('Could not resolve a pull request number.');
  }

  const runId = BigInt(String(context.runId));
  const runUrl = canonicalRunUrl(
    repository,
    String(context.runId),
    String(context.runAttempt),
  );

  async function getPullRequest() {
    const {data} = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return data;
  }

  async function listStatuses(headSha) {
    return github.paginate(github.rest.repos.listCommitStatusesForRef, {
      owner,
      repo,
      ref: headSha,
      per_page: 100,
    });
  }

  async function createStatus({
    sha,
    context: statusContext,
    state,
    description,
    targetUrl = runUrl,
  }) {
    const {data} = await github.rest.repos.createCommitStatus({
      owner,
      repo,
      sha,
      context: statusContext,
      state,
      description: description.slice(0, 140),
      target_url: targetUrl,
    });
    return data;
  }

  async function newestRun(headSha) {
    return newestGateRun(await listStatuses(headSha), repository);
  }

  /**
   * The freshest possible answer to "may this head still be written at all".
   * A settled or moved head is never writable, whichever run is current: an
   * approval that lands after the merge it claims to gate is not evidence.
   * Any read that throws propagates and nothing is published.
   */
  async function isLiveHeadWritable(headSha) {
    const live = await getPullRequest();
    if (isSettled(live)) {
      core.info(
        'The pull request settled while this run reconciled; leaving the head status as it merged.',
      );
      return false;
    }
    if (live.head.sha !== headSha) {
      core.info(
        'The head moved while this run reconciled; leaving the status to the run for the new head.',
      );
      return false;
    }
    return true;
  }

  /**
   * The last read before a terminal write. GitHub has no conditional status
   * write, so the window cannot be closed — it can only be made as small as
   * one API call and made to fail closed. Read the run currency first and the
   * live pull request last, so the head/settlement facts are the freshest
   * thing known at the moment of the write.
   */
  async function isPublishable(headSha) {
    if (!(await isCurrentRun(headSha))) return false;
    return isLiveHeadWritable(headSha);
  }

  async function restoreNewerStatus(headSha) {
    const newest = await newestRun(headSha);
    if (newest === null || newest.runId <= runId) return false;
    // Yielding is still a write. A newer run's status is no more publishable
    // on a merged or moved head than this run's own would be, so the restore
    // takes the same live guard — and still reports the yield, because this
    // run's claim on the head is over either way.
    if (await isLiveHeadWritable(headSha)) {
      await createStatus({
        sha: headSha,
        context: GATE_STATUS_CONTEXT,
        state: newest.status.state,
        description: newest.status.description,
        targetUrl: newest.status.target_url,
      });
      await publishReviewGate(headSha, readSpecGate([newest.status]));
    }
    core.info(
      `Run ${context.runId} yielded to newer run ${newest.runId.toString()}.`,
    );
    return true;
  }

  async function isCurrentRun(headSha) {
    const newest = await newestRun(headSha);
    return newest === null || newest.runId <= runId;
  }

  // The owners whose approval decided the gate, once the decision is known.
  let approvedBy = [];
  /** Publish the mirror, then the review gate composed with code review. */
  async function setFinalStatus(headSha, state, text, missing = null) {
    const approvers = state === 'success' ? approvedBy : [];
    if (!(await isPublishable(headSha))) return false;
    await createStatus({
      sha: headSha,
      context: GATE_STATUS_CONTEXT,
      state,
      description: mirrorDescription({state, missing, approvers}),
    });
    if (await restoreNewerStatus(headSha)) return false;
    await publishReviewGate(headSha, {
      satisfied: state === 'success',
      text: state === 'success' && approvers.length === 0 ? null : text,
    });
    // The write cannot be undone, so verify what it landed on. A success that
    // raced a merge is reported loudly.
    const after = await getPullRequest();
    if (isSettled(after) || after.head.sha !== headSha) {
      core.warning(
        `Published ${state} for ${headSha.slice(0, 7)} as the pull request settled or moved; treat that status as unverified.`,
      );
      return false;
    }
    return !(await restoreNewerStatus(headSha));
  }

  async function removeLabel(name) {
    try {
      await github.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: pullNumber,
        name,
      });
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }

  async function ensureLabel(pr, name, color, description) {
    try {
      await github.rest.issues.getLabel({owner, repo, name});
    } catch (error) {
      if (error.status !== 404) throw error;
      try {
        await github.rest.issues.createLabel({
          owner,
          repo,
          name,
          color,
          description,
        });
      } catch (createError) {
        if (createError.status !== 422) throw createError;
      }
    }
    if (!labelNames(pr).has(name)) {
      await github.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pullNumber,
        labels: [name],
      });
    }
  }

  async function readText(fullName, ref, filePath) {
    const [repoOwner, repoName] = fullName.split('/');
    try {
      const {data} = await github.rest.repos.getContent({
        owner: repoOwner,
        repo: repoName,
        path: filePath,
        ref,
      });
      if (Array.isArray(data) || !data.content) {
        throw new Error(
          `Knowledge record ${filePath} could not be read as text.`,
        );
      }
      return Buffer.from(data.content, 'base64').toString('utf8');
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  /** A spec path's text at `ref`, or null when the path is absent there. */
  async function readSpecContent(fullName, ref, filePath) {
    const [repoOwner, repoName] = fullName.split('/');
    try {
      const {data} = await github.rest.repos.getContent({
        owner: repoOwner,
        repo: repoName,
        path: filePath,
        ref,
      });
      if (Array.isArray(data)) return null;
      if (data.content == null) return `blob:${data.sha}`;
      // Only Markdown is read as text; other assets hash as their bytes.
      return filePath.endsWith('.md')
        ? Buffer.from(data.content, 'base64').toString('utf8')
        : `base64:${data.content.replace(/\s/g, '')}`;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  /** Details notes: the newest approval of other content; a revocation. */
  function ownerActNotes({
    reviews: ownerReviews,
    comments: allComments,
    owners: eligible,
    approvesCurrentContent,
  }) {
    const stale = ownerReviews
      .filter(
        review =>
          review.state === 'APPROVED' &&
          !approvesCurrentContent(review.commit_id),
      )
      .map(review => review.submitted_at);
    // Comments arrive oldest first, so the last act per owner wins.
    const lastAct = new Map();
    for (const comment of allComments) {
      const login = comment.user?.login?.toLowerCase() ?? '';
      const target =
        eligible.has(login) && parseOwnerCommandTarget(comment.body);
      if (!target) continue;
      if (target.approved && !approvesCurrentContent(target.sha)) {
        stale.push(comment.created_at);
      }
      lastAct.set(login, {owner: login, ...target, at: comment.created_at});
    }
    const revokedBy =
      [...lastAct.values()]
        .filter(act => !act.approved)
        .sort((x, y) => Date.parse(y.at) - Date.parse(x.at))[0] ?? null;
    return {
      staleApprovalAt: stale.filter(Boolean).sort().at(-1) ?? null,
      revokedBy,
    };
  }

  /** The gate's details: the run summary its statuses link to. */
  async function writeDetails({
    statusText,
    headSha,
    approvalRequired,
    approved: isApproved,
    records: changedRecords,
    currentContent,
    notes,
    commandProblem,
  }) {
    if (typeof core.summary?.addRaw !== 'function') return;
    const groupFor = record => {
      const current =
        parseAuthority(record.headContent, record.path) === 'current' ||
        parseAuthority(record.baseContent, record.previousPath) === 'current';
      if (!current) return 'none (draft)';
      const kind = parseKind(
        record.headContent ?? record.baseContent,
        record.path,
      );
      return kind === 'design' || kind === 'theme'
        ? 'design or eng owner'
        : 'eng owner';
    };
    const rows = changedRecords.map(record => {
      const text = record.headContent ?? record.baseContent ?? '';
      const id = text.match(/^id:\s*(.+)$/m)?.[1]?.trim() ?? record.path;
      const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
      const before =
        record.baseContent == null
          ? 'new'
          : (parseAuthority(record.baseContent, record.previousPath) ?? '?');
      const after =
        record.headContent == null
          ? 'removed'
          : (parseAuthority(record.headContent, record.path) ?? '?');
      const change = before === after ? after : `${before} → ${after}`;
      return `| \`${id}\` | ${title} | ${change} | ${groupFor(record)} |`;
    });
    // `<sha>` in the status text is literal, not markup.
    const lines = [`### ${statusText.replace(/</g, '&lt;')}`, ''];
    if (!isApproved && notes.revokedBy) {
      lines.push(
        `Approval revoked by @${notes.revokedBy.owner} at ${notes.revokedBy.at}.`,
        '',
      );
    } else if (!isApproved && notes.staleApprovalAt) {
      lines.push(
        `Spec changed after approval at ${notes.staleApprovalAt}; approve the current head again.`,
        '',
      );
    }
    if (commandProblem) {
      lines.push(`Your owner command decided nothing: ${commandProblem}.`, '');
    }
    if (approvalRequired && !isApproved) {
      lines.push(
        'Approve the current spec text with a comment on the pull request:',
        '',
        '```',
        `/approve-spec ${headSha}`,
        '```',
        '',
      );
    }
    lines.push(
      '| Record | Title | Authority | Needs approval from |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
      '<details><summary>Changed spec paths and content fingerprint</summary>',
      '',
      ...Object.keys(currentContent.files).map(filePath => `- \`${filePath}\``),
      '',
      `Fingerprint \`${currentContent.fingerprint}\`. An approval of any commit with this fingerprint counts, so commits that leave these paths' text unchanged (other paths, merges from main, rebases, the draft → current flip) keep it.`,
      '',
      '</details>',
    );
    try {
      await core.summary.addRaw(lines.join('\n')).write();
    } catch (error) {
      core.warning(`Could not write the gate details: ${error.message}`);
    }
  }

  /** Compose the review gate; with no code half yet, review-signal does. */
  async function publishReviewGate(headSha, spec) {
    // If another job writes between this read and write, compose again, so a
    // withdrawn code review is never overwritten with success.
    const written = new Set();
    const othersNewest = statuses =>
      statuses.find(
        status =>
          status.context === REVIEW_GATE_CONTEXT && !written.has(status.id),
      ) ?? null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const live = await listStatuses(headSha);
      const basis = othersNewest(live);
      const code = readCodeGate(live.filter(status => !written.has(status.id)));
      if (!code) return;
      const gate = composeReviewGate({
        codeGated: code.gated,
        codeDescription: code.description,
        spec,
      });
      // The details link names the spec decision run: a newer one on yield,
      // whether the gate it restores waits or succeeds.
      const targetUrl = gate.target_url ?? spec?.url ?? runUrl;
      const current = live.find(
        status => status.context === REVIEW_GATE_CONTEXT,
      );
      if (
        current?.state === gate.state &&
        current?.description === gate.description &&
        current?.target_url === targetUrl
      ) {
        return;
      }
      if (!(await isLiveHeadWritable(headSha))) return;
      const status = await createStatus({
        sha: headSha,
        context: REVIEW_GATE_CONTEXT,
        state: gate.state,
        description: gate.description,
        targetUrl,
      });
      if (status?.id != null) written.add(status.id);
      if (othersNewest(await listStatuses(headSha))?.id === basis?.id) return;
    }
  }

  async function fetchSnapshot() {
    const before = await getPullRequest();
    const headSha = before.head.sha;
    const [files, reviews, comments, timeline, statuses] = await Promise.all([
      github.paginate(github.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      }),
      github.paginate(github.rest.pulls.listReviews, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      }),
      github.paginate(github.rest.issues.listComments, {
        owner,
        repo,
        issue_number: pullNumber,
        per_page: 100,
      }),
      github.paginate(github.rest.issues.listEventsForTimeline, {
        owner,
        repo,
        issue_number: pullNumber,
        per_page: 100,
      }),
      listStatuses(headSha),
    ]);
    const after = await getPullRequest();
    if (after.head.sha !== headSha) return null;

    const scope = classifyChanges(files, {expectedCount: after.changed_files});
    const knowledgeChanges = files.filter(
      file =>
        scope.complete &&
        (classifyChanges([{filename: file.filename}]).touchesKnowledgeRecords ||
          (file.previous_filename &&
            classifyChanges([{filename: file.previous_filename}])
              .touchesKnowledgeRecords)),
    );
    const records = await Promise.all(
      knowledgeChanges.map(async file => {
        const previousPath = file.previous_filename || file.filename;
        const baseIsTextRecord = previousPath.endsWith('.md');
        const headIsTextRecord = file.filename.endsWith('.md');
        return {
          path: file.filename,
          previousPath,
          baseContent:
            !baseIsTextRecord || file.status === 'added'
              ? null
              : await readText(
                  after.base.repo.full_name,
                  after.base.sha,
                  previousPath,
                ),
          headContent:
            !headIsTextRecord || file.status === 'removed'
              ? null
              : await readText(
                  after.head.repo.full_name,
                  after.head.sha,
                  file.filename,
                ),
        };
      }),
    );
    const latest = await getPullRequest();
    if (latest.head.sha !== headSha) return null;
    return {
      pr: latest,
      files,
      reviews,
      comments,
      timeline,
      statuses,
      scope,
      records,
    };
  }

  const initialPr = await getPullRequest();
  // Nothing about a merged or closed head is still being decided. Reconciling
  // one can only publish a decision that arrives after the merge it claims to
  // gate, so stop before writing any status.
  if (isSettled(initialPr)) {
    core.info(
      'The pull request is already merged or closed; the gate does not rewrite a settled head.',
    );
    return;
  }
  const initialHead = initialPr.head.sha;
  await createStatus({
    sha: initialHead,
    context: GATE_STATUS_CONTEXT,
    state: 'pending',
    description: `Reconciling exact head ${initialHead.slice(0, 7)}.`,
  });
  // The spec half is unknown until this run decides it, so the review gate
  // waits meanwhile: a run that fails part-way (after a /revoke-spec, say)
  // leaves it pending, never an earlier success. Written before the yield
  // check, like the mirror, so a newer run's decision is restored over it.
  await publishReviewGate(initialHead, readSpecGate([]));
  if (await restoreNewerStatus(initialHead)) return;

  const commentAuthor = context.payload.comment?.user?.login?.toLowerCase();
  const snapshot = await fetchSnapshot();
  if (snapshot === null || snapshot.pr.head.sha !== initialHead) {
    core.info(
      'The pull request head changed while this run was reading state.',
    );
    return;
  }
  if (!(await isCurrentRun(initialHead))) {
    core.info(`Run ${context.runId} yielded before mutation.`);
    return;
  }

  const {pr, scope, records, reviews, comments, timeline, statuses} = snapshot;

  // A malformed owner command decides nothing; the details say why.
  const commandProblem =
    context.eventName === 'issue_comment' && commentAuthor
      ? describeOwnerCommandProblem(
          parseOwnerCommandIntent(context.payload.comment?.body),
        )
      : null;

  if (!scope.touchesKnowledgeRecords) {
    await removeLabel(env.REVIEW_LABEL);
    await setFinalStatus(
      initialHead,
      'success',
      'No knowledge records changed.',
    );
    return;
  }

  const requiredGroups = requiredApprovalGroups(records, {
    complete: scope.complete,
    touchesDesignAssets: scope.touchesDesignAssets,
  });
  const ownerApprovalRequired =
    requiredGroups.spec || requiredGroups.design || requiredGroups.theme;
  if (requiredGroups.spec && engineeringOwners.length === 0) {
    throw new Error('No ENGOWNERS are configured.');
  }
  if (
    (requiredGroups.design || requiredGroups.theme) &&
    engineeringOwners.length === 0 &&
    designOwners.length === 0
  ) {
    throw new Error('No ENGOWNERS or DESIGNOWNERS are configured.');
  }
  const designApprovers = [...new Set([...engineeringOwners, ...designOwners])];
  const themeApprovers = [...new Set([...engineeringOwners, ...designOwners])];

  // --- The spec content an approval binds (DEC-14). ---
  const specPaths = [
    ...new Set(
      snapshot.files.flatMap(file =>
        [file.filename, file.previous_filename].filter(
          filePath => filePath && isSpecPath(filePath),
        ),
      ),
    ),
  ].sort();
  const textCache = new Map();
  function specText(sha, filePath) {
    const key = `${sha.toLowerCase()}\0${filePath}`;
    if (!textCache.has(key)) {
      textCache.set(
        key,
        readSpecContent(pr.head.repo.full_name, sha, filePath),
      );
    }
    return textCache.get(key);
  }
  async function fingerprintAt(sha, paths) {
    const entries = await Promise.all(
      paths.map(async filePath => ({
        path: filePath,
        content: await specText(sha, filePath),
      })),
    );
    return fingerprintSpecContent(entries);
  }
  // An approved commit's spec paths join the head's, so dropping an approved
  // change no longer matches. A failed comparison matches nothing.
  async function specPathsAt(sha) {
    const {data} = await github.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${pr.base.sha}...${sha}`,
    });
    return (data.files ?? []).flatMap(file =>
      [file.filename, file.previous_filename].filter(
        filePath => filePath && isSpecPath(filePath),
      ),
    );
  }
  async function hasCurrentContent(sha) {
    try {
      const paths = [
        ...new Set([...specPaths, ...(await specPathsAt(sha))]),
      ].sort();
      const [atHead, atSha] = await Promise.all([
        fingerprintAt(initialHead, paths),
        fingerprintAt(sha, paths),
      ]);
      return atHead.fingerprint === atSha.fingerprint;
    } catch (error) {
      core.warning(`Could not compare ${sha.slice(0, 7)}: ${error.message}`);
      return false;
    }
  }
  const currentContent = await fingerprintAt(initialHead, specPaths);
  // Only commits an eligible owner named, by review or command, are read.
  const authorLogin = pr.user.login.toLowerCase();
  const ownerReviews = reviews.filter(review => {
    const login = review.user?.login?.toLowerCase();
    // GitHub refuses an author's approving review; never count one anyway.
    return login && login !== authorLogin && allOwners.has(login);
  });
  const namedShas = new Set([
    ...ownerReviews.map(review => review.commit_id?.toLowerCase()),
    ...comments
      .filter(comment =>
        allOwners.has(comment.user?.login?.toLowerCase() ?? ''),
      )
      .map(comment => parseOwnerCommandTarget(comment.body)?.sha),
  ]);
  const sameContent = new Set([initialHead.toLowerCase()]);
  for (const sha of [...namedShas].filter(Boolean)) {
    if (!sameContent.has(sha) && (await hasCurrentContent(sha))) {
      sameContent.add(sha);
    }
  }
  const approvesCurrentContent = sha =>
    sha != null && sameContent.has(sha.toLowerCase());

  const decisionInput = {
    reviews: ownerReviews,
    comments,
    dismissalEvents: timeline,
    headSha: initialHead,
    approvesCurrentContent,
  };
  const specDecision = requiredGroups.spec
    ? resolveOwnerDecision({...decisionInput, owners: engineeringOwners})
    : {approved: true, owner: null};
  const designDecision = requiredGroups.design
    ? resolveOwnerDecision({...decisionInput, owners: designApprovers})
    : {approved: true, owner: null};
  const themeDecision = requiredGroups.theme
    ? resolveOwnerDecision({...decisionInput, owners: themeApprovers})
    : {approved: true, owner: null};
  const approved =
    specDecision.approved && designDecision.approved && themeDecision.approved;
  const approvingOwners = [
    specDecision.owner,
    designDecision.owner,
    themeDecision.owner,
  ]
    .filter(Boolean)
    .filter((ownerName, index, owners) => owners.indexOf(ownerName) === index);
  const missingGroups = {
    spec: !specDecision.approved,
    design: !designDecision.approved,
    theme: !themeDecision.approved,
    heldBy: [specDecision, designDecision, themeDecision].find(
      decision => decision.approved === false && decision.source === 'review',
    )?.owner,
  };
  const statusText =
    ownerApprovalRequired && !approved
      ? missingGroups.heldBy
        ? SPEC_WAITING_TEXT.held(missingGroups.heldBy)
        : SPEC_WAITING_TEXT[missingGroups.spec ? 'eng' : 'design']
      : ownerApprovalRequired
        ? approvedDescription(approvingOwners)
        : 'Draft-only knowledge change; owner approval is not required.';
  await writeDetails({
    statusText,
    headSha: initialHead,
    approvalRequired: ownerApprovalRequired,
    approved,
    records,
    currentContent,
    notes: ownerActNotes({
      reviews: ownerReviews,
      comments,
      owners: allOwners,
      approvesCurrentContent,
    }),
    commandProblem,
  });

  if (ownerApprovalRequired && !approved) {
    if (!(await isCurrentRun(initialHead))) return;
    await ensureLabel(
      pr,
      env.REVIEW_LABEL,
      'd4c5f9',
      'Current knowledge records await owner approval',
    );
    await setFinalStatus(initialHead, 'pending', statusText, missingGroups);
    return;
  }

  if (pr.draft) {
    if (!(await isCurrentRun(initialHead))) return;
    await removeLabel(env.REVIEW_LABEL);
    await setFinalStatus(
      initialHead,
      'success',
      'Draft PR; owner gate is not blocking.',
    );
    return;
  }

  const successDescription = statusText;
  approvedBy = ownerApprovalRequired ? approvingOwners : [];

  if (!(await isCurrentRun(initialHead))) return;
  await removeLabel(env.REVIEW_LABEL);
  await setFinalStatus(initialHead, 'success', successDescription);
}

module.exports = {isCommandComment, reconcileSpecOwnerGate};
