// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  probeVercelPreview,
  resolveVercelPreview,
  waitForPreviewRoutes,
} from './vercel-preview.mjs';

export const PR_ANALYSIS_MARKER = '<!-- astryx-pr-analysis -->';

function headMarker(sha) {
  return `<!-- astryx-pr-head:${sha} -->`;
}

const FULL_SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GENERATOR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'generate-pr-comment.js',
);

function refuse(message) {
  throw new Error(`PR preview refused: ${message}`);
}

/**
 * The pull request moved on from the source run: it closed, merged, or got a
 * newer head. That is ordinary churn, not a forged identity. Nothing is
 * published for the old run and the job stays green; the newer head's own run
 * reports.
 */
export class PullRequestMovedOn extends Error {
  constructor(message) {
    super(`PR preview stood down: ${message}`);
    this.name = 'PullRequestMovedOn';
  }
}

function standDown(message) {
  throw new PullRequestMovedOn(message);
}

/**
 * An artifact can come from an earlier attempt of the same run: rerunning only
 * the failed jobs keeps the artifacts of the jobs that passed. A later attempt
 * than the reported one cannot have produced it.
 */
export function attemptBelongsToRun(artifactAttempt, reportedAttempt) {
  const artifact = Number(artifactAttempt);
  return (
    Number.isSafeInteger(artifact) &&
    artifact > 0 &&
    artifact <= Number(reportedAttempt)
  );
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    refuse(`${name} must be a positive integer`);
  }
  return number;
}

function fullSha(value, name) {
  const sha = String(value ?? '');
  if (!FULL_SHA.test(sha)) refuse(`${name} must be a full lowercase SHA`);
  return sha;
}

function repository(value, name) {
  const repo = String(value ?? '');
  if (!REPOSITORY.test(repo)) refuse(`${name} is invalid`);
  return repo;
}

function nonempty(value, name) {
  const string = String(value ?? '');
  if (!string) refuse(`${name} is missing`);
  return string;
}

function runRepository(run) {
  return repository(run?.head_repository?.full_name, 'source head repository');
}

function runRepositoryId(run) {
  return nonempty(run?.head_repository?.id, 'source head repository id');
}

function identityFromPullAndRun({pull, run, baseRepository}) {
  if (run?.event !== 'pull_request') {
    refuse('source run is not backed by a pull request');
  }
  if (run?.name && run.name !== 'CI') {
    refuse(`source workflow is ${run.name}, not CI`);
  }

  const expectedBase = repository(baseRepository, 'base repository');
  const sourceRunId = positiveInteger(run.id, 'source run id');
  const sourceRunAttempt = positiveInteger(
    run.run_attempt,
    'source run attempt',
  );
  const headSha = fullSha(run.head_sha, 'source head');
  const headRef = nonempty(run.head_branch, 'source head branch');
  const headRepository = runRepository(run);
  const headRepositoryId = runRepositoryId(run);

  if (pull?.state !== 'open') standDown('pull request is not open');
  if (pull?.head?.sha !== headSha)
    standDown('pull request head does not match source run');
  if (pull?.head?.ref !== headRef)
    refuse('pull request branch does not match source run');
  if (pull?.head?.repo?.full_name !== headRepository) {
    refuse('pull request repository does not match source run');
  }
  if (String(pull?.head?.repo?.id ?? '') !== headRepositoryId) {
    refuse('pull request repository id does not match source run');
  }
  if (pull?.base?.repo?.full_name !== expectedBase) {
    refuse('pull request targets another repository');
  }

  // The run's `pull_requests` association is not a record of the tested base:
  // GitHub reports the pull request's live base and head there, so it moves
  // with main. No trusted field records the tested base; the visual report
  // carries the base its own CI run tested.
  return {
    prNumber: positiveInteger(pull.number, 'pull request number'),
    headSha,
    headRef,
    headRepository,
    headRepositoryId,
    baseRepository: expectedBase,
    baseSha: fullSha(pull.base.sha, 'pull request base'),
    sourceRunId,
    sourceRunAttempt,
    sourceConclusion: String(run.conclusion ?? ''),
    draft: pull.draft === true,
  };
}

const RUN_IDENTITY_KEYS = [
  'headSha',
  'headRef',
  'headRepository',
  'headRepositoryId',
  'sourceRunId',
  'sourceRunAttempt',
  'sourceConclusion',
];

const SOURCE_IDENTITY_KEYS = [
  'prNumber',
  'baseRepository',
  ...RUN_IDENTITY_KEYS,
];

