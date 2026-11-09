#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The audits a pull request's change owes (spec:AST-030 FR12).
 * @input The changed files, the shared primitives that
 *   `.github/a11y-shared-primitives.json` lists, the repository's source
 *   import graph, the `audit` specs, and their recorded times.
 * @output The `audit` specs of each changed component, then of each changed
 *   primitive and the components that use it; this run's legs, at most three
 *   of about ten minutes on a first run; and the record merge-guard reads:
 *   owed, ran, deferred, complete.
 * @position The plan job writes the legs and the record; each leg runs its
 *   share. An `audit` spec otherwise runs only in its own component-audit pull
 *   request and in the release check.
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
  LEG_BUDGET_MS,
  parseRouting,
  planLegs,
  renderingFolders,
} from './a11y-pr-contracts.mjs';
import {costOf, splitByDuration} from '../../scripts/lib/duration-split.mjs';
import {isA11ySpecFile} from './lib/a11y-spec-files.mjs';

export const PRIMITIVES_FILE = '.github/a11y-shared-primitives.json';
export const MAX_LEGS = 3;
/** A later run at the same head runs every owed audit, in up to six legs. */
export const LATER_MAX_LEGS = 6;
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
 * Legs for the files, each about ten minutes or less when `maxLegs` allows:
 * like `planLegs`, with one more leg at a time while the longest is over.
 * @param {string[]} files
 * @param {Record<string, number>} seconds
 * @param {number} maxLegs
 */
export function fitLegs(files, seconds, maxLegs) {
  const cost = costOf(files, seconds);
  const split = (/** @type {number} */ count) => {
    const shares = splitByDuration(files, count, cost);
    return {
      count,
      shares,
      longestMs: Math.max(
        ...shares.map(
          share => share.reduce((total, file) => total + cost(file), 0) * 1000,
        ),
      ),
    };
  };
  const most = Math.max(1, Math.min(maxLegs, files.length));
  let plan = split(Math.min(planLegs(files, seconds, maxLegs).count, most));
  while (plan.longestMs > budgetFor(files, seconds) && plan.count < most) {
    plan = split(plan.count + 1);
  }
  return plan;
}

/**
 * A leg's budget for these files: ten minutes, or the longest single file's
 * recorded time when one file alone is longer.
 * @param {string[]} files
 * @param {Record<string, number>} seconds
 */
export function budgetFor(files, seconds) {
  const cost = costOf(files, seconds);
  return Math.max(LEG_BUDGET_MS, ...files.map(file => cost(file) * 1000));
}

/**
 * The component folders whose own rendered source a change touches.
 * @param {string[]} changed
 */
export function changedComponents(changed) {
  return [
    ...new Set(
      changed.filter(isRenderedSource).map(componentFolderOf).filter(Boolean),
    ),
  ].sort();
}

/**
 * The audits a change owes and this run's legs. A changed component's own
 * audits come first, then each changed primitive's and those of the folders
 * that render it, nearest first. A first run fits what it can into
 * {@link MAX_LEGS} legs of about ten minutes and names the rest as deferred; a
 * later run at the same head runs every owed audit, in up to
 * {@link LATER_MAX_LEGS} legs.
 * @param {object} options
 * @param {string[]} options.changed
 * @param {string[]} options.primitives
 * @param {{file: string, mode: string}[]} options.specs
 * @param {Map<string, Set<string>>} options.importers
 * @param {Record<string, number>} options.seconds
 * @param {number} [options.attempt] the run's attempt; 1 for its first run
 * @param {boolean} [options.everything] the changed files are unknown (a diff
 *   GitHub truncates, or a scope that could not be read) and everything is in
 *   scope: every audit is owed, the run fits what it can, and the record is
 *   never complete
 */
export function planDependentAudits({
  changed,
  primitives,
  specs,
  importers,
  seconds,
  attempt = 1,
  everything = false,
}) {
  if (everything) return planEverything(specs, seconds);
  const components = changedComponents(changed);
  const touched = changedPrimitives(primitives, changed);
  const order = [
    ...components,
    ...touched,
    ...renderingFolders(importers, touched).map(({folder}) => folder),
  ];
  /** @type {string[]} */
  const owed = [];
  for (const folder of order) {
    for (const file of dependentAudits(specs, new Set([folder]))) {
      if (!owed.includes(file)) owed.push(file);
    }
  }
  const base = {components, primitives: touched, owed};
  if (owed.length === 0) {
    return {
      ...base,
      files: [],
      deferred: [],
      complete: true,
      count: 0,
      shares: [],
      longestMs: 0,
    };
  }
  if (attempt > 1) {
    const legs = fitLegs(owed, seconds, LATER_MAX_LEGS);
    return {...base, files: owed, deferred: [], complete: true, ...legs};
  }
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const deferred = [];
  for (const file of owed) {
    const fits =
      fitLegs([...files, file], seconds, MAX_LEGS).longestMs <=
      budgetFor([...files, file], seconds);
    (fits || files.length === 0 ? files : deferred).push(file);
  }
  const legs = fitLegs(files, seconds, MAX_LEGS);
  return {...base, files, deferred, complete: deferred.length === 0, ...legs};
}

/**
 * An undecided scope's plan: every audit is owed; one run fits what it can
 * and lists the rest; it is never complete.
 * @param {{file: string, mode: string}[]} specs
 * @param {Record<string, number>} seconds
 */
