#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interaction-selection-replay.mjs
 * @input `--prs <numbers>` (comma-separated) or `--prs-file <file>` (one
 *   number a line), else the record's own pull requests; `--out <file>`.
 *   Runs in a clone with the pull requests' commits and an authenticated
 *   `gh`.
 * @output The replay record (`.github/interaction-selection-replay.json`):
 *   for each pull request, its commit, the Chromium selection, the specs its
 *   full runs failed, and a verdict. It exits 1 when a failing spec is outside
 *   the selection and has no reviewed note.
 * @position Evidence for the Chromium interaction selection (spec:AST-030
 *   FR31): each pull request is replayed at its own merge commit (or head, if
 *   unmerged), with that commit's files, classifier and import graphs, and
 *   this checkout's selector.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import yaml from 'yaml';

import {importerGraph, proofImporters} from './a11y-pr-contracts.mjs';
import {
  chromiumSelection,
  isInteractionSpec,
  storyScopeFor,
} from './playwright-legs.mjs';

const COMMENT =
  'Replay of the Chromium interaction selection (spec:AST-030 FR31). Regenerate with node .github/scripts/interaction-selection-replay.mjs (the same pull requests), --prs <numbers>, or --resume to continue an interrupted run. `reviewed`: for one pull request (`#<number> <spec>`), a failing spec outside its selection that a review found not to be an escape, and why.';
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const OWNER_REPO = 'meta/astryx';

const git = (...args) =>
  execFileSync('git', ['-C', ROOT, ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
const gh = (...args) =>
  execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 1 << 28});

/** The lane's scope: the Chromium selection step's own `SCOPE_PATHS`. */
export function laneScope(ci = readCi()) {
  const step = ci.jobs['interaction-legs'].steps.find(
    each => each.id === 'select-chromium',
  );
  const paths = step?.env?.SCOPE_PATHS;
  if (paths == null)
    throw new Error("No SCOPE_PATHS on ci.yml's select-chromium step");
  return new RegExp(paths);
}

function readCi() {
  return yaml.parse(
    fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'),
  );
}

/** The key of a reviewed note: one pull request's one failing spec. */
export const reviewKey = (pr, spec) => `#${pr} ${spec}`;

const PR_QUERY = `query($n: Int!) { repository(owner: "meta", name: "astryx") {
  pullRequest(number: $n) { number mergeCommit { oid } headRefOid
    files(first: 100) { totalCount nodes { path } } } } }`;

const COMMITS_QUERY = `query($n: Int!, $last: Int!, $before: String) { repository(owner: "meta", name: "astryx") {
  pullRequest(number: $n) { commits(last: $last, before: $before) {
    pageInfo { hasPreviousPage startCursor }
    nodes { commit { oid checkSuites(first: 30, filterBy: {appId: 15368}) { totalCount nodes {
      checkRuns(first: 50, filterBy: {conclusions: [FAILURE]}) { totalCount nodes { name databaseId } } } } } } } } } }`;

/**
 * The failed Chromium interaction jobs on every commit of a pull request,
 * page by page from its newest commit back to its first.
 * @param {number} number
 * @param {(before: string | null) => {pageInfo: {hasPreviousPage: boolean, startCursor: string}, nodes: object[]}} page
 *   one page of commits, before a cursor
 * @returns {number[]}
 */