function sameIdentity(actual, expected, keys = SOURCE_IDENTITY_KEYS) {
  for (const key of keys) {
    if (String(actual[key]) !== String(expected[key])) {
      refuse(`${key} does not match the trusted source identity`);
    }
  }
}

export function validatePullRequestSourceRun({pull, run, baseRepository}) {
  return identityFromPullAndRun({pull, run, baseRepository});
}

export async function resolveWorkflowRunPullRequest({
  github,
  owner,
  repo,
  run,
}) {
  const baseRepository = `${owner}/${repo}`;
  let candidates;
  const directNumbers = [
    ...new Set(
      (run?.pull_requests ?? [])
        .map(pull => Number(pull?.number))
        .filter(number => Number.isSafeInteger(number) && number > 0),
    ),
  ];

  if (directNumbers.length > 0) {
    candidates = await Promise.all(
      directNumbers.map(async pullNumber => {
        const {data} = await github.rest.pulls.get({
          owner,
          repo,
          pull_number: pullNumber,
        });
        return data;
      }),
    );
  } else {
    const headOwner = nonempty(
      run?.head_repository?.owner?.login,
      'source head repository owner',
    );
    const headRef = nonempty(run?.head_branch, 'source head branch');
    const {data} = await github.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      head: `${headOwner}:${headRef}`,
      per_page: 100,
    });
    candidates = data;
  }

  const matches = [];
  const seen = new Set();
  for (const pull of candidates) {
    if (seen.has(pull?.number)) continue;
    seen.add(pull?.number);
    try {
      matches.push(identityFromPullAndRun({pull, run, baseRepository}));
    } catch {
      // A candidate is not authority. Only the exact run/PR/repository identity
      // accepted above may reach a privileged mutation.
    }
  }
  if (
    matches.length === 0 &&
    candidates.every(
      pull => pull?.state !== 'open' || pull?.head?.sha !== run?.head_sha,
    )
  ) {
    // A source run can be rerun after its pull request merges, or after the
    // branch moved to a new head. Either way the run's report has no current
    // pull request: no privileged work remains, so finish without turning the
    // trusted default-branch workflow red. The newer head has its own run.
    return null;
  }
  if (matches.length !== 1) {
    refuse(
      `expected exactly one current pull request for source run ${run?.id}; found ${matches.length}`,
    );
  }
  return matches[0];
}

export async function confirmSourceRunIdentity({
  github,
  owner,
  repo,
  expected,
}) {
  const sourceRunId = positiveInteger(expected.sourceRunId, 'source run id');
  const prNumber = positiveInteger(expected.prNumber, 'pull request number');
  const attemptNumber = positiveInteger(
    expected.sourceRunAttempt,
    'source run attempt',
  );
  // Read the exact attempt the trusted event reported. `getWorkflowRun`
  // describes the LATEST attempt, so a rerun started after the event would make
  // the same run look like a different identity (attempt and conclusion).
  const readRun =
    typeof github.rest.actions.getWorkflowRunAttempt === 'function'
      ? github.rest.actions.getWorkflowRunAttempt({
          owner,
          repo,
          run_id: sourceRunId,
          attempt_number: attemptNumber,
        })
      : github.rest.actions.getWorkflowRun({owner, repo, run_id: sourceRunId});
  const [{data: run}, {data: pull}] = await Promise.all([
    readRun,
    github.rest.pulls.get({owner, repo, pull_number: prNumber}),
  ]);
  // Compare the run with the trusted event before looking at the pull request.
  // A run's own identity never changes, so a mismatch there refuses even when
  // the pull request has also moved on.
  sameIdentity(
    {
      headSha: run?.head_sha,
      headRef: run?.head_branch,
      headRepository: run?.head_repository?.full_name,
      headRepositoryId: run?.head_repository?.id,
      sourceRunId: run?.id,
      sourceRunAttempt: run?.run_attempt,
      sourceConclusion: run?.conclusion ?? '',
    },
    expected,
    RUN_IDENTITY_KEYS,
  );
  const actual = identityFromPullAndRun({
    pull,
    run,
    baseRepository: `${owner}/${repo}`,
  });
  sameIdentity(actual, expected);
  return actual;
}

/**
 * The confirmed identity, or null when the pull request moved on from the
 * source run. Any other mismatch still refuses.
 */
export async function confirmOrStandDown({
  github,
  owner,
  repo,
  expected,
  core,
}) {
  try {
    return await confirmSourceRunIdentity({github, owner, repo, expected});
  } catch (error) {
    if (!(error instanceof PullRequestMovedOn)) throw error;
    core.info(`${error.message}; nothing to publish for this run.`);
    return null;
  }
}

