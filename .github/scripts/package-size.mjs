#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Published package size: measure a built workspace, or compare a pull
 *   request's measurement with its merge base's.
 * @input `measure --output <file> [--root <dir>]`: a workspace whose packages
 *   are built.
 *   `compare --head <file> [--base <file>] [--body <file>] --output <file>
 *   [--summary <file>] [--head-sha <sha>] [--base-sha <sha>]`: two
 *   measurements (a missing or unreadable base compares nothing) and the pull
 *   request description.
 *   `enforce --report <file>`: a comparison `compare` wrote.
 * @output `measure` writes each published package's sizes and runtime
 *   dependencies. `compare` writes the comparison and appends it to the job
 *   summary. `enforce` exits 1 when a package is over budget and the
 *   description has no `Size budget:` line; it runs after the report's
 *   artifacts are uploaded, so a failing check still gets its PR report.
 * @position CI's build-storybook job measures and compares a pull request's
 *   head; Main's typecheck job measures each main commit and keeps it for 14
 *   days as the base. The PR report renders the comparison.
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {
  measurePackages,
  comparePackageSizes,
  renderPackageSizeSection,
} = require('./lib/package-size.js');

const [command, ...args] = process.argv.slice(2);
const getArg = name => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 ? args[index + 1] : null;
};

function readJson(file) {
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readText(file) {
  if (!file) return '';
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

if (command === 'measure') {
  const output = getArg('output');
  if (!output) throw new Error('measure needs --output <file>');
  const measurement = await measurePackages(getArg('root') || process.cwd());
  fs.writeFileSync(output, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(
    `Measured ${Object.keys(measurement.packages).length} published packages.`,
  );
} else if (command === 'compare') {
  const output = getArg('output');
  const head = readJson(getArg('head'));
  if (!output || !head)
    throw new Error('compare needs --head <file> and --output <file>');
  const base = readJson(getArg('base'));
  if (getArg('base') && !base)
    console.log(
      '::notice::No base measurement for the merge base; sizes are shown without a budget.',
    );
  const report = comparePackageSizes({
    head,
    base,
    body: readText(getArg('body')),
    headSha: getArg('head-sha') || '',
    baseSha: getArg('base-sha') || '',
  });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  const markdown = renderPackageSizeSection(report);
  const summary = getArg('summary');
  if (summary) fs.appendFileSync(summary, markdown);
  console.log(markdown);
} else if (command === 'enforce') {
  const report = readJson(getArg('report'));
  if (!report) throw new Error('enforce needs a readable --report <file>');
  if (report.verdict === 'over-budget') {
    console.log(
      '::error title=Package size over budget::A published package grew past its budget. Shrink it, or add a "Size budget:" line to the pull request description saying why, then re-run this job.',
    );
    process.exitCode = 1;
  } else {
    console.log(`Package size verdict: ${report.verdict}.`);
  }
} else {
  console.error(
    'usage: package-size.mjs measure --output <file> | compare --head <file> [--base <file>] [--body <file>] --output <file> | enforce --report <file>',
  );
  process.exitCode = 2;
}
