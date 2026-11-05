#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

/**
 * @file Hard completion contract for one RTL package-shard report.
 * @input --report <path> --package <canonical-name> --filter <csv-or-empty>
 * @output Exit zero only when requested scope and planned/completed scans match.
 * @position Boundary between soft RTL findings and the required `pr-rtl` join.
 */

function expectedFilters(filter) {
  return (filter ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

function sameIdentitySet(planned, completed) {
  if (
    !Array.isArray(planned) ||
    !Array.isArray(completed) ||
    planned.length === 0
  ) {
    return false;
  }
  if (
    new Set(planned).size !== planned.length ||
    new Set(completed).size !== completed.length
  ) {
    return false;
  }
  return (
    JSON.stringify([...planned].sort()) ===
    JSON.stringify([...completed].sort())
  );
}

function successfulResultIdentities(results) {
  if (!Array.isArray(results)) return null;
  const identities = [];
  for (const result of results) {
    if (
      result == null ||
      typeof result.component !== 'string' ||
      typeof result.storyId !== 'string' ||
      !['pass', 'fail', 'N-A'].includes(result.verdict)
    ) {
      return null;
    }
    identities.push(`${result.component}::${result.storyId}`);
  }
  return identities;
}

export function validateRtlReport(report, {packageName, filter = ''}) {
  const fail = message => ({ok: false, message});
  if (report == null || typeof report !== 'object' || Array.isArray(report)) {
    return fail('RTL shard report is not a JSON object');
  }
  if (
    !Array.isArray(report.scope?.packages) ||
    report.scope.packages.length !== 1 ||
    report.scope.packages[0] !== packageName
  ) {
    return fail(`RTL shard report package does not match ${packageName}`);
  }
  const filters = expectedFilters(filter);
  if (
    !Array.isArray(report.scope?.filters) ||
    JSON.stringify(report.scope.filters) !== JSON.stringify(filters)
  ) {
    return fail('RTL shard report filter scope does not match the request');
  }
  const completion = report.completion;
  if (
    !Number.isInteger(completion?.plannedComponentScans) ||
    completion.plannedComponentScans <= 0 ||
    completion.completedComponentScans !== completion.plannedComponentScans
  ) {
    return fail('RTL component scan count is missing or incomplete');
  }
  if (
    !Number.isInteger(completion?.plannedStoryScans) ||
    completion.plannedStoryScans <= 0 ||
    completion.completedPositionalScans !== completion.plannedStoryScans ||
    completion.completedDecorationScans !== completion.plannedStoryScans
  ) {
    return fail('RTL story scan count is missing, zero, or incomplete');
  }
  if (
    !sameIdentitySet(
      completion.plannedComponentIdentities,
      completion.completedComponentIdentities,
    )
  ) {
    return fail(
      'RTL component identity set is missing, duplicated, or substituted',
    );
  }
  if (
    !sameIdentitySet(
      completion.plannedD1Identities,
      completion.completedD1Identities,
    )
  ) {
    return fail('RTL D1 identity set is missing, duplicated, or substituted');
  }
  if (
    !sameIdentitySet(
      completion.plannedStoryIdentities,
      completion.completedPositionalIdentities,
    ) ||
    !sameIdentitySet(
      completion.plannedStoryIdentities,
      completion.completedDecorationIdentities,
    )
  ) {
    return fail(
      'RTL story identity set is missing, duplicated, or substituted',
    );
  }
  const d1Results = successfulResultIdentities(report.autoDiscovery?.results);
  if (
    d1Results == null ||
    !sameIdentitySet(completion.plannedD1Identities, d1Results) ||
    !sameIdentitySet(
      completion.plannedComponentIdentities,
      report.autoDiscovery.results.map(result => result.component),
    )
  ) {
    return fail('RTL D1 results are missing, unsuccessful, or out of scope');
  }
  const positionalResults = successfulResultIdentities(
    report.positionalMirror?.results,
  );
  if (
    positionalResults == null ||
    !sameIdentitySet(completion.plannedStoryIdentities, positionalResults)
  ) {
    return fail('RTL D5 results are missing, unsuccessful, or out of scope');
  }
  const decorationResults = successfulResultIdentities(
    report.directionalDecorations?.results,
  );
  if (
    decorationResults == null ||
    !sameIdentitySet(completion.plannedStoryIdentities, decorationResults)
  ) {
    return fail('RTL D6 results are missing, unsuccessful, or out of scope');
  }
  if (!Number.isInteger(report.coverage?.total) || report.coverage.total <= 0) {
    return fail('RTL coverage roster is empty');
  }
  if (report.coverage.registryError != null) {
    return fail(
      `RTL coverage registry failed: ${report.coverage.registryError}`,
    );
  }
  return {ok: true, message: `Completed RTL evidence for ${packageName}.`};
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(arg('report'), 'utf8'));
  } catch (error) {
    console.error(`Could not read RTL shard report: ${error.message}`);
    process.exitCode = 1;
  }
  if (report !== undefined) {
    const result = validateRtlReport(report, {
      packageName: arg('package'),
      filter: arg('filter') ?? '',
    });
    (result.ok ? console.log : console.error)(result.message);
    if (!result.ok) process.exitCode = 1;
  }
}