/**
 * The run's latest attempt number, or null when the client cannot say. A
 * report for an earlier attempt must not replace the latest attempt's: that
 * attempt's own completion publishes.
 */
export async function latestAttemptOf({github, owner, repo, sourceRunId}) {
  const {data: run} = await github.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: positiveInteger(sourceRunId, 'source run id'),
  });
  const attempt = Number(run?.run_attempt);
  return Number.isSafeInteger(attempt) && attempt > 0 ? attempt : null;
}

/** True when a newer attempt of the reported run exists. */
async function supersededByNewerAttempt({github, owner, repo, identity, core}) {
  const latest = await latestAttemptOf({
    github,
    owner,
    repo,
    sourceRunId: identity.sourceRunId,
  });
  if (latest != null && latest > identity.sourceRunAttempt) {
    core.info(
      `Attempt ${latest} of source run ${identity.sourceRunId} supersedes the reported attempt ${identity.sourceRunAttempt}; its own completion publishes.`,
    );
    return true;
  }
  return false;
}

export function validateAnalysisMetadata(metadata, identity) {
  if (String(metadata?.prNumber) !== String(identity.prNumber)) {
    refuse('analysis pull request does not match');
  }
  if (
    metadata?.headSha !== undefined &&
    metadata.headSha !== identity.headSha
  ) {
    refuse('analysis head does not match');
  }
  if (
    metadata?.headRepository !== undefined &&
    metadata.headRepository !== identity.headRepository
  ) {
    refuse('analysis head repository does not match');
  }
  if (
    metadata?.baseRepository !== undefined &&
    metadata.baseRepository !== identity.baseRepository
  ) {
    refuse('analysis base repository does not match');
  }
  if (String(metadata?.runId) !== String(identity.sourceRunId)) {
    refuse('analysis source run does not match');
  }
  if (
    metadata?.runAttempt !== undefined &&
    !attemptBelongsToRun(metadata.runAttempt, identity.sourceRunAttempt)
  ) {
    refuse('analysis source run attempt does not match');
  }
  if (
    !/^[0-9a-f]{7,40}$/.test(String(metadata?.shortHash ?? '')) ||
    !identity.headSha.startsWith(metadata.shortHash)
  ) {
    refuse('analysis short hash does not match');
  }
  return metadata;
}

function previewState(storybook, sandbox) {
  if (storybook && sandbox) return 'both';
  if (storybook) return 'storybook';
  if (sandbox) return 'sandbox';
  return 'none';
}

// Both preview links come from one verified exact-head Vercel deployment.
// No branch-backed preview is considered a link source.
function safeCurrentBody({
  identity,
  runUrl,
  message: overrideMessage,
  previewOrigin,
}) {
  const conclusion = identity.sourceConclusion;
  const message =
    overrideMessage ??
    (conclusion === 'success'
      ? 'The current CI run completed, but its trusted analysis is unavailable.'
      : `The current CI run concluded ${conclusion || 'without a result'}. Current analysis is unavailable.`);
  const links = previewOrigin
    ? [
        `[View Storybook for this PR](${previewOrigin}/storybook/)`,
        `[View Sandbox for this PR](${previewOrigin}/sandbox/)`,
      ]
    : [];
  const previewMessage = links.length
    ? `\n\n${links.join(' · ')}`
    : '\n\nThe exact-head preview is not available yet.';
  return `## PR Analysis Report\n${PR_ANALYSIS_MARKER}\n${headMarker(identity.headSha)}\n\n> **Current run:** ${message}${previewMessage}\n\n---\n\n<sub>Generated by PR Enrichment workflow | <a href="${runUrl}" target="_blank" rel="noopener noreferrer">View current CI run</a></sub>\n`;
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function trustedAnalysis({analysisPath, metadataPath, identity, core}) {
  try {
    if (!fs.existsSync(analysisPath) || !fs.existsSync(metadataPath))
      return false;
    validateAnalysisMetadata(readJSON(metadataPath), identity);
    readJSON(analysisPath);
    return true;
  } catch (error) {
    core.warning(`Ignoring untrusted or stale analysis: ${error.message}`);
    return false;
  }
}

/**
 * Base measurements come from the same CI run's merge-base build. They are
 * used only when they name the exact head this comment reports.
 */
function trustedBaseStats({baseStatsPath, identity, core}) {
  try {
    if (!fs.existsSync(baseStatsPath)) return false;
    const stats = readJSON(baseStatsPath);
    if (
      !FULL_SHA.test(String(stats.headSha)) ||
      stats.headSha !== identity.headSha
    )
      refuse('base stats head does not match');
    return true;
  } catch (error) {
    core.warning(`Ignoring untrusted or stale base stats: ${error.message}`);
    return false;
  }
}

async function allComments(github, owner, repo, prNumber) {
  return github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });
}