function planEverything(specs, seconds) {
  const owed = specs
    .filter(spec => spec.mode === 'audit')
    .map(({file}) => file)
    .sort();
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const deferred = [];
  for (const file of owed) {
    const fits =
      fitLegs([...files, file], seconds, MAX_LEGS).longestMs <=
      budgetFor([...files, file], seconds);
    (fits || files.length === 0 ? files : deferred).push(file);
  }
  return {
    components: [],
    primitives: [],
    owed,
    files,
    deferred,
    complete: false,
    everything: true,
    ...fitLegs(files, seconds, MAX_LEGS),
  };
}

export const TOO_LARGE = 'diff too large to scope (>3,000 files); split the PR';
export const UNDECIDED =
  'the changed files could not be read; re-run all jobs at this head';

/**
 * What an undecided scope's run says: a truncated file list needs a split,
 * any other undecided scope a re-run.
 * @param {{deferred: string[]}} plan
 * @param {boolean} truncated
 */
export function undecidedMessage(plan, truncated) {
  const why = truncated ? TOO_LARGE : UNDECIDED;
  const title = truncated ? 'Diff too large to scope' : 'Scope not decided';
  return {
    annotation: `::error title=${title}::${why}. ${plan.deferred.length} owed audit spec files do not run, so merge-guard does not merge this head.`,
    summary: `${why}. Not run (${plan.deferred.length}):`,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const value = name => {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
  };
  const root = process.cwd();
  const changedFile = value('--changed');
  const everything = argv.includes('--all');
  const truncated = argv.includes('--truncated');
  const out = value('--out');
  const attempt = Number(value('--attempt') ?? '1');
  if (
    (!changedFile && !everything) ||
    !out ||
    !Number.isInteger(attempt) ||
    attempt < 1
  ) {
    console.error(
      'usage: a11y-dependent-audits.mjs (--changed <file> | --all) --out <file> [--attempt <run attempt>]',
    );
    process.exit(2);
  }
  // Without the changed files the audits a change owes are unknown, and a
  // missed audit would read as passed.
  if (!everything && !fs.existsSync(changedFile)) {
    console.error(`::error::The changed-file list ${changedFile} is missing.`);
    process.exit(1);
  }
  const changed = everything
    ? []
    : fs.readFileSync(changedFile, 'utf8').split('\n').filter(Boolean);
  const plan = planDependentAudits({
    changed,
    primitives: readPrimitives(root),
    specs: listAuditSpecs(root),
    importers: importerGraph(root),
    seconds: fileSeconds(
      JSON.parse(fs.readFileSync(path.join(root, DURATIONS_FILE), 'utf8')),
    ),
    attempt,
    everything,
  });
  // The record merge-guard reads: what this change owes, what this run ran,
  // and whether that is every owed audit.
  const record = {
    head: process.env.ASTRYX_HEAD_SHA ?? '',
    attempt,
    owed: plan.owed,
    ran: plan.files,
    deferred: plan.deferred,
    complete: plan.complete,
    // Why the scope is undecided, so a reader can say "split" or "re-run".
    ...(plan.everything
      ? {undecided: truncated ? 'truncated' : 'unreadable'}
      : {}),
  };
  fs.writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  if (plan.owed.length === 0) {
    console.log('This change owes no audit; no dependent audit runs.');
  } else {
    const minutes = (plan.longestMs / 60000).toFixed(1);
    console.log(
      `Changed components: ${plan.components.join(', ') || 'none'}. Shared primitives changed: ${plan.primitives.join(', ') || 'none'}.`,
    );
    console.log(
      `This run (attempt ${attempt}) runs ${plan.files.length} of ${plan.owed.length} owed audit spec files in ${plan.count} leg(s), the longest leg's recorded time ${minutes} min:`,
    );
    for (const file of plan.files) console.log(`  ${file}`);
    if (plan.everything) {
      console.log(undecidedMessage(plan, truncated).annotation);
    } else if (plan.deferred.length > 0) {
      console.log(
        `::warning title=Audits not yet run::${plan.deferred.length} owed audit spec files do not fit three legs of ten minutes. Re-run all jobs at this head to run every owed audit; merge-guard merges only on a run that ran them all.`,
      );
      console.log('Not yet run:');
      for (const file of plan.deferred) console.log(`  ${file}`);
    }
  }
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `count=${plan.count}`,
        `shares=${JSON.stringify(plan.shares)}`,
        `owed=${JSON.stringify(plan.owed)}`,
        `ran=${JSON.stringify(plan.files)}`,
        `deferred=${JSON.stringify(plan.deferred)}`,
        `complete=${plan.complete}`,
        '',
      ].join('\n'),
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY && plan.owed.length > 0) {
    const list = files => files.map(file => `- \`${file}\``).join('\n');
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Dependent audits\n\nRan (${plan.files.length}):\n\n${list(plan.files)}\n\n` +
        (plan.everything
          ? `${undecidedMessage(plan, truncated).summary}\n\n${list(plan.deferred)}\n`
          : plan.deferred.length
            ? `Not yet run (${plan.deferred.length}); re-run all jobs at this head:\n\n${list(plan.deferred)}\n`
            : 'Every owed audit ran.\n'),
    );
  }
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
