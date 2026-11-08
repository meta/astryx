#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The browser accessibility specs main added or changed since a pull
 *   request's merge base that select the pull request's changes but are not at
 *   its head.
 * @input `--base` (`git merge-base <main> <head>`), `--main`, `--head`,
 *   `--paths-file` (the pull request's changed paths, one per line) and
 *   `--labelled` when the pull request carries the accessibility run label,
 *   run from a checkout of main.
 * @output JSON `{"version": 1, "specs": [{"path", "reason", "scope"}]}`, where
 *   `reason` is `added-on-main` or `changed-on-main` and `scope` names what
 *   selects the spec; exit 0. Any other exit means the answer is unknown.
 * @position merge-guard reads it: a spec listed here never ran on the pull
 *   request's runs, which use the head's specs, so a non-empty list needs a
 *   fresh ref (update the branch) before the merge, as a file overlap does.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

import {planDependentAudits, readPrimitives} from './a11y-dependent-audits.mjs';
import {
  componentFolderOf,
  importerGraph,
  isRenderedSource,
  parseRouting,
  selectSpecs,
} from './a11y-pr-contracts.mjs';
import {isA11ySpecFile} from './lib/a11y-spec-files.mjs';

export const VERSION = 1;

/**
 * The components a pull request's changed paths touch: each changed source
 * file's component folder, and the component its file is named for.
 * @param {string[]} changedPaths
 */
export function touchedComponents(changedPaths) {
  const components = new Set();
  for (const file of changedPaths.filter(isRenderedSource)) {
    const folder = componentFolderOf(file);
    if (!folder) continue;
    components.add(folder);
    const named = /^([A-Z][A-Za-z0-9]*)\./.exec(file.split('/').pop() ?? '');
    if (named) components.add(`${folder.split('/')[0]}/${named[1]}`);
  }
  return [...components];
}

/**
 * Why a spec selects these changed paths, or null. An `audit` spec counts when
 * the change owes it, by the dependent-audit rule; every other mode by its own
 * routing lines, as a pull request's labelled run selects it.
 * @param {string} file
 * @param {string} source the spec's source on main
 * @param {string[]} changedPaths
 * @param {Set<string>} owedAudits the audit specs the change owes
 * @param {boolean} [labelled] the pull request carries the accessibility run
 *   label
 */
export function selectingScope(
  file,
  source,
  changedPaths,
  owedAudits,
  labelled = false,
) {
  const routing = parseRouting(source);
  // A pull request's own run runs an unchanged `always` spec only with the
  // accessibility run label.
  if (routing.mode === 'always') return labelled ? 'always' : null;
  if (routing.mode === 'audit') {
    return owedAudits.has(file)
      ? `owed audit of ${componentFolderOf(file)}`
      : null;
  }
  const [selected] = selectSpecs({
    specs: [{file, routing}],
    isPullRequest: true,
    changedPaths,
    components: touchedComponents(changedPaths),
    title: '',
  });
  return selected?.reason ?? null;
}

/**
 * The specs that need a fresh ref before the merge.
 * @param {{path: string, status: 'added' | 'changed', mainSource: string,
 *   headSource: string | null}[]} changedOnMain the spec files main added or
 *   changed since the merge base, with their source on main and at the head
 * @param {string[]} changedPaths the pull request's changed paths
 * @param {{primitives: string[], importers: Map<string, Set<string>>,
 *   labelled?: boolean}} graph main's shared primitives and import graph, for
 *   the audits a change owes, and whether the run label is on
 * @returns {{path: string, reason: string, scope: string}[]}
 */
export function overlappingSpecs(
  changedOnMain,
  changedPaths,
  {primitives, importers, labelled = false},
) {
  const routings = changedOnMain.map(spec => ({
    ...spec,
    routing: parseRouting(spec.mainSource),
  }));
  const {owed} = planDependentAudits({
    changed: changedPaths,
    primitives,
    specs: routings.map(({path, routing}) => ({
      file: path,
      mode: routing.mode,
    })),
    importers,
    seconds: {},
    attempt: 2,
  });
  const owedAudits = new Set(owed);
  const out = [];
  for (const {path, status, mainSource, headSource} of routings) {
    if (headSource === mainSource) continue;
    const scope = selectingScope(
      path,
      mainSource,
      changedPaths,
      owedAudits,
      labelled,
    );
    if (scope == null) continue;
    out.push({
      path,
      reason: status === 'added' ? 'added-on-main' : 'changed-on-main',
      scope,
    });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** A file's source at a commit, or null when the commit lacks it. */
function sourceAt(sha, file) {
  try {
    return git(['show', `${sha}:${file}`]);
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const value = name => {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
  };
  const base = value('--base');
  const mainSha = value('--main');
  const head = value('--head');
  const pathsFile = value('--paths-file');
  if (!base || !mainSha || !head || !pathsFile) {
    console.error(
      'usage: a11y-scope-overlap.mjs --base <git merge-base main head> --main <main> --head <head> --paths-file <file> [--labelled]',
    );
    process.exit(2);
  }
  const changedPaths = fs
    .readFileSync(pathsFile, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  // An empty list is an unknown change, never "no overlap".
  if (changedPaths.length === 0) {
    console.error(`${pathsFile} lists no changed path.`);
    process.exit(1);
  }
  const changedOnMain = git([
    'diff',
    '--name-status',
    '--no-renames',
    base,
    mainSha,
  ])
    .split('\n')
    .map(line => line.split('\t'))
    .filter(
      ([status, file]) => file && /^[AM]$/.test(status) && isA11ySpecFile(file),
    )
    .map(([status, file]) => ({
      path: file,
      status: status === 'A' ? 'added' : 'changed',
      mainSource: sourceAt(mainSha, file) ?? '',
      headSource: sourceAt(head, file),
    }));
  const root = process.cwd();
  const specs = overlappingSpecs(changedOnMain, changedPaths, {
    labelled: argv.includes('--labelled'),
    primitives: readPrimitives(root),
    importers: importerGraph(root),
  });
  console.log(JSON.stringify({version: VERSION, specs}));
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