export async function reconcilePrComment({
  github,
  core,
  context,
  expectedIdentity,
  analysisPath = 'pr-analysis/analysis.json',
  metadataPath = 'pr-analysis/pr-meta.json',
  baseStatsPath = 'pr-size-base/size-base.json',
  a11yPath = 'a11y/a11y-report.json',
  visualPath = 'trusted-visual/verdict.json',
  createIfMissing = true,
  fallbackMessage,
  lookupPreview = resolveVercelPreview,
  probePreview = probeVercelPreview,
  probeWaitMs = 90_000,
  generator = GENERATOR,
  execute = execFileSync,
}) {
  const {owner, repo} = context.repo;
  const identity = await confirmOrStandDown({
    github,
    owner,
    repo,
    expected: expectedIdentity,
    core,
  });
  if (identity === null) {
    return {action: 'none', body: null, identity: null};
  }
  if (await supersededByNewerAttempt({github, owner, repo, identity, core})) {
    return {action: 'none', body: null, identity};
  }
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${identity.sourceRunId}`;
  const analysisReady = trustedAnalysis({
    analysisPath,
    metadataPath,
    identity,
    core,
  });
  const candidateOrigin =
    createIfMissing && !identity.draft
      ? await lookupPreview({
          github,
          owner,
          repo,
          prNumber: identity.prNumber,
          headSha: identity.headSha,
        })
      : null;
  const routesReady =
    candidateOrigin &&
    (await waitForPreviewRoutes(candidateOrigin, {
      probe: probePreview,
      waitMs: probeWaitMs,
    }));
  const previewOrigin =
    routesReady &&
    (await lookupPreview({
      github,
      owner,
      repo,
      prNumber: identity.prNumber,
      headSha: identity.headSha,
      waitMs: 0,
    })) === candidateOrigin
      ? candidateOrigin
      : null;
  const storybook = previewOrigin !== null;
  const sandbox = storybook;
  const comments = await allComments(github, owner, repo, identity.prNumber);
  const botComments = comments.filter(comment => comment.user?.type === 'Bot');
  const botComment =
    botComments.find(comment => comment.body?.includes(PR_ANALYSIS_MARKER)) ??
    botComments.find(comment => comment.body?.includes('PR Analysis Report'));
  if (!botComment && !createIfMissing) {
    core.info(
      `No existing PR Analysis Report to reconcile on #${identity.prNumber}.`,
    );
    return {action: 'none', body: null, identity};
  }

  let body;
  if (analysisReady) {
    let resolvedA11yPath = a11yPath;
    if (!fs.existsSync(resolvedA11yPath)) {
      resolvedA11yPath = path.resolve('a11y-empty.json');
      fs.writeFileSync(
        resolvedA11yPath,
        '{"components":{},"summary":{"componentsAudited":0,"totalViolations":0}}',
      );
    }
    const args = [
      generator,
      '--analysis',
      analysisPath,
      ...(trustedBaseStats({baseStatsPath, identity, core})
        ? ['--base-stats', baseStatsPath]
        : []),
      '--a11y',
      resolvedA11yPath,
      ...(fs.existsSync(visualPath) ? ['--visual', visualPath] : []),
      ...(storybook ? ['--storybook-url', `${previewOrigin}/storybook/`] : []),
      ...(sandbox ? ['--sandbox-url', `${previewOrigin}/sandbox/`] : []),
      '--preview-state',
      previewState(storybook, sandbox),
      '--source-conclusion',
      identity.sourceConclusion,
      '--run-url',
      runUrl,
      '--pr-number',
      String(identity.prNumber),
    ];
    try {
      body = execute(process.execPath, args, {encoding: 'utf8'}).replace(
        PR_ANALYSIS_MARKER,
        `${PR_ANALYSIS_MARKER}\n${headMarker(identity.headSha)}`,
      );
    } catch (error) {
      core.warning(`Could not render current analysis: ${error.message}`);
      body = safeCurrentBody({
        identity,
        runUrl,
        message: fallbackMessage,
        previewOrigin,
      });
    }
  } else {
    body = safeCurrentBody({
      identity,
      runUrl,
      message: fallbackMessage,
      previewOrigin,
    });
  }

  // Vercel readiness can take minutes after the source run finishes. Confirm
  // the reported attempt's identity again, and stand down if a newer attempt
  // of the run has started since: an earlier attempt's report must not replace
  // the latest attempt's.
  if (
    (await confirmOrStandDown({
      github,
      owner,
      repo,
      expected: expectedIdentity,
      core,
    })) === null
  ) {
    return {action: 'none', body: null, identity};
  }
  if (await supersededByNewerAttempt({github, owner, repo, identity, core})) {
    return {action: 'none', body: null, identity};
  }
  if (
    previewOrigin &&
    (await lookupPreview({
      github,
      owner,
      repo,
      prNumber: identity.prNumber,
      headSha: identity.headSha,
      waitMs: 0,
    })) !== previewOrigin
  ) {
    core.info('A newer exact-head deployment superseded this preview.');
    return {action: 'none', body: null, identity};
  }
  if (botComment) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: botComment.id,
      body,
    });
    core.info(`Updated PR Analysis Report on #${identity.prNumber}.`);
    return {action: 'updated', body, identity};
  }

  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: identity.prNumber,
    body,
  });
  core.info(`Posted PR Analysis Report on #${identity.prNumber}.`);
  return {action: 'created', body, identity};
}

