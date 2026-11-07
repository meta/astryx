#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The dependent audits a shared primitive's change runs (spec:AST-030
 *   FR12).
 * @input The changed files, the shared primitives that
 *   `.github/a11y-shared-primitives.json` lists, the repository's source
 *   import graph, the `audit` specs, and their recorded times.
 * @output The `audit` specs of the components that use a changed primitive,
 *   split into at most three legs of about ten minutes each by recorded time.
 * @position The plan job writes the legs; each leg runs its share. An `audit`
 *   spec otherwise runs only in its own component-audit pull request and in the
 *   release check, so a change to a shared component such as Button could break
 *   a dependent's audit with no pull-request signal.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  componentFolderOf,
  fileSeconds,
  importerGraph,
  isRenderedSource,
  parseRouting,
  planLegs,
  renderingFolders,
} from './a11y-pr-contracts.mjs';
import {isA11ySpecFile} from './lib/a11y-spec-files.mjs';

export const PRIMITIVES_FILE = '.github/a11y-shared-primitives.json';
export const MAX_LEGS = 3;
const DURATIONS_FILE = '.github/a11y-contract-durations.json';

/**
 * The shared primitives, as `<package>/<Folder>`.
 * @param {string} root
 * @returns {string[]}
 */
export function readPrimitives(root) {
  const {primitives} = JSON.parse(
    fs.readFileSync(path.join(root, PRIMITIVES_FILE), 'utf8'),
  );
  if (!Array.isArray(primitives) || primitives.length === 0) {
    throw new Error(`${PRIMITIVES_FILE} lists no primitives`);
  }
  for (const primitive of primitives) {
    if (!/^[a-z][a-z0-9-]*\/[A-Z][A-Za-z0-9]*$/.test(primitive)) {
      throw new Error(
        `${PRIMITIVES_FILE}: not a component folder: ${primitive}`,
      );
    }
  }
  return primitives;
}

/**
 * The primitives whose own rendered source a change touches: a test, story,
 * doc or note in the folder renders nothing.
 * @param {string[]} primitives
 * @param {string[]} changed
 */
export function changedPrimitives(primitives, changed) {
  const touched = new Set(
    changed.filter(isRenderedSource).map(componentFolderOf).filter(Boolean),
  );
  return primitives.filter(primitive => touched.has(primitive));
}

/**
 * The `audit` specs of the given component folders.
 * @param {{file: string, mode: string}[]} specs
 * @param {Set<string>} folders
 */
export function dependentAudits(specs, folders) {
  return specs
    .filter(
      ({file, mode}) =>
        mode === 'audit' && folders.has(componentFolderOf(file)),
    )
    .map(({file}) => file)
    .sort();
}

/** Every browser accessibility spec file in the tree, with its routing mode. */
export function listAuditSpecs(root) {
  return execFileSync('git', ['ls-files', '--', 'packages'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(isA11ySpecFile)
    .map(file => ({
      file,
      mode: parseRouting(fs.readFileSync(path.join(root, file), 'utf8')).mode,
    }));
}

/**
 * The legs for a change: the audits of the changed primitives and of the
 * component folders that render them.
 * @param {object} options
 * @param {string[]} options.changed
 * @param {string[]} options.primitives
 * @param {{file: string, mode: string}[]} options.specs
 * @param {Map<string, Set<string>>} options.importers
 * @param {Record<string, number>} options.seconds
 * @param {number} [options.maxLegs]
 */
export function planDependentAudits({
  changed,
  primitives,
  specs,
  importers,
  seconds,
  maxLegs = MAX_LEGS,
}) {
  const touched = changedPrimitives(primitives, changed);
  if (touched.length === 0) {
    return {primitives: [], files: [], count: 0, shares: [], longestMs: 0};
  }
  const folders = new Set([
    ...touched,
    ...renderingFolders(importers, touched).map(({folder}) => folder),
  ]);
  const files = dependentAudits(specs, folders);
  if (files.length === 0) {
    return {primitives: touched, files, count: 0, shares: [], longestMs: 0};
  }
  const legs = planLegs(files, seconds, maxLegs);
  return {primitives: touched, files, ...legs};
}

function main() {
  const argv = process.argv.slice(2);
  const value = name => {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
  };
  const root = process.cwd();
  const changedFile = value('--changed');
  const out = value('--out');
  if (!changedFile || !out) {
    console.error(
      'usage: a11y-dependent-audits.mjs --changed <file> --out <file>',
    );
    process.exit(2);
  }
  // Without the changed files the primitives a change touches are unknown,
  // and a missed audit would read as passed.
  if (!fs.existsSync(changedFile)) {
    console.error(`::error::The changed-file list ${changedFile} is missing.`);
    process.exit(1);
  }
  const changed = fs
    .readFileSync(changedFile, 'utf8')
    .split('\n')
    .filter(Boolean);
  const plan = planDependentAudits({
    changed,
    primitives: readPrimitives(root),
    specs: listAuditSpecs(root),
    importers: importerGraph(root),
    seconds: fileSeconds(
      JSON.parse(fs.readFileSync(path.join(root, DURATIONS_FILE), 'utf8')),
    ),
  });
  fs.writeFileSync(out, `${JSON.stringify(plan)}\n`);
  if (plan.primitives.length === 0) {
    console.log(
      'This change touches no shared primitive; no dependent audit runs.',
    );
  } else {
    const minutes = (plan.longestMs / 60000).toFixed(1);
    console.log(
      `Shared primitives changed: ${plan.primitives.join(', ')}. ${plan.files.length} dependent audit spec files in ${plan.count} leg(s), the longest leg's recorded time ${minutes} min.`,
    );
    for (const file of plan.files) console.log(`  ${file}`);
    if (plan.longestMs > 10 * 60 * 1000) {
      console.log(
        `::warning title=Dependent audits over ten minutes::${plan.count} legs still leave ${minutes} min of recorded time in one leg.`,
      );
    }
  }
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `count=${plan.count}\nshares=${JSON.stringify(plan.shares)}\n`,
    );
  }
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
