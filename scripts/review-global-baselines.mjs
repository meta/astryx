// Copyright (c) Meta Platforms, Inc. and affiliates.

/* global console, process */
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  collectConcernMatches,
  collectGlobalReviewMatches,
  readKnowledgeRecordsAtAuthority,
} from './check-knowledge.mjs';
import {readDiff} from './lib/review-diff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');

function valueFor(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

const root = path.resolve(valueFor('--root') ?? DEFAULT_ROOT);
const authorityCommit = valueFor('--authority-commit');
const reviewHead = valueFor('--review-head');
const triggerValue = valueFor('--triggers');

if (!authorityCommit) {
  throw new Error(
    '--authority-commit requires the full base authority commit.',
  );
}
if (!/^[0-9a-f]{40}$/.test(authorityCommit)) {
  throw new Error(
    '--authority-commit must be a full 40-character commit hash.',
  );
}
if (!reviewHead) {
  throw new Error('--review-head requires the full reviewed commit.');
}
if (!/^[0-9a-f]{40}$/.test(reviewHead)) {
  throw new Error('--review-head must be a full 40-character commit hash.');
}
if (!triggerValue) {
  throw new Error('--triggers requires a comma-separated trigger list.');
}

const requestedTriggers = triggerValue
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
if (requestedTriggers.length === 0) {
  throw new Error('--triggers requires at least one trigger.');
}

const {records, authority} = readKnowledgeRecordsAtAuthority(
  root,
  authorityCommit,
  reviewHead,
);
const matches = collectGlobalReviewMatches(
  records,
  requestedTriggers,
  authority,
);
// The reviewed change's own added lines route the claims of every concern
// they re-implement (architecture:knowledge-contracts/INV20), whatever the
// caller's triggers or the component record's review_triggers.
const {addedLines} = readDiff(
  execFileSync(
    'git',
    ['-C', root, 'diff', '--no-color', '--no-ext-diff', authority, reviewHead],
    {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024},
  ),
);
const concernMatches = collectConcernMatches(records, addedLines, authority);
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      authorityCommit,
      reviewHead,
      requestedTriggers: [...new Set(requestedTriggers)].sort(),
      matches,
      concernMatches,
    },
    null,
    2,
  ),
);