export function failedInteractionJobs(number, page) {
  const jobs = [];
  let before = null;
  for (;;) {
    const commits = page(before);
    for (const {commit} of commits.nodes) {
      if (commit.checkSuites.totalCount > commit.checkSuites.nodes.length)
        throw new Error(
          `#${number} ${commit.oid} has more check suites than one page lists`,
        );
      for (const suite of commit.checkSuites.nodes) {
        if (suite.checkRuns.totalCount > suite.checkRuns.nodes.length)
          throw new Error(
            `#${number} ${commit.oid} has more failed check runs than one page lists`,
          );
        for (const run of suite.checkRuns.nodes)
          if (/^pr-interaction \(/.test(run.name)) jobs.push(run.databaseId);
      }
    }
    if (!commits.pageInfo.hasPreviousPage) return jobs;
    before = commits.pageInfo.startCursor;
  }
}

/** Commits a page asks for, fewer each time GitHub refuses a page as too costly. */
const PAGE_SIZES = [20, 10, 5, 2, 1];

/**
 * One page of a pull request's commits before a cursor. GitHub refuses a
 * page whose check data costs too much, so the page shrinks until it passes.
 * @param {number} number
 * @param {string | null} before
 */
function commitsPage(number, before) {
  for (const last of PAGE_SIZES) {
    try {
      return JSON.parse(
        gh(
          'api',
          'graphql',
          '-f',
          `query=${COMMITS_QUERY}`,
          '-F',
          `n=${number}`,
          '-F',
          `last=${last}`,
          ...(before ? ['-f', `before=${before}`] : []),
        ),
      ).data.repository.pullRequest.commits;
    } catch (error) {
      const refused = /Resource limits for this query exceeded/.test(
        `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`,
      );
      if (!refused || last === PAGE_SIZES.at(-1)) throw error;
    }
  }
  throw new Error('unreachable');
}

/** A pull request's commit, files and failed Chromium interaction jobs. */
function pullRequest(number) {
  const data = JSON.parse(
    gh('api', 'graphql', '-f', `query=${PR_QUERY}`, '-F', `n=${number}`),
  ).data.repository.pullRequest;
  if (data.files.totalCount > data.files.nodes.length)
    throw new Error(`#${number} changes more files than one page lists`);
  const jobs = failedInteractionJobs(number, before =>
    commitsPage(number, before),
  );
  return {
    number,
    commit: data.mergeCommit?.oid ?? data.headRefOid,
    kind: data.mergeCommit ? 'merge' : 'head',
    files: data.files.nodes.map(file => file.path),
    jobs,
  };
}

/** The spec files a failed job's log names as failing. */
function failingSpecs(job) {
  const log = spawnSync(
    'gh',
    ['run', 'view', '--job', String(job), '--log', '-R', OWNER_REPO],
    {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    },
  );
  if (log.status !== 0) return null;
  const specs = new Set();
  for (const line of log.stdout.split('\n')) {
    const match =
      /(?:✘|\d+\)) +(?:\d+ )?\[chromium\] › ([^:\s]+\.spec\.ts):\d+/.exec(
        line.replace(/\x1b\[[0-9;]*m/g, ''),
      );
    if (match) specs.add(match[1]);
  }
  return [...specs];
}

/** The selection the current selector makes for one pull request. */
function replay(pr, {scope, selection, primitives}) {
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'selection-replay-'));
  try {
    execFileSync('bash', [
      '-c',
      `git -C "${ROOT}" archive ${pr.commit} ':(glob)packages/*/src/**' internal .github/scripts scripts apps/storybook/stories | tar -x -C "${tree}"`,
    ]);
    const listed = git('ls-tree', '-r', '--name-only', pr.commit)
      .split('\n')
      .filter(Boolean);
    const base =
      pr.kind === 'merge'
        ? `${pr.commit}^1`
        : git('merge-base', 'origin/main', pr.commit).trim();
    const nameStatus = git('diff', '--name-status', base, pr.commit).trim();
    const output = path.join(tree, 'github-output');
    fs.writeFileSync(output, '');
    const classifier = spawnSync(
      'node',
      [path.join(tree, '.github/scripts/change-scope.cjs'), '--github-output'],
      {
        input: `${nameStatus}\n`,
        env: {...process.env, GITHUB_OUTPUT: output},
        encoding: 'utf8',
      },
    );
    const classified =
      classifier.status === 0
        ? Object.fromEntries(
            fs
              .readFileSync(output, 'utf8')
              .split('\n')
              .filter(Boolean)
              .map(line => line.split('=')),
          )
        : null;
    let importers = null;
    try {
      importers = importerGraph(tree);
    } catch {}
    let proofs = null;
    try {
      proofs = proofImporters({root: tree, listed, isProof: isInteractionSpec});
    } catch {}
    // The lane's own story rule: a changed story runs what it reaches.
    const read = file => {
      try {
        return fs.readFileSync(path.join(tree, file), 'utf8');
      } catch {
        return git('show', `${pr.commit}:${file}`);
      }
    };
    return chromiumSelection({
      listed,
      changed: pr.files,
      scope,
      fullSuite: classified ? classified.full_suite === 'true' : true,
      importers,
      proofs,
      selection,
      primitives,
      storyScope: storyScopeFor({listed, read}),
    });
  } finally {
    fs.rmSync(tree, {recursive: true, force: true});
  }
}

