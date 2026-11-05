#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import componentPackages from '../../scripts/component-packages.cjs';

/**
 * @file Strict per-package scope resolver for the pull-request RTL matrix.
 * @input Trusted classifier booleans, one canonical package, and analysis.json.
 * @output GitHub step outputs describing whether and how that shard must run.
 * @position Hard-fail setup step before the soft audit-findings step.
 */

const {COMPONENT_PACKAGE_NAMES, packageHasPublicComponent} = componentPackages;
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const HARNESS_SMOKE_OWNERS = {
  lab: ['lab/Chart'],
  charts: ['charts/Chart', 'charts/ChartLegend'],
};

function ownerArray(analysis, qualifiedKey, legacyKey) {
  const qualified = analysis[qualifiedKey];
  if (qualified != null) {
    if (
      !Array.isArray(qualified) ||
      qualified.some(value => typeof value !== 'string')
    ) {
      throw new Error(`${qualifiedKey} must be an array of strings`);
    }
    return {owners: qualified, qualified: true};
  }
  const legacy = analysis[legacyKey] ?? [];
  if (
    !Array.isArray(legacy) ||
    legacy.some(value => typeof value !== 'string')
  ) {
    throw new Error(`${legacyKey} must be an array of strings`);
  }
  return {owners: legacy, qualified: false};
}

function isCanonicalOwner(owner) {
  const separator = owner.indexOf('/');
  if (separator <= 0 || owner.indexOf('/', separator + 1) !== -1) return false;
  const packageName = owner.slice(0, separator);
  const componentName = owner.slice(separator + 1);
  return (
    COMPONENT_PACKAGE_NAMES.includes(packageName) &&
    packageHasPublicComponent(PROJECT_ROOT, packageName, componentName)
  );
}

export function readAnalysis(analysisPath) {
  let analysis;
  try {
    analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read analysis artifact: ${error.message}`, {
      cause: error,
    });
  }
  if (
    analysis == null ||
    typeof analysis !== 'object' ||
    Array.isArray(analysis)
  ) {
    throw new Error('Analysis artifact must be a JSON object');
  }
  const added = ownerArray(analysis, 'newComponentOwners', 'newComponents');
  const modified = ownerArray(
    analysis,
    'modifiedComponentOwners',
    'modifiedComponents',
  );
  // Reverse dependents of a changed shared module are audited too
  // (spec:AST-030 FR13); the field is optional for older artifacts.
  const dependents = analysis.dependentComponentOwners ?? [];
  if (
    !Array.isArray(dependents) ||
    dependents.some(value => typeof value !== 'string')
  ) {
    throw new Error('dependentComponentOwners must be an array of strings');
  }
  const owners = [...added.owners, ...modified.owners, ...dependents];
  if (
    analysis.forceFullComponentAudits !== undefined &&
    typeof analysis.forceFullComponentAudits !== 'boolean'
  ) {
    throw new Error('Analysis forceFullComponentAudits must be a boolean');
  }
  if (owners.some(owner => owner.includes('\n') || owner.includes('\r'))) {
    throw new Error('Analysis owner values must not contain line breaks');
  }
  const qualified = added.qualified && modified.qualified;
  return {
    owners,
    qualified,
    forceFullComponentAudits: analysis.forceFullComponentAudits === true,
    invalidOwners: qualified
      ? owners.filter(owner => !isCanonicalOwner(owner))
      : [],
  };
}

export function resolveRtlShardScope({
  packageName,
  forceFull,
  hasComponents,
  hasHarness,
  analysis,
}) {
  if (!COMPONENT_PACKAGE_NAMES.includes(packageName)) {
    throw new Error(`Invalid canonical package name: ${packageName}`);
  }
  const full = reason => ({
    shouldRun: true,
    components: `full ${packageName} roster`,
    filter: '',
    reason,
  });
  if (forceFull) return full('policy-sensitive scope');
  if (analysis.forceFullComponentAudits) {
    return full('unresolved canonical component source');
  }
  if ((analysis.invalidOwners ?? []).length > 0) {
    return full('noncanonical component scope');
  }
  if (!analysis.qualified && analysis.owners.length > 0) {
    return full('unqualified component scope');
  }
  if (analysis.owners.length === 0 && hasComponents) {
    return full('unresolved component scope');
  }
  if (analysis.owners.length === 0 && hasHarness) {
    const owners = HARNESS_SMOKE_OWNERS[packageName] ?? [];
    return owners.length > 0
      ? {
          shouldRun: true,
          components: owners.join(','),
          filter: owners.join(','),
          reason: 'routing smoke scope',
        }
      : {
          shouldRun: false,
          components: '',
          filter: '',
          reason: 'no routing-smoke owner in package',
        };
  }
  if (analysis.owners.length > 0) {
    const owners = analysis.owners.filter(owner =>
      owner.startsWith(`${packageName}/`),
    );
    return owners.length > 0
      ? {
          shouldRun: true,
          components: [...new Set(owners)].join(','),
          filter: [...new Set(owners)].join(','),
          reason: 'changed owner scope',
        }
      : {
          shouldRun: false,
          components: '',
          filter: '',
          reason: 'no changed owner in package',
        };
  }
  return {
    shouldRun: false,
    components: '',
    filter: '',
    reason: 'no component or RTL harness changes',
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

function writeGithubOutputs(outputPath, scope) {
  if (!outputPath) throw new Error('--github-output is required');
  fs.appendFileSync(
    outputPath,
    [
      `should_run=${scope.shouldRun}`,
      `components=${scope.components}`,
      `filter=${scope.filter}`,
      `reason=${scope.reason}`,
      '',
    ].join('\n'),
  );
}

function writeScopeManifest(manifestPath, packageName, scope) {
  if (!manifestPath) return;
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        package: packageName,
        shouldRun: scope.shouldRun,
        filter: scope.filter,
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const analysis = readAnalysis(arg('analysis'));
    const packageName = arg('package');
    const scope = resolveRtlShardScope({
      packageName,
      forceFull: booleanArg('force-full'),
      hasComponents: booleanArg('has-components'),
      hasHarness: booleanArg('has-harness'),
      analysis,
    });
    writeGithubOutputs(arg('github-output'), scope);
    writeScopeManifest(arg('manifest'), packageName, scope);
    console.log(`${scope.reason}: ${scope.components || 'not applicable'}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
