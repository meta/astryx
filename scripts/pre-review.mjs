#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pre-review report: what a reviewer checks in a change, before review.
 * @input `--base <ref>` (default `origin/main`), an optional `--head <ref>`
 *   (default: the working tree, with uncommitted and untracked files), `--json`.
 * @output The changed files and their class, the governing records and routed
 *   claims, and the checklist items that apply to this change.
 * @position `pnpm review:pre`. The checklist it names is in
 *   `docs/contributing/pull-requests.md`. SYNC: keep `CHECKS` in step with it.
 */
/* global console, process */
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isShippedSource, readDiff} from './lib/review-diff.mjs';
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
  e: 'New public hook: a hook doc and a template block that names the hook in exampleFor or alsoExampleFor',
  f: 'Comments: new or changed source comments explain only non-obvious work, in Simplified Technical English',
  g: 'Records: a changed record needs a spec owner to approve the exact head',
};

const API_REPORT = /(?:^|\/)api-report\.md$/;
const LAB = /^packages\/lab\//;
const TEMPLATES = /^packages\/cli\/assets\/templates\//;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;
const DIRECTIVE = /Copyright|eslint-|@ts-|prettier-ignore|@pr-a11y/;

/** Each file's added lines, from a unified diff. */
export function addedLinesByFile(diff) {
  const byFile = new Map();
  let file = null;
  for (const line of diff.split('\n')) {
    const header = /^diff --git a\/\S+ b\/(\S+)/.exec(line);
    if (header) {
      file = header[1];
      byFile.set(file, byFile.get(file) ?? []);
    } else if (file && line.startsWith('+') && !line.startsWith('+++ ')) {
      byFile.get(file).push(line.slice(1));
    }
  }
  return byFile;
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
  if (isPackageSource(file)) return 'package source';
  if (isPackageReleasePath(file)) return 'package file';
  return 'repository';
}

/**
 * The checklist items this change triggers, each with the reason. Item `d`
 * applies to every pull request.
 */
export function applicableChecks(files, diff) {
  const added = addedLinesByFile(diff);
  const classes = classifyPaths(files);
  const reasons = new Map([['d', 'every pull request is public']]);
  const note = (id, reason) => reasons.has(id) || reasons.set(id, reason);
  for (const file of files) {
    const lines = added.get(file) ?? [];
    if (API_REPORT.test(file) && lines.length > 0) {
      note('a', `${file} has added or changed rows`);
      if (lines.some(line => /^\s*hook use[A-Z]/.test(line))) {
        note('e', `${file} adds a hook row`);
      }
      if (
        lines.some(line =>
          /^\s*prop (?:\w+Behavior|(?:is|has)[A-Z]\w*)\??:/.test(line),
        )
      ) {
        note('c', `${file} adds a behavior or boolean prop row`);
      }
    }
    if (classes[file].ownerGatedRecord) note('g', `${file} is owner-gated`);
    if (!isPackageSource(file)) continue;
    if (!LAB.test(file)) {
      note('b', `${file} is published package source`);
      if (lines.some(line => /\b\w+Behavior\??\s*:/.test(line))) {
        note('c', `${file} adds a behavior prop`);
      }
      if (
        /\/index\.tsx?$/.test(file) &&
        lines.some(line => /^export\b.*\buse[A-Z]/.test(line))
      ) {
        note('e', `${file} exports a hook`);
      }
    }
    if (lines.some(line => COMMENT.test(line) && !DIRECTIVE.test(line))) {
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

export function buildReport({base = 'origin/main', head = null} = {}) {
  const fork = git(['merge-base', base, head ?? 'HEAD']).trim();
  const headSha = git(['rev-parse', head ?? 'HEAD']).trim();
  const changes = changedFiles(fork, head);
  const files = [...new Set(changes.map(change => change.filename))].sort();
  if (files.length === 0) return {base, head: head ?? 'working tree', files};
  const diff = diffText(ROOT, head ? `${base}...${head}` : base);
  const classes = classifyPaths(files);
  const index = loadKnowledgeIndex(ROOT);
  const {addedLines} = readDiff(diff);
  const records = new Map();
  const claims = new Set();
  const triggers = new Set();
  for (const file of files) {
    const result = resolveSpecsForFile(index, path.join(ROOT, file), {
      addedLines,
    });
    for (const record of result.records) records.set(record.id, record.path);
    for (const decision of result.decisions) claims.add(decision.id);
    for (const match of result.concernClaims)
      claims.add(`${match.recordId} ${match.claimId}`);
    if (result.triggerSource.startsWith('component')) {
      for (const trigger of result.triggers) triggers.add(trigger);
    }
  }
  return {
    base,
    head: head ?? 'working tree',
    mergeBase: fork,
    scope: classifyChanges(changes).reason,
    files: files.map(file => ({file, class: fileClass(file, classes[file])})),
    records: [...records].map(([id, recordPath]) => ({id, path: recordPath})),
    claims: [...claims].sort(),
    baselines: globalBaselines(fork, headSha, [...triggers].sort()),
    checks: applicableChecks(files, diff),
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
    'Checklist items that apply:',
    ...report.checks.map(
      item => `  [${item.id}] ${item.check}\n      because ${item.reason}`,
    ),
    '',
    `Checklist: ${report.checklist}`,
  ];
  return lines.join('\n');
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
  });
  console.log(
    argv.includes('--json')
      ? JSON.stringify(report, null, 2)
      : formatReport(report),
  );
}
