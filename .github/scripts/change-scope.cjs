// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global console, module, process, require */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  isComponentSpecRecordPath,
  isOwnerGatedPath,
  isPlatformComponentSpecPath,
} = require('./knowledge-paths.cjs');

/**
 * Classifies changed paths. It reads no pull-request content as code: the
 * only content it reads is GitHub's patch text for a Lab component's three
 * entry files, as data (spec:AST-030 FR26).
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

// The experimental Lab package: a change only here (and its release notes)
// runs the Lab tests and the Storybook build (spec:AST-030 FR26).
const LAB_ROOT = 'packages/lab/';

// A new Lab component also adds its routes, its CLI discovery entry and its
// Storybook story. These three files still count toward a Lab-only change when
// their diff names only Lab components the change itself carries. The diff is
// read as data (GitHub's patch text, never run); a missing patch, or any line
// the checks do not recognize, keeps the change out of the Lab-only lane.
const ROUTES_LOCK = 'internal/shadcn-registry/routes.lock.json';
const OFFICIAL_PACKAGES = 'packages/cli/assets/discover/official-packages.json';
const LAB_STORY =
  /^apps\/storybook\/stories\/([A-Z][A-Za-z0-9]*)\.stories\.tsx$/;
const LAB_COMPONENT_DIR = /^packages\/lab\/src\/([A-Z][A-Za-z0-9]*)\//;

// The registry's route slug for a component name. It mirrors
// slugifyRegistryName in apps/docsite/src/lib/shadcnRegistry.mjs (a test pins
// the two equal): the trusted classifier loads no docsite module.
function labRouteSlug(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

// The changed lines of a unified diff, without the file headers.
function changedLines(patch) {
  return patch
    .split('\n')
    .filter(line => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line))
    .map(line => ({
      sign: line[0],
      text: line.slice(1).trim().replace(/,$/, ''),
    }));
}

function routesLockNamesLabOnly(patch, slugs) {
  const ownSlug = value =>
    [...slugs].some(
      slug =>
        value === `components/lab/${slug}` ||
        value.startsWith(`examples/${slug}/`) ||
        value.startsWith(`showcases/${slug}/`),
    );
  const ownName = value =>
    [...slugs].some(
      slug =>
        value === `component-lab-${slug}` ||
        value.startsWith(`example-${slug}-`) ||
        value.startsWith(`showcase-${slug}-`),
    );
  const lines = changedLines(patch);
  return (
    lines.length > 0 &&
    lines.every(({text}) => {
      if (['{', '}', ']', '"aliases": []', '"aliases": ['].includes(text))
        return true;
      const name = /^"name": "([^"]+)"$/.exec(text);
      if (name) return ownName(name[1]);
      const route = /^"path": "([^"]+)"$/.exec(text);
      if (route) return ownSlug(route[1]);
      const alias = /^"([^"]+)"$/.exec(text);
      return (
        alias != null &&
        /^components\/lab\//.test(alias[1]) &&
        ownSlug(alias[1])
      );
    })
  );
}

// The Lab package's line range in the base's official-packages.json.
function labPackageLines(baseText) {
  const lines = baseText.split('\n');
  const start = lines.findIndex(line =>
    line.includes('"package": "@astryxdesign/lab"'),
  );
  if (start === -1) return null;
  const next = lines.findIndex(
    (line, index) => index > start && line.includes('"package": "'),
  );
  return {first: start + 1, last: next === -1 ? lines.length : next};
}

function officialPackagesNamesLabOnly(patch, names, baseText) {
  if (typeof baseText !== 'string') return false;
  const range = labPackageLines(baseText);
  if (range == null) return false;
  const hunks = [
    ...patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm),
  ];
  if (hunks.length === 0) return false;
  // Every hunk edits inside the Lab package's entry of the base file.
  const inLab = hunks.every(([, start, count = '1']) => {
    const first = Number(start);
    const last = first + Math.max(Number(count), 1) - 1;
    return first > range.first && last < range.last;
  });
  const lines = changedLines(patch);
  return (
    inLab &&
    lines.length > 0 &&
    lines.every(({text}) => {
      if (['{', '}', '"kind": "component"'].includes(text)) return true;
      const name = /^"name": "([^"]+)"$/.exec(text);
      return name != null && names.has(name[1]);
    })
  );
}

function storyImportsLab(patch) {
  const added = patch
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++ '))
    .map(line => line.slice(1))
    .join('\n');
  return /from '@astryxdesign\/lab(?:\/[^']*)?';/.test(added);
}

/**
 * Whether a Lab entry file's change belongs to the Lab components this change
 * carries (spec:AST-030 FR26). `names` are the Lab component folders the change
 * touches; `patches` maps a path to GitHub's patch text; `officialPackagesBase`
 * is the base's official-packages.json.
 */
function isLabEntryChange(change, {names, patches, officialPackagesBase}) {
  const patch = patches?.[change.filename];
  if (
    typeof patch !== 'string' ||
    patch === '' ||
    change.previous_filename != null
  )
    return false;
  const slugs = new Set([...names].map(labRouteSlug));
  if (change.filename === ROUTES_LOCK)
    return routesLockNamesLabOnly(patch, slugs);
  if (change.filename === OFFICIAL_PACKAGES)
    return officialPackagesNamesLabOnly(patch, names, officialPackagesBase);
  const story = LAB_STORY.exec(change.filename);
  // Only a new story: its whole text is in the patch.
  return (
    story != null &&
    change.status === 'A' &&
    names.has(story[1]) &&
    storyImportsLab(patch)
  );
}

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