export async function reconcileEarlyPreviewComment({
  github,
  owner,
  repo,
  prNumber,
  headSha,
  origin,
  lookupPreview = resolveVercelPreview,
  probePreview = probeVercelPreview,
  probeWaitMs = 90_000,
}) {
  const currentOrigin = await lookupPreview({
    github,
    owner,
    repo,
    prNumber,
    headSha,
    waitMs: 0,
  });
  if (
    currentOrigin !== origin ||
    !(await waitForPreviewRoutes(origin, {
      probe: probePreview,
      waitMs: probeWaitMs,
    }))
  )
    return {action: 'none'};

  const comments = await allComments(github, owner, repo, prNumber);
  const existing = comments.find(
    comment =>
      comment.user?.type === 'Bot' &&
      comment.body?.includes(PR_ANALYSIS_MARKER),
  );
  const links = `[View Storybook for this PR](${origin}/storybook/) · [View Sandbox for this PR](${origin}/sandbox/)`;
  const marker = headMarker(headSha);
  const legacySandboxURL = `https://${owner}.github.io/${repo}/pr/${prNumber}/sandbox/`;
  let body = `## PR Analysis Report\n${PR_ANALYSIS_MARKER}\n${marker}\n\n> **Previews ready:** Storybook and Sandbox were built with this PR's docsite. CI evidence will be added when available.\n\n${links}\n`;
  if (existing?.body.includes(marker)) {
    if (
      existing.body.includes(`${origin}/storybook/`) &&
      existing.body.includes(`${origin}/sandbox/`)
    ) {
      return {action: 'unchanged'};
    }
    const oldOrigins = new Set(
      existing.body.match(
        /https:\/\/astryx-[a-z0-9]{9}-fbopensource\.vercel\.app/g,
      ) ?? [],
    );
    if (
      oldOrigins.size === 1 &&
      existing.body.includes('View Storybook for this PR')
    ) {
      // Same-head redeploy: preserve existing CI/a11y/visual content and
      // change only the exact-head preview URLs.
      body = existing.body
        .replaceAll([...oldOrigins][0], origin)
        .replaceAll(legacySandboxURL, `${origin}/sandbox/`);
      if (!body.includes(`${origin}/sandbox/`)) {
        body = body.replace(
          marker,
          `${marker}\n\n[View Sandbox for this PR](${origin}/sandbox/)`,
        );
      }
    } else if (!existing.body.includes('View Storybook for this PR')) {
      // CI may finish before Vercel; add links to the current-head report.
      body = existing.body
        .replace(/^> \*\*Preview availability:\*\*[^\n]*\n\n/m, '')
        .replace('The exact-head preview is not available yet.', '')
        .replace(marker, `${marker}\n\n${links}`);
    }
  }

  // Replace older same-head preview URLs without dropping CI, a11y, or visual
  // evidence in the surrounding report.
  body = body
    .replaceAll(legacySandboxURL, `${origin}/sandbox/`)
    .replace(/^> \*\*Preview availability:\*\*[^\n]*\n\n/m, '');

  const {data: current} = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });
  if (
    current.state !== 'open' ||
    current.draft ||
    current.head?.sha !== headSha
  ) {
    return {action: 'none'};
  }
  if (
    (await lookupPreview({
      github,
      owner,
      repo,
      prNumber,
      headSha,
      waitMs: 0,
    })) !== origin
  ) {
    return {action: 'none'};
  }
  if (existing) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return {action: 'updated', body};
  }
  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
  return {action: 'created', body};
}
