#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pre-review report: what a reviewer checks in a change, before review.
 * @input `--base <ref>` (default `origin/main`), an optional `--head <ref>`
 *   (default: the working tree, with uncommitted and untracked files), `--json`,
 *   and the description through `--body-file <path>` or `--pr <number>`.
 * @output The changed files and their class, the governing records and routed
 *   claims, the findings at a file and line, and the checklist items that
 *   apply to this change.
 * @position `pnpm review:pre`. The checklist it names is in
 *   `docs/contributing/pull-requests.md`. SYNC: keep `CHECKS` in step with it.
 */
/* global console, process */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  SIZE_LIMIT,
  authoredLineCount,
  changesetFindings,
  effectFindings,
  mergeFindings,
  recordGapFindings,
  sharedOwnerFindings,
  sizeFindings,
} from './lib/pre-review-findings.mjs';
import {isShippedSource, readDiff} from './lib/review-diff.mjs';
import {
  changedChangesets,
  checkCoverage,
  gitTree,
} from './release/changeset-coverage.mjs';
import {
  diffText,
  loadKnowledgeIndex,
  resolveSpecsForFile,
} from './specs-for-file.mjs';

const require = createRequire(import.meta.url);
const {
  classifyChanges,
  classifyPaths,
  isPackageReleasePath,
  parseNameStatus,
} = require('../.github/scripts/change-scope.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHECKLIST_LINK =
  'docs/contributing/pull-requests.md#pre-review-checklist';

export const CHECKS = {
  a: 'API delta: a current record decides each added or changed API report row',
  b: 'Behavior: each observable behavior change cites a current record and clause, or the description says "No behavior change"',
  c: 'Behavior props: a prop that selects a behavior follows the naming and one-prop rules',
  d: 'Public boundary: no internal or private context in source, tests, fixtures, commits, or pull request text',
  e: 'New public hook: a runnable example in a template block that names the hook in exampleFor or alsoExampleFor',
  f: 'Comments: new or changed source comments explain only non-obvious work, in Simplified Technical English',
  g: 'Records: a changed record needs a spec owner to approve its spec content',
  h: `Size: at most ${SIZE_LIMIT.toLocaleString('en-US')} authored lines, unless the description declares a behavior-module pull request or a batch row`,
  i: 'Shared owners: a concern Core owns in a shared module is called through that module',
  j: 'Effects: a new Effect names the system it syncs and does more than copy into a ref; no DOM node in state',
  k: 'Release notes and records: a Changeset names each package that ships a change, its category fits, and no gap row stays for a claim the change builds',
  l: 'Mergeable: the change merges into the base without conflicts',
};

const API_REPORT = /(?:^|\/)api-report\.md$/;
const LAB = /^packages\/lab\//;
const TEMPLATES = /^packages\/cli\/assets\/templates\//;
const NOT_PACKAGE_CODE =
  /\.stories\.[^/]+$|\.doc\.mjs$|\.md$|(?:^|\/)(?:package\.json|package-lock\.json|tsconfig[^/]*\.json)$|\/(?:scripts|test-utils)\//;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;
const DIRECTIVE = /Copyright|eslint-|@ts-|prettier-ignore|@pr-a11y/;

const publishedByRoot = new Map();

/** True when the nearest package manifest above `file` is not private. */
function isPublished(file) {
  let dir = path.posix.dirname(file);
  while (dir.startsWith('packages/')) {
    if (!publishedByRoot.has(dir)) {
      const manifest = path.join(ROOT, dir, 'package.json');
      publishedByRoot.set(
        dir,
        fs.existsSync(manifest)
          ? JSON.parse(fs.readFileSync(manifest, 'utf8')).private !== true
          : null,
      );
    }
    const published = publishedByRoot.get(dir);
    if (published != null) return published;
    dir = path.posix.dirname(dir);
  }
  return false;
}

/** Code or data a published package ships: not tests, stories, docs, or config. */
function isPublishedPackageCode(file) {
  return (
    isPackageReleasePath(file) &&
    !API_REPORT.test(file) &&
    !NOT_PACKAGE_CODE.test(file) &&
    isPublished(file)
  );
}

function isPackageSource(file) {
  return (
    file.startsWith('packages/') &&
    /\/src\//.test(file) &&
    isShippedSource(file) &&
    !file.endsWith('.doc.mjs') &&
    !TEMPLATES.test(file)
  );
}

/** The class a reviewer reads a changed path as. */
export function fileClass(file, classes) {
  if (classes.ownerGatedRecord) return 'record, owner-gated';
  if (classes.specRecord) return 'record';
  if (API_REPORT.test(file)) return 'API report';
  if (LAB.test(file)) return 'Lab';
  if (isPublishedPackageCode(file)) return 'published package code';
  if (file.startsWith('packages/')) return 'package file';
  return 'repository';
}

/**
 * The checklist items this change triggers, each with the reason. Item `d`
 * applies to every pull request.
 */
export function applicableChecks(files, diff) {
  const {addedByFile} = readDiff(diff);
  const classes = classifyPaths(files);
  const reasons = new Map([['d', 'every pull request is public']]);
  const note = (id, reason) => reasons.has(id) || reasons.set(id, reason);
  for (const file of files) {
    const lines = addedByFile[file] ?? [];
    const adds = pattern => lines.some(line => pattern.test(line));
    if (API_REPORT.test(file) && lines.length > 0) {
      note('a', `${file} has added or changed rows`);
      if (adds(/^\s*hook use[A-Z]/)) note('e', `${file} adds a hook row`);
      if (adds(/^\s*prop (?:\w+Behavior|(?:is|has)[A-Z]\w*)\??:/)) {
        note('c', `${file} adds a behavior or boolean prop row`);
      }
    }
    if (classes[file].ownerGatedRecord) note('g', `${file} is owner-gated`);
    if (isPublishedPackageCode(file)) {
      note('b', `${file} is published package code`);
      if (adds(/\b\w+Behavior\??\s*:/))
        note('c', `${file} adds a behavior prop`);
      if (/\/index\.tsx?$/.test(file) && adds(/^export\b.*\buse[A-Z]/)) {
        note('e', `${file} exports a hook`);
      }
    }
    if (
      isPackageSource(file) &&
      lines.some(line => COMMENT.test(line) && !DIRECTIVE.test(line))
    ) {
      note('f', `${file} adds comments`);
    }
  }
  return Object.keys(CHECKS)
    .filter(id => reasons.has(id))
    .map(id => ({id, check: CHECKS[id], reason: reasons.get(id)}));
}

function git(args) {
  return execFileSync('git', ['-C', ROOT, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** The working tree, read through the same interface as `gitTree`. */
function workingTree() {
  return {
    label: 'working tree',
    read(file) {
      try {
        return fs.readFileSync(path.join(ROOT, file), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

/** Paths `.gitattributes` at `source` marks `linguist-generated`. */
function generatedPaths(files, source) {
  const output = execFileSync(
    'git',
    [
      '-C',
      ROOT,
      'check-attr',
      ...(source ? [`--source=${source}`] : []),
      '--stdin',
      'linguist-generated',
    ],
    {encoding: 'utf8', input: files.join('\n') + '\n'},
  );
  const generated = new Set();
  for (const line of output.split('\n')) {
    const match = /^(.*): linguist-generated: (\S+)$/.exec(line);
    if (match && match[2] !== 'unspecified' && match[2] !== 'unset') {
      generated.add(match[1]);
    }
  }
  return generated;
}

/**
 * The paths that conflict when `head` merges into `base`, or `{error}`. The
 * merge writes its objects to a temporary store, so the repository is not
 * changed.
 */
export function mergeConflicts(base, head, root = ROOT) {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'review-pre-merge-'));
  const objects = execFileSync(
    'git',
    [
      '-C',
      root,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'objects',
    ],
    {encoding: 'utf8'},
  ).trim();
  try {
    execFileSync(
      'git',
      [
        '-C',
        root,
        'merge-tree',
        '--write-tree',
        '--name-only',
        '--no-messages',
        base,
        head,
      ],
      {
        encoding: 'utf8',
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_OBJECT_DIRECTORY: store,
          GIT_ALTERNATE_OBJECT_DIRECTORIES: objects,
        },
      },
    );
    return {conflicts: []};
  } catch (error) {
    if (error.status === 1) {
      return {conflicts: error.stdout.split('\n').slice(1).filter(Boolean)};
    }
    return {
      error: String(error.stderr || error.message)
        .trim()
        .split('\n')[0],
    };
  } finally {
    fs.rmSync(store, {recursive: true, force: true});
  }
}

function changedFiles(fork, head) {
  const tracked = parseNameStatus(
    git(['diff', '--name-status', '-M', fork, ...(head ? [head] : [])]),
  );
  if (head) return tracked;
  const untracked = git(['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean)
    .map(filename => ({filename, status: 'A'}));
  return [...tracked, ...untracked];
}

/** Global baseline claims at the merge base, for the records' own triggers. */
function globalBaselines(fork, headSha, triggers) {
  const args = [
    path.join(ROOT, 'scripts/review-global-baselines.mjs'),
    '--authority-commit',
    fork,
    '--review-head',
    headSha,
    '--triggers',
    triggers.join(','),
  ];
  if (triggers.length === 0) return {command: null, claims: []};
  const command = `node ${path.relative(ROOT, args[0])} ${args.slice(1).join(' ')}`;
  let result;
  try {
    result = JSON.parse(
      execFileSync(process.execPath, args, {encoding: 'utf8', stdio: 'pipe'}),
    );
  } catch (error) {
    const reason =
      /Error: (.*)/.exec(String(error.stderr))?.[1] ?? error.message;
    return {command, claims: [], error: reason};
  }
  const claims = [...result.matches, ...result.concernMatches].map(
    match => `${match.recordId} ${match.claimId}`,
  );
  return {command, claims: [...new Set(claims)].sort()};
}

/** Each checklist item that has findings, with its count. */
export function findingChecks(findings) {
  const counts = new Map();
  for (const {item} of findings) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => ({
      id,
      check: CHECKS[id],
      reason: `${count} finding${count === 1 ? '' : 's'} above`,
    }));
}

export function buildReport({
  base = 'origin/main',
  head = null,
  body = null,
} = {}) {
  const fork = git(['merge-base', base, head ?? 'HEAD']).trim();
  const headSha = git(['rev-parse', head ?? 'HEAD']).trim();
  const changes = changedFiles(fork, head);
  const files = [...new Set(changes.map(change => change.filename))].sort();
  if (files.length === 0) return {base, head: head ?? 'working tree', files};
  const diff = diffText(ROOT, head ? `${base}...${head}` : base);
  const classes = classifyPaths(files);
  const index = loadKnowledgeIndex(ROOT);
  const {addedLines, addedByFile, changedCountByFile} = readDiff(diff);
  const records = new Map();
  const linkedRecords = new Set();
  const claims = new Set();
  const triggers = new Set();
  for (const file of files) {
    const result = resolveSpecsForFile(index, path.join(ROOT, file), {
      addedLines,
    });
    for (const record of result.records) {
      records.set(record.id, record.path);
      if (file.startsWith('packages/') && !classes[file].specRecord) {
        linkedRecords.add(record.path);
      }
    }
    for (const decision of result.decisions) claims.add(decision.id);
    for (const match of result.concernClaims)
      claims.add(`${match.recordId} ${match.claimId}`);
    if (result.triggerSource.startsWith('component')) {
      for (const trigger of result.triggers) triggers.add(trigger);
    }
  }
  const headTree = head ? gitTree(ROOT, headSha) : workingTree();
  const readHead = file => headTree.read(file);
  const present = new Set(
    changes
      .filter(change => change.status?.[0] !== 'D')
      .map(change => change.filename),
  );
  const generated = generatedPaths(files, head ? headSha : null);
  const authoredLines = authoredLineCount(changedCountByFile, file =>
    generated.has(file),
  );
  const merge = mergeConflicts(base, head ?? 'HEAD');
  const coverage = checkCoverage({
    changes,
    base: gitTree(ROOT, fork),
    head: headTree,
  });
  const changesets = changedChangesets(changes, headTree);
  const recordPaths = [
    ...new Set([
      ...records.values(),
      ...files.filter(file => classes[file].specRecord && present.has(file)),
    ]),
  ];
  const findings = [
    ...sizeFindings(authoredLines, body),
    ...sharedOwnerFindings(addedLines),
    ...effectFindings(addedLines, readHead),
    ...changesetFindings({coverage, changesets}),
    ...recordGapFindings({
      records: recordPaths,
      changedFiles: present,
      addedByFile,
      linkedRecords,
      readHead,
    }),
    ...mergeFindings(merge.conflicts ?? [], base),
  ];
  return {
    base,
    head: head ?? 'working tree',
    mergeBase: fork,
    scope: classifyChanges(changes).reason,
    authoredLines,
    merge,
    findings,
    files: files.map(file => ({file, class: fileClass(file, classes[file])})),
    records: [...records].map(([id, recordPath]) => ({id, path: recordPath})),
    claims: [...claims].sort(),
    baselines: globalBaselines(fork, headSha, [...triggers].sort()),
    checks: [...applicableChecks(files, diff), ...findingChecks(findings)],
    checklist: CHECKLIST_LINK,
  };
}

export function formatReport(report) {
  if (report.files.length === 0) {
    return `No changes against ${report.base}...${report.head}.`;
  }
  const lines = [
    `Pre-review: ${report.base}...${report.head} (merge base ${report.mergeBase.slice(0, 12)})`,
    `Scope: ${report.scope}`,
    '',
    `Changed files (${report.files.length}):`,
    ...report.files.map(entry => `  ${entry.file}  [${entry.class}]`),
    '',
    'Governing records (read each one):',
    ...(report.records.length
      ? report.records.map(r => `  ${r.id}  ${r.path}`)
      : ['  none']),
    '',
    'Cited and concern-routed claims:',
    ...(report.claims.length
      ? report.claims.map(claim => `  ${claim}`)
      : ['  none']),
    '',
    'Global baseline claims at the merge base:',
    ...(report.baselines.command
      ? [
          `  ${report.baselines.command}`,
          ...(report.baselines.error
            ? [`  not run: ${report.baselines.error}`]
            : report.baselines.claims.map(claim => `  ${claim}`)),
        ]
      : [
          '  none: no linked component or module record declares review triggers',
        ]),
    '',
    `Authored lines: ${report.authoredLines} (limit ${SIZE_LIMIT}; lockfiles, snapshots, and generated files excluded)`,
    report.merge.error
      ? `Merge into ${report.base}: not checked: ${report.merge.error}`
      : `Merge into ${report.base}: ${report.merge.conflicts.length ? `${report.merge.conflicts.length} conflicting files` : 'clean'}`,
    '',
    `Findings in this change (${report.findings.length}):`,
    ...(report.findings.length
      ? report.findings.map(formatFinding)
      : ['  none']),
    '',
    'Checklist items that apply:',
    ...report.checks.map(
      item => `  [${item.id}] ${item.check}\n      because ${item.reason}`,
    ),
    '',
    `Checklist: ${report.checklist}`,
  ];
  return lines.join('\n');
}

export function formatFinding({item, file, line, rule, fix}) {
  const where = file ? `${file}${line ? `:${line}` : ''}  ` : '';
  return `  [${item}] ${where}${rule}\n      fix: ${fix}`;
}

/** The pull request description from `--body-file`, or from `gh` for `--pr`. */
function readBody(argv) {
  const file = valueFor(argv, '--body-file');
  if (file) return fs.readFileSync(file, 'utf8');
  const pr = valueFor(argv, '--pr');
  if (!pr) return null;
  try {
    return execFileSync(
      'gh',
      ['pr', 'view', pr, '--json', 'body', '-q', '.body'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch {
    console.error(
      `Could not read pull request ${pr} with gh; size declarations not checked.`,
    );
    return null;
  }
}

function valueFor(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${flag} requires a value.`);
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const report = buildReport({
    base: valueFor(argv, '--base') ?? 'origin/main',
    head: valueFor(argv, '--head'),
    body: readBody(argv),
  });
  console.log(
    argv.includes('--json')
      ? JSON.stringify(report, null, 2)
      : formatReport(report),
  );
}
