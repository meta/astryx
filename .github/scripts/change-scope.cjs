// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global console, module, process, require */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {isComponentSpecRecordPath} = require('./knowledge-paths.cjs');

/**
 * Classifies changed paths without reading PR-controlled content.
 *
 * A spec-only PR may change only spec records. Templates, schemas, indexes,
 * architecture, guidance, audits, workflows, and code deliberately do not
 * qualify.
 */

const SPEC_RECORD_PATTERNS = [
  /^docs\/specs\/[^/]+\/(?:spec|plan)\.md$/,
  /^docs\/families\/(?!README\.md$)[^/]+\.md$/,
  /^docs\/design\/(?!README\.md$)(?!assets\/)[^/]+\.md$/,
  /^packages\/themes\/([^/]+)\/\1\.spec\.md$/,
];

const CHANGESET_PATTERN = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;

const SURFACES = Object.freeze({
  KNOWLEDGE: 'knowledge',
  DOCSITE: 'docsite',
  NODE_TOOLING: 'node-tooling',
  SHARED_OR_UNKNOWN: 'shared-or-unknown',
});

const RUNTIME_PACKAGE_SURFACES = Object.freeze([
  ['packages/core/', 'runtime:core'],
  ['packages/lab/', 'runtime:lab'],
  ['packages/charts/', 'runtime:charts'],
  ['packages/richtext/', 'runtime:richtext'],
  ['packages/vega/', 'runtime:vega'],
  ['packages/cli/', 'runtime:cli'],
  ['packages/build/', 'runtime:build'],
]);

const STORYBOOK_VISUAL_PATTERNS = [
  /^apps\/storybook\//,
  /^\.github\/scripts\/(?:accessibility-audit|story-play-guard|visual-scope)\./,
  /^\.github\/scripts\/visual-gate\//,
];

const THEME_BUILD_PATTERNS = [
  /^packages\/themes\//,
  /^packages\/build\//,
  /^packages\/core\/src\/theme\//,
];

// Tooling admission is exact and dependency-reviewed. Do not widen this to all
// of scripts/: that directory also owns generated public artifacts, package
// builds, releases, and other shared infrastructure.
const NODE_TOOLING_PATHS = new Set([
  'scripts/score-ledger.mjs',
  'scripts/score-ledger.test.mjs',
  '.github/workflows/crowdin-upload.yml',
]);

// Inside a runtime package, files every component's tests or build read:
// manifests, build and test configuration, shared test setup. A change to one
// runs the full suite, like any shared-or-unknown or theme-build path.
const PACKAGE_INFRA_PATTERNS = [
  /^packages\/[^/]+\/package\.json$/,
  /^packages\/[^/]+\/[^/]*\.config\.[^/]+$/,
  /^packages\/[^/]+\/tsconfig[^/]*\.json$/,
  /^packages\/[^/]+\/src\/(?:test-utils|testing|__mocks__)\//,
  /^packages\/[^/]+\/src\/[^/]*setup[^/]*\.[^/]+$/i,
  /^apps\/storybook\/\.storybook\//,
  /^internal\//,
  // A package's root scripts are build configuration (its Babel plugins).
  /^packages\/[^/]+\/[^/]+\.(?:c|m)?js$/,
];

// Surfaces a pull request's tests can be scoped to by the import graph (the
// components and modules it changed, and what imports them). Anything else,
// or any infrastructure path above, runs the full suite; Node tooling keeps
// its whole Node project (spec:AST-030 FR8).
const SCOPABLE_SURFACES = new Set([
  SURFACES.KNOWLEDGE,
  SURFACES.DOCSITE,
  'storybook-visual',
  ...RUNTIME_PACKAGE_SURFACES.map(([, surface]) => surface),
]);

