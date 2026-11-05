#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import componentPackages from '../../scripts/component-packages.cjs';

const {COMPONENT_PACKAGE_NAMES} = componentPackages;

/**
 * @file Fail-closed join policy for the pull-request RTL package matrix.
 * @input --check-components <result> --shards <result> --should-run <boolean>
 *   --force-full <trusted-boolean> --reports-dir <path>
 * @output A successful exit only when classification succeeded and every
 *   canonical shard declared scope and every applicable package produced its
 *   own report.
 * @position Stable `pr-rtl` required-context join.
 */

function filesNamed(root, name) {
  if (!root || !fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === name) files.push(entryPath);
    if (!entry.isDirectory()) continue;
    for (const child of fs.readdirSync(entryPath, {withFileTypes: true})) {
      if (child.isFile() && child.name === name) {
        files.push(path.join(entryPath, child.name));
      }
    }
  }
  return files;
}

export function readShardEvidence(reportsDir) {
  const scopes = [];
  const reports = [];
  const errors = [];
  for (const file of filesNamed(reportsDir, 'rtl-shard-scope.json')) {
    try {
      const scope = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (
        !COMPONENT_PACKAGE_NAMES.includes(scope.package) ||
        typeof scope.shouldRun !== 'boolean' ||
        typeof scope.filter !== 'string'
      ) {
        throw new Error('invalid package, shouldRun, or filter');
      }
      scopes.push({
        package: scope.package,
        shouldRun: scope.shouldRun,
        filter: scope.filter,
      });
    } catch (error) {
      errors.push(`invalid scope manifest ${file}: ${error.message}`);
    }
  }
  for (const file of filesNamed(reportsDir, 'rtl-audit-report.json')) {
    try {
      const report = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (
        !Array.isArray(report.scope?.packages) ||
        report.scope.packages.length !== 1 ||
        !COMPONENT_PACKAGE_NAMES.includes(report.scope.packages[0])
      ) {
        throw new Error('invalid package scope');
      }
      reports.push(report.scope.packages[0]);
    } catch (error) {
      errors.push(`invalid shard report ${file}: ${error.message}`);
    }
  }
  scopes.sort(
    (a, b) =>
      COMPONENT_PACKAGE_NAMES.indexOf(a.package) -
      COMPONENT_PACKAGE_NAMES.indexOf(b.package),
  );
  reports.sort(
    (a, b) =>
      COMPONENT_PACKAGE_NAMES.indexOf(a) - COMPONENT_PACKAGE_NAMES.indexOf(b),
  );
  return {scopes, reports, errors};
}

function sameSet(expected, actual) {
  return (
    new Set(expected).size === expected.length &&
    new Set(actual).size === actual.length &&
    JSON.stringify([...expected].sort()) === JSON.stringify([...actual].sort())
  );
}

export function evaluateRtlJoin({
  checkComponentsResult,
  shardResult,
  shouldRun,
  forceFull = false,
  evidence = {scopes: [], reports: [], errors: []},
}) {
  if (checkComponentsResult !== 'success') {
    return {
      ok: false,
      message: `component classification did not succeed: ${checkComponentsResult}`,
    };
  }
  if (forceFull && !shouldRun) {
    return {
      ok: false,
      message: 'Trusted full scope was not scheduled.',
    };
  }
  if (shouldRun) {
    if (shardResult !== 'success') {
      return {
        ok: false,
        message: `RTL package shards did not all succeed: ${shardResult}`,
      };
    }
    if (evidence.errors.length > 0) {
      return {ok: false, message: evidence.errors.join('; ')};
    }
    const scopePackages = evidence.scopes.map(scope => scope.package);
    if (!sameSet(COMPONENT_PACKAGE_NAMES, scopePackages)) {
      return {
        ok: false,
        message:
          'RTL shard scope manifests are missing, duplicated, or unexpected.',
      };
    }
    if (
      forceFull &&
      evidence.scopes.some(scope => !scope.shouldRun || scope.filter !== '')
    ) {
      return {
        ok: false,
        message: 'Trusted full scope was narrowed by a package shard.',
      };
    }
    const expectedReports = evidence.scopes
      .filter(scope => scope.shouldRun)
      .map(scope => scope.package);
    if (expectedReports.length === 0) {
      return {
        ok: false,
        message: 'RTL scope required work, but every package shard skipped.',
      };
    }
    if (!sameSet(expectedReports, evidence.reports)) {
      return {
        ok: false,
        message: 'RTL shard reports do not match the applicable package set.',
      };
    }
    return {
      ok: true,
      message: 'All applicable RTL package shards produced reports.',
    };
  }
  // Out of scope, each shard job either did not start or decided its own
  // scope and did no work, reporting success with no manifest or report. The
  // shard and merge jobs can land on different sides (`skipped/success`).
  const parts = String(shardResult ?? '').split('/');
  const noOpShards =
    parts.every(part => part === 'skipped' || part === 'success') &&
    evidence.scopes.length === 0 &&
    evidence.reports.length === 0;
  return shardResult === 'skipped' || noOpShards
    ? {
        ok: true,
        message: 'No RTL-owned scope; package shards did no RTL work.',
      }
    : {
        ok: false,
        message: `RTL shards unexpectedly ran for an out-of-scope change: ${shardResult}`,
      };
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function booleanArg(name) {
  const value = arg(name);
  if (value !== 'true' && value !== 'false') {
    throw new Error(`--${name} must be true or false`);
  }
  return value === 'true';
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = evaluateRtlJoin({
      checkComponentsResult: arg('check-components'),
      shardResult: arg('shards'),
      shouldRun: booleanArg('should-run'),
      forceFull: booleanArg('force-full'),
      evidence: readShardEvidence(arg('reports-dir')),
    });
    (result.ok ? console.log : console.error)(result.message);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