function main(args) {
  const option = name => args[args.indexOf(name) + 1];
  const out = args.includes('--out')
    ? option('--out')
    : path.join(ROOT, '.github/interaction-selection-replay.json');
  const previous = fs.existsSync(out)
    ? JSON.parse(fs.readFileSync(out, 'utf8'))
    : {};
  // With no list, the record's own pull requests are replayed again.
  const numbers = args.includes('--prs-file')
    ? fs.readFileSync(option('--prs-file'), 'utf8').split(/\s+/).filter(Boolean)
    : args.includes('--prs')
      ? option('--prs').split(',')
      : (previous.rows ?? []).map(row => row.pr);
  const reviewed = previous.reviewed ?? {};
  const scope = laneScope();
  const selection = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, '.github/interaction-selection.json'),
      'utf8',
    ),
  );
  const {primitives} = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, '.github/a11y-shared-primitives.json'),
      'utf8',
    ),
  );
  // `--resume` keeps the rows already replayed and continues with the rest.
  const done = new Map(
    args.includes('--resume')
      ? (previous.rows ?? []).map(row => [row.pr, row])
      : [],
  );
  const rows = [];
  let escapes = 0;
  const write = () =>
    fs.writeFileSync(
      out,
      `${JSON.stringify({$comment: COMMENT, reviewed, rows}, null, 2)}\n`,
    );
  for (const number of numbers.map(Number)) {
    if (done.has(number)) {
      rows.push(done.get(number));
      if (/^escape/.test(done.get(number).verdict)) escapes += 1;
      continue;
    }
    const pr = pullRequest(number);
    const inScope = pr.files.some(file => scope.test(file));
    const picked = inScope ? replay(pr, {scope, selection, primitives}) : null;
    const logs = pr.jobs.map(failingSpecs);
    const unknown = logs.some(specs => specs == null);
    const failures = [...new Set(logs.flatMap(specs => specs ?? []))].sort();
    const missed =
      picked == null || picked.full
        ? []
        : failures.filter(spec => !picked.specs.includes(spec));
    const unreviewed = missed.filter(
      spec => reviewed[reviewKey(number, spec)] == null,
    );
    escapes += unreviewed.length;
    rows.push({
      pr: number,
      commit: pr.commit,
      kind: pr.kind,
      selection:
        picked == null ? 'out of scope' : picked.full ? 'full' : picked.specs,
      ...(picked?.full ? {full_reason: picked.reason} : {}),
      full_run_failures: failures,
      verdict:
        failures.length === 0
          ? unknown
            ? 'failures unknown: a failed job has no log'
            : 'no failure'
          : picked == null
            ? 'out of scope at its merge commit: the lane runs no proof for it'
            : missed.length === 0
              ? 'caught'
              : unreviewed.length > 0
                ? `escape: ${unreviewed.join(', ')}`
                : 'not an escape (reviewed)',
    });
    console.error(`#${number}: ${rows.at(-1).verdict}`);
    write();
  }
  write();
  if (escapes > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(fileURLToPath(import.meta.url))
) {
  main(process.argv.slice(2));
}