function isSharedInfraPath(filePath) {
  // A Changeset records release notes; no test or build reads it.
  if (CHANGESET_PATTERN.test(filePath)) return false;
  return (
    PACKAGE_INFRA_PATTERNS.some(pattern => pattern.test(filePath)) ||
    surfacesForPath(filePath).some(surface => !SCOPABLE_SURFACES.has(surface))
  );
}

const THEME_DOC_CANDIDATE = /^docs\/themes\/(?!README\.md$)[^/]+\.md$/;
const THEME_PACKAGE_CANDIDATE =
  /^packages\/themes\/[^/]+\/(?:.*\/)?[^/]+\.spec\.md$/;

const KNOWLEDGE_RECORD_PATTERNS = [
  ...SPEC_RECORD_PATTERNS,
  THEME_DOC_CANDIDATE,
  THEME_PACKAGE_CANDIDATE,
  /^docs\/architecture\/(?!README\.md$)[^/]+\.md$/,
  /^docs\/design\/assets\//,
];

function isSpecRecordPath(filePath) {
  return (
    isComponentSpecRecordPath(filePath) ||
    SPEC_RECORD_PATTERNS.some(pattern => pattern.test(filePath))
  );
}

function isPackageReleasePath(filePath) {
  if (!filePath.startsWith('packages/') || isSpecRecordPath(filePath)) {
    return false;
  }
  if (
    /(?:^|\/)(?:test|tests|test-utils|__tests__|__fixtures__|__snapshots__)\//.test(
      filePath,
    ) ||
    /\.test\.[^/]+$/.test(filePath) ||
    /\.audit\.json$/.test(filePath)
  ) {
    return false;
  }
  return true;
}

function isKnowledgeRecordPath(filePath) {
  return (
    isSpecRecordPath(filePath) ||
    KNOWLEDGE_RECORD_PATTERNS.some(pattern => pattern.test(filePath))
  );
}

function isNodeToolingPath(filePath) {
  return (
    NODE_TOOLING_PATHS.has(filePath) || filePath.startsWith('internal/scripts/')
  );
}

function surfacesForPath(filePath) {
  if (isSpecRecordPath(filePath)) return [SURFACES.KNOWLEDGE];
  if (filePath.startsWith('apps/docsite/')) return [SURFACES.DOCSITE];
  if (isNodeToolingPath(filePath)) return [SURFACES.NODE_TOOLING];

  const surfaces = [];
  const runtimePackage = RUNTIME_PACKAGE_SURFACES.find(([root]) =>
    filePath.startsWith(root),
  );
  if (runtimePackage) surfaces.push(runtimePackage[1]);
  if (THEME_BUILD_PATTERNS.some(pattern => pattern.test(filePath))) {
    surfaces.push('theme-build');
  }
  if (STORYBOOK_VISUAL_PATTERNS.some(pattern => pattern.test(filePath))) {
    surfaces.push('storybook-visual');
  }
  return surfaces.length > 0 ? surfaces : [SURFACES.SHARED_OR_UNKNOWN];
}

function normalizeChange(change) {
  if (typeof change === 'string') {
    return {filename: change, previous_filename: null, status: null};
  }
  return {
    filename: change.filename,
    previous_filename: change.previous_filename ?? null,
    status: change.status ?? null,
  };
}

