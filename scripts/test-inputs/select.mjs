// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which file-reading tests a pull request's change can reach, by the
 *   inputs Main's full unit run recorded for each (spec:AST-030 FR13).
 * @input The record (scripts/test-inputs/merge.mjs), the tests a pull request
 *   would otherwise run because they read the file system, and the changed
 *   paths: the pull request's own and those between the record's commit and
 *   the pull request's base.
 * @output The tests to run and the tests left out.
 * @position .github/scripts/fs-guard-tests.mjs narrows its file-system guards
 *   with it on a pull request's Node legs. Node built-ins only.
 */

import path from 'node:path';

/**
 * Paths whose change can alter what any test reads or how it runs: the
 * install, CI, the test setup and the build configuration. A change to one
 * runs every file-reading test.
 */
export const RUNS_EVERY_TEST = [
  /(^|\/)package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.npmrc$/,
  /^\.nvmrc$/,
  /^\.github\//,
  /^vitest\.[^/]*$/,
  /^internal\/test-utils\//,
  /^packages\/cli\/test-utils\//,
  /^scripts\/test-inputs\//,
  /^scripts\/vitest-[^/]*$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)(babel|vite|tsup|rollup|postcss|eslint)\.config\.[^/]*$/,
  /^scripts\/build-[^/]*$/,
];

/** The first changed path that runs every file-reading test, or null. */
export function changeThatRunsEveryTest(changed) {
  return (
    changed.find(file => RUNS_EVERY_TEST.some(rule => rule.test(file))) ?? null
  );
}

/** The folder a repository path sits in, as the record names folders. */
export const folderOf = file => {
  const dir = path.posix.dirname(file);
  return dir === '' ? '.' : dir;
};

/**
 * Why a test runs, or null when no changed path is one of its inputs.
 * @param {string} test
 * @param {{folders: string[], listed: string[], trees: string[], unseen: string[]} | undefined} entry
 * @param {string[]} changed
 */
export function whyTestRuns(test, entry, changed) {
  if (entry == null) return 'it has no record';
  if (entry.unseen.length > 0)
    return `its record cannot see all it reads (it ${entry.unseen[0]})`;
  if (changed.includes(test)) return 'the change changes it';
  const folders = new Set(entry.folders);
  for (const file of changed) {
    if (folders.has(folderOf(file))) return `it reads beside ${file}`;
    const listed = entry.listed.find(
      dir => dir === '.' || file.startsWith(`${dir}/`),
    );
    if (listed != null) return `it lists ${listed}, which holds ${file}`;
    const tree = entry.trees.find(root => file.startsWith(root));
    if (tree != null) return `it reads what is built from ${tree}`;
  }
  return null;
}

/**
 * Splits `tests` into those a change reaches through their recorded inputs
 * and those it cannot reach.
 * @param {string[]} tests
 * @param {{tests: Record<string, {folders: string[], listed: string[], trees: string[], unseen: string[]}>}} record
 * @param {string[]} changed
 */
export function selectByInputs(tests, record, changed) {
  const everything = changeThatRunsEveryTest(changed);
  if (everything != null) {
    return {run: [...tests], skipped: [], reason: `${everything} changed`};
  }
  const run = [];
  const skipped = [];
  for (const test of tests) {
    if (whyTestRuns(test, record.tests[test], changed) == null)
      skipped.push(test);
    else run.push(test);
  }
  return {run, skipped, reason: null};
}
