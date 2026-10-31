#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Published package size: measure a built workspace, or compare a pull
 *   request's measurement with its merge base's.
 * @input `measure --output <file> [--root <dir>]`: a workspace whose packages
 *   are built.
 *   `compare --head <file> [--base <file>] --output <file>
 *   [--summary <file>] [--head-sha <sha>] [--base-sha <sha>]`: two
 *   measurements (a missing or unreadable base compares nothing).
 * @output `measure` writes each published package's sizes and runtime
 *   dependencies. `compare` writes the comparison, appends it to the job
 *   summary, and flags (never fails) a package over its budget.
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
    headSha: getArg('head-sha') || '',
    baseSha: getArg('base-sha') || '',
  });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  const markdown = renderPackageSizeSection(report);
  const summary = getArg('summary');
  if (summary) fs.appendFileSync(summary, markdown);
  console.log(markdown);
  if (report.verdict === 'over-budget')
    console.log(
      '::warning title=Package size over budget::A published package grew past its advisory budget. If the growth is not intended, shrink it; if it is, say why in the pull request description.',
    );
} else {
  console.error(
    'usage: package-size.mjs measure --output <file> | compare --head <file> [--base <file>] --output <file>',
  );
  process.exitCode = 2;
}
