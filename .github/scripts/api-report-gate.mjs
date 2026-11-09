#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fail a pull request whose committed API report is behind its build.
 * @input  `--changes` api-changes.json from `api:report --changes`,
 *         `--changed-files` (the scope action's list), `--decided`,
 *         `--truncated`, `--summary`, `--packages` (a JSON package list; the
 *         published packages by default)
 * @output A GitHub error per stale report in scope and a summary table. Exit 0,
 *         1 for a stale report, or 2 when it can read no package list
 * @position CI check of architecture:public-component-api INV24 in the
 *           build-storybook job, beside the advisory API changes
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  publishedPackages,
  REPORT_FILE,
  SHARED_INPUTS,
} from '../../scripts/api-report/cli.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const within = (file, dir) => file === dir || file.startsWith(`${dir}/`);

/**
 * The packages whose report this pull request can change: those whose folder
 * it changes, or every package when it changes an input every report reads.
 * An undecided or truncated scope, or no file list, checks every package.
 */
export function packagesInScope({
  packages,
  sharedInputs,
  changedFiles,
  decided,
  truncated,
}) {
  if (!decided || truncated || !Array.isArray(changedFiles)) return packages;
  if (
    changedFiles.some(file => sharedInputs.some(input => within(file, input)))
  )
    return packages;
  return packages.filter(p => changedFiles.some(file => within(file, p.dir)));
}

/** The packages in scope whose committed report differs from the build. */
export function stalePackages({changes, inScope}) {
  const byName = new Map(
    (Array.isArray(changes?.packages) ? changes.packages : []).map(c => [
      c.pkg,
      c,
    ]),
  );
  return inScope
    .filter(p => {
      const c = byName.get(p.name);
      return c && (c.stale === true || c.missing === true);
    })
    .map(p => ({...p, ...byName.get(p.name)}))
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

export const failureLine = p =>
  `The committed API report for ${p.name} is behind this pull request's build. Run \`pnpm api:report\` and commit ${p.dir}/${REPORT_FILE}.`;

function summaryTable(stale) {
  return [
    '### Committed API reports',
    '',
    "| Package | Rows behind | Of them, this pull request's |",
    '| --- | --- | --- |',
    ...stale.map(
      p =>
        `| \`${p.name}\` | ${p.missing ? 'no report' : (p.staleRows ?? 0)} | ${p.staleOwnRows ?? 0} |`,
    ),
    '',
    'Run `pnpm api:report` and commit each listed report.',
    '',
  ].join('\n');
}

/** Without api-changes.json, the report command checks each package itself. */
function checkWithoutChanges(inScope) {
  const stale = [];
  for (const p of inScope) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'scripts/api-report/cli.mjs'),
        '--check',
        '--package',
        p.dir,
      ],
      {cwd: REPO_ROOT, stdio: 'inherit'},
    );
    if (result.status !== 0) stale.push(p);
  }
  return stale;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const arg = name => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? null : args[i + 1];
  };
  let packages;
  try {
    packages = arg('packages')
      ? JSON.parse(fs.readFileSync(arg('packages'), 'utf8'))
      : publishedPackages(REPO_ROOT);
  } catch (error) {
    console.error(`api-report-gate: no package list (${error.message})`);
    process.exit(2);
  }
  const listFile = arg('changed-files');
  const changedFiles =
    listFile && fs.existsSync(listFile)
      ? fs.readFileSync(listFile, 'utf8').split('\n').filter(Boolean)
      : null;
  const inScope = packagesInScope({
    packages,
    sharedInputs: SHARED_INPUTS,
    changedFiles,
    decided: arg('decided') === 'true',
    truncated: arg('truncated') === 'true',
  });
  const changes = readJson(arg('changes') ?? 'api-changes.json');
  const stale = changes
    ? stalePackages({changes, inScope})
    : checkWithoutChanges(inScope);
  console.log(
    `Committed API reports checked: ${inScope.length} of ${packages.length} package(s); behind: ${stale.length}.`,
  );
  if (!stale.length) return;
  for (const p of stale)
    console.log(
      `::error file=${p.dir}/${REPORT_FILE},title=API report behind this build::${failureLine(p)}`,
    );
  const summary = arg('summary');
  if (summary) fs.appendFileSync(summary, summaryTable(stale));
  process.exit(1);
}

// Real paths: a linked checkout still runs the check.
if (
  process.argv[1] &&
  fs.realpathSync(path.resolve(process.argv[1])) ===
    fs.realpathSync(fileURLToPath(import.meta.url))
)
  main();