// Shared infrastructure only Vitest's module graph reaches: the interaction
// harness and the repository's lint plugin, both ES modules. A change there
// still runs every other owner as shared infrastructure (the interaction
// proofs included), but the Vitest lanes run the tests that import it and the
// guards that read sources (spec:AST-030 FR13). Scripts stay shared: package
// scripts run generators whose output tests read, and Vitest's graph does not
// follow `require`.
const VITEST_GRAPH_INFRA_PATTERNS = [
  /^internal\/interaction-harness\//,
  /^internal\/eslint-plugin-astryx\//,
];

function isVitestGraphInfraPath(filePath) {
  return VITEST_GRAPH_INFRA_PATTERNS.some(pattern => pattern.test(filePath));
}

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

function isSpecRecordPath(filePath) {
  return (
    isComponentSpecRecordPath(filePath) ||
    // A platform record (`<Root>/<PublicName>.swift.spec.md`) is a component
    // record for its language, gated like the core record beside it.
    isPlatformComponentSpecPath(filePath) ||
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

/**
 * A path the spec-owner gate decides (knowledge-paths.cjs's owner-gated
 * paths): every record, every Markdown file in a record location, and the
 * normative design assets.
 */
function isKnowledgeRecordPath(filePath) {
  return isOwnerGatedPath(filePath);
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

function classifyChanges(
  changes,
  {expectedCount, patches = null, officialPackagesBase = null} = {},
) {
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
      labOnly: false,
      // No paths to scope from runs everything (spec:AST-030 FR4).
      fullSuite: true,
      vitestFullSuite: true,
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
  // Every changed path is in the Lab package, besides Changesets, which no
  // test or build reads, and the Lab entry files of the Lab components the
  // change carries (spec:AST-030 FR26).
  const labNames = new Set(
    allPaths.flatMap(filePath => {
      const match = LAB_COMPONENT_DIR.exec(filePath);
      return match ? [match[1]] : [];
    }),
  );
  const labEntries = new Set(
    normalized
      .filter(change =>
        isLabEntryChange(change, {
          names: labNames,
          patches,
          officialPackagesBase,
        }),
      )
      .map(change => change.filename),
  );
  const labOnly =
    complete &&
    allPaths.some(filePath => filePath.startsWith(LAB_ROOT)) &&
    allPaths.every(
      filePath =>
        filePath.startsWith(LAB_ROOT) ||
        CHANGESET_PATTERN.test(filePath) ||
        labEntries.has(filePath),
    );
  // An incomplete list, or any shared infrastructure, runs everything. A Lab
  // entry file of a Lab-only change is not shared infrastructure for it.
  const sharedInfra = allPaths.filter(
    filePath =>
      isSharedInfraPath(filePath) && !(labOnly && labEntries.has(filePath)),
  );
  const fullSuite = !complete || sharedInfra.length > 0;
  // The Vitest lanes run every test unless every shared path is one the
  // module graph reaches.
  const vitestFullSuite =
    !complete ||
    sharedInfra.some(filePath => !isVitestGraphInfraPath(filePath));
  return {
    specOnly,
    toolingOnly,
    touchesKnowledgeRecords,
    touchesDesignAssets,
    specChangesetConflict,
    docsiteOnly,
    labOnly,
    fullSuite,
    vitestFullSuite,
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
            : labOnly
              ? 'only the Lab package changed'
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

/**
 * Each path's record classes, for a caller outside this workflow: whether it
 * counts toward a spec-only change (`specRecord`) and whether its change needs
 * a spec owner's approval (`ownerGatedRecord`). Reads the paths alone.
 *
 * @param {string[]} paths
 * @returns {Record<string, {specRecord: boolean, ownerGatedRecord: boolean}>}
 */
function classifyPaths(paths) {
  return Object.fromEntries(
    paths.map(filePath => [
      filePath,
      {
        specRecord: isSpecRecordPath(filePath),
        ownerGatedRecord: isOwnerGatedPath(filePath),
      },
    ]),
  );
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  // `--classify-paths`: newline-separated paths on stdin, JSON on stdout.
  if (process.argv.includes('--classify-paths')) {
    const paths = fs
      .readFileSync(0, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    process.stdout.write(`${JSON.stringify(classifyPaths(paths))}\n`);
  } else {
    // `--patches <file>`: GitHub's patch text per path, as JSON, for the Lab
    // entry files. `--official-packages-base <file>`: the base's copy.
    const flag = name => {
      const index = process.argv.indexOf(name);
      return index === -1 ? null : process.argv[index + 1];
    };
    const readJson = file =>
      file ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const readText = file =>
      file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    const result = classifyChanges(
      parseNameStatus(fs.readFileSync(0, 'utf8')),
      {
        patches: readJson(flag('--patches')),
        officialPackagesBase: readText(flag('--official-packages-base')),
      },
    );
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
        `spec_only=${result.specOnly}\ndocsite_only=${result.docsiteOnly}\ntooling_only=${result.toolingOnly}\nlab_only=${result.labOnly}\nfull_suite=${result.fullSuite}\nvitest_full_suite=${result.vitestFullSuite}\n`,
      );
    } else {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  }
}

module.exports = {
  LAB_ROOT,
  OFFICIAL_PACKAGES,
  ROUTES_LOCK,
  NODE_TOOLING_PATHS,
  SURFACES,
  classifyChanges,
  classifyPaths,
  isKnowledgeRecordPath,
  isNodeToolingPath,
  isPackageReleasePath,
  isSharedInfraPath,
  isVitestGraphInfraPath,
  isLabEntryChange,
  isSpecRecordPath,
  labRouteSlug,
  parseNameStatus,
};
