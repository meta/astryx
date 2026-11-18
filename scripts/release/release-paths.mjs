// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared release-branch path classification.
 *
 * @input  git diff --name-status entries
 * @output generated bump, test repair, or invalid release-branch classification
 * @position trusted base policy shared by release validation and CI scope routing
 */

import fs from 'node:fs';

const RELEASE_OUTPUT_PATTERNS = [
  /^packages\/(?:[^/]+|themes\/[^/]+)\/package\.json$/,
  /^packages\/(?:[^/]+|themes\/[^/]+)\/CHANGELOG\.md$/,
  /^packages\/cli\/assets\/codemods\/registry\.mjs$/,
  /^packages\/cli\/assets\/codemods\/__tests__\/registry\.test\.mjs$/,
  /^packages\/cli\/assets\/codemods\/transforms\/(?:next|v\d+\.\d+\.\d+)\//,
  /^pnpm-lock\.yaml$/,
];

const RELEASE_TEST_REPAIR_PATTERNS = [
  /(?:^|\/)__tests__\//,
  /\.(?:spec|test)\.[cm]?[jt]sx?$/,
  /^internal\/interaction-harness\//,
];

function isReleaseOutputPath(file) {
  return RELEASE_OUTPUT_PATTERNS.some(pattern => pattern.test(file));
}

function isReleaseTestRepairPath(file) {
  return (
    !file.startsWith('apps/docsite/') &&
    !isReleaseOutputPath(file) &&
    RELEASE_TEST_REPAIR_PATTERNS.some(pattern => pattern.test(file)) &&
    !file.includes('/__snapshots__/') &&
    !file.endsWith('.snap')
  );
}

function diffEntryFiles(entry) {
  const [status, ...files] = entry.split('\t');
  const isMove = status?.startsWith('R') || status?.startsWith('C');
  const expectedPaths = isMove ? 2 : 1;
  return !status || files.length !== expectedPaths || files.some(file => !file)
    ? null
    : files;
}

function classifyReleaseDiff(entries) {
  if (entries.length === 0) return 'invalid';
  const files = entries.map(diffEntryFiles);
  if (files.some(entryFiles => entryFiles === null)) return 'invalid';
  const paths = files.flat();
  if (paths.every(isReleaseTestRepairPath)) return 'test-repair';
  if (
    paths.every(
      file => file.startsWith('.changeset/') || isReleaseOutputPath(file),
    )
  ) {
    return 'version-bump';
  }
  return 'invalid';
}

if (process.argv.includes('--classify')) {
  const entries = fs
    .readFileSync(0, 'utf8')
    .split('\n')
    .filter(Boolean);
  console.log(classifyReleaseDiff(entries));
}

export {
  classifyReleaseDiff,
  diffEntryFiles,
  isReleaseOutputPath,
  isReleaseTestRepairPath,
};