function classifyChanges(changes, {expectedCount} = {}) {
  const normalized = changes
    .map(normalizeChange)
    .filter(change => change.filename);
  if (normalized.length === 0) {
    const complete = expectedCount == null || expectedCount === 0;
    return {
      specOnly: false,
      toolingOnly: false,
      touchesKnowledgeRecords: !complete,
      touchesDesignAssets: false,
      specChangesetConflict: false,
      docsiteOnly: false,
      // No paths to scope from runs everything (spec:AST-030 FR4).
      fullSuite: true,
      surfaces: complete ? [] : [SURFACES.SHARED_OR_UNKNOWN],
      complete,
      reason: complete ? 'no changed files' : 'changed-file list is incomplete',
    };
  }
  const complete = expectedCount == null || normalized.length === expectedCount;

  const allPaths = normalized.flatMap(change =>
    change.previous_filename
      ? [change.filename, change.previous_filename]
      : [change.filename],
  );
  const surfaces = [
    ...new Set(allPaths.flatMap(surfacesForPath)),
    ...(!complete ? [SURFACES.SHARED_OR_UNKNOWN] : []),
  ].sort();
  const touchesKnowledgeRecords =
    !complete || allPaths.some(isKnowledgeRecordPath);
  const touchesDesignAssets = allPaths.some(filePath =>
    filePath.startsWith('docs/design/assets/'),
  );
  const hasSpecRecord = allPaths.some(isSpecRecordPath);
  // Only an exact in-place M can represent correcting already-pending release
  // metadata. Added, deleted, renamed (in either direction), or status-unknown
  // Changesets stay fail-closed so a spec-only change cannot create, remove, or
  // park a package release.
  const hasNonModificationChangeset = normalized.some(change => {
    const touchesChangeset =
      CHANGESET_PATTERN.test(change.filename) ||
      (change.previous_filename != null &&
        CHANGESET_PATTERN.test(change.previous_filename));
    return (
      touchesChangeset &&
      (change.status !== 'M' || change.previous_filename != null)
    );
  });
  const hasPackageReleaseChange = allPaths.some(isPackageReleasePath);
  const specChangesetConflict =
    complete &&
    hasSpecRecord &&
    hasNonModificationChangeset &&
    !hasPackageReleaseChange;
  const exactSurface = surface =>
    complete && surfaces.length === 1 && surfaces[0] === surface;
  const specOnly = exactSurface(SURFACES.KNOWLEDGE);
  const docsiteOnly = exactSurface(SURFACES.DOCSITE);
  const toolingOnly = exactSurface(SURFACES.NODE_TOOLING);
  // An incomplete list, or any shared infrastructure, runs everything.
  const fullSuite = !complete || allPaths.some(isSharedInfraPath);
  return {
    specOnly,
    toolingOnly,
    touchesKnowledgeRecords,
    touchesDesignAssets,
    specChangesetConflict,
    docsiteOnly,
    fullSuite,
    surfaces,
    complete,
    reason: !complete
      ? 'changed-file list is incomplete'
      : specOnly
        ? 'only spec records changed'
        : docsiteOnly
          ? 'only docsite files changed'
          : toolingOnly
            ? 'only admitted Node tooling changed'
            : 'changes include another surface',
  };
}

function parseNameStatus(input) {
  return input
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const fields = line.split('\t');
      const status = fields[0];
      if (/^[RC]/.test(status) && fields.length >= 3) {
        return {
          filename: fields[2],
          previous_filename: fields[1],
          status,
        };
      }
      return {filename: fields[1] ?? fields[0], status};
    });
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  const result = classifyChanges(parseNameStatus(fs.readFileSync(0, 'utf8')));
  if (result.specChangesetConflict) {
    console.error(
      'Pure spec-record changes must not add a Changeset; they do not release packages.',
    );
    process.exitCode = 1;
  } else if (process.argv.includes('--github-output')) {
    const outputPath = process.env.GITHUB_OUTPUT;
    if (!outputPath)
      throw new Error('GITHUB_OUTPUT is required with --github-output.');
    fs.appendFileSync(
      outputPath,
      `spec_only=${result.specOnly}\ndocsite_only=${result.docsiteOnly}\ntooling_only=${result.toolingOnly}\nfull_suite=${result.fullSuite}\n`,
    );
  } else {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}

module.exports = {
  NODE_TOOLING_PATHS,
  SURFACES,
  classifyChanges,
  isKnowledgeRecordPath,
  isNodeToolingPath,
  isPackageReleasePath,
  isSharedInfraPath,
  isSpecRecordPath,
  parseNameStatus,
};
