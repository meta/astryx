#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Check that every published package names the other `@astryxdesign`
 *   packages it needs at their release version.
 * @input Optional package directories; with none, every package npm receives
 *   from `packages/` and `packages/themes/` (public ones, and private ones
 *   marked canary-only, which the canary job publishes).
 * @output Prints each problem and exits 1 when there is one.
 * @position `pnpm check:published-manifests` runs it on every change,
 *   scripts/npm/publish-package.mjs runs `alignmentProblems` on each package
 *   just before it publishes, and the canary loops publish `publishedPackages`.
 *   A dependency, peer or optional dependency on an `@astryxdesign` package
 *   must name that package's exact version in the same release, the only
 *   spec the release's version sync moves. `*` and other ranges let a package
 *   manager keep an older release next to the new one: an app that upgraded
 *   Core could keep a theme from the release before, whose exact Core peer then
 *   no longer matches.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const PACKAGE_PARENTS = ['packages', 'packages/themes'];

// Entries that may keep another spec until a minor release. Narrowing a
// published range is a breaking change, so the CLI keeps its optional `*`
// peer on Core until the next minor release pins it to the release version.
export const PENDING_ALIGNMENT = [
  {
    name: '@astryxdesign/cli',
    field: 'peerDependencies',
    dependency: '@astryxdesign/core',
    spec: '*',
  },
];

function isPending(name, field, dependency, spec) {
  return PENDING_ALIGNMENT.some(
    entry =>
      entry.name === name &&
      entry.field === field &&
      entry.dependency === dependency &&
      entry.spec === spec,
  );
}

/** Each package under `root`, as its directory relative to `root` and its manifest. */
function workspacePackages(root) {
  return PACKAGE_PARENTS.flatMap(parent => {
    const parentDir = path.join(root, parent);
    if (!fs.existsSync(parentDir)) return [];
    return fs
      .readdirSync(parentDir, {withFileTypes: true})
      .filter(entry => entry.isDirectory())
      .map(entry => `${parent}/${entry.name}`)
      .sort();
  })
    .filter(dir => fs.existsSync(path.join(root, dir, 'package.json')))
    .map(dir => ({dir, manifest: readManifest(path.join(root, dir))}));
}

function readManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
}

/** Whether npm receives this package: public, or private and canary-only. */
export function isPublished(manifest) {
  return (
    Boolean(manifest.name?.startsWith('@astryxdesign/')) &&
    (!manifest.private || Boolean(manifest.astryx?.canaryOnly))
  );
}

/**
 * The packages npm receives from `root`: public `@astryxdesign` packages and
 * private canary-only ones. The canary loops publish exactly this list.
 */
export function publishedPackages(root) {
  return workspacePackages(root).filter(({manifest}) => isPublished(manifest));
}

/** Each package npm receives from `root`, by name, with its version. */
export function releaseVersions(root) {
  return new Map(
    publishedPackages(root).map(({manifest}) => [
      manifest.name,
      manifest.version,
    ]),
  );
}

/** The names of the packages only the canary channel publishes. */
export function canaryOnlyNames(root) {
  return new Set(
    publishedPackages(root)
      .filter(({manifest}) => manifest.astryx?.canaryOnly)
      .map(({manifest}) => manifest.name),
  );
}

/**
 * The problems in one manifest: each `@astryxdesign` entry in its
 * dependencies, peers or optional dependencies that does not name the
 * release version of that package (`versions`, by name). A package that the
 * stable channel publishes must not name one that only the canary channel
 * publishes (`canaryOnly`), because no stable version of it exists.
 */
export function alignmentProblems(manifest, versions, canaryOnly = new Set()) {
  const problems = [];
  const stable = !manifest.astryx?.canaryOnly;
  for (const field of FIELDS) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (!name.startsWith('@astryxdesign/')) continue;
      const version = versions.get(name);
      if (version == null) {
        problems.push(
          `${manifest.name}: ${field} names ${name}, which npm does not receive in this release`,
        );
      } else if (stable && canaryOnly.has(name)) {
        problems.push(
          `${manifest.name}: ${field} names ${name}, which only the canary channel publishes`,
        );
      } else if (
        spec !== version &&
        !isPending(manifest.name, field, name, spec)
      ) {
        problems.push(
          `${manifest.name}: ${field} ${name} is "${spec}"; name this release's version, "${version}"`,
        );
      }
    }
  }
  return problems;
}

function main() {
  const root = process.cwd();
  const versions = releaseVersions(root);
  const canaryOnly = canaryOnlyNames(root);
  const dirs = process.argv.slice(2);
  const manifests =
    dirs.length > 0
      ? dirs.map(readManifest).filter(isPublished)
      : publishedPackages(root).map(({manifest}) => manifest);
  const problems = manifests.flatMap(manifest =>
    alignmentProblems(manifest, versions, canaryOnly),
  );
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log(
    `${manifests.length} published package manifests name their @astryxdesign packages at this release's version.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
