#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Check that every published package names the other `@astryxdesign`
 *   packages it needs at their release version.
 * @input Optional package directories; with none, every package npm receives
 *   from `packages/` and `packages/themes/` (public ones, and private ones
 *   marked canary-only, which the canary job publishes).
 * @output Prints each problem and exits 1 when there is one.
 * @position `pnpm check:published-manifests` runs it on every change, and
 *   scripts/npm/publish-package.mjs runs `alignmentProblems` on each package
 *   just before it publishes. A dependency, peer or optional dependency on an
 *   `@astryxdesign` package must name the version of that package in the same
 *   release (exact, or `^` and that version). `*` and other ranges let a
 *   package manager keep an older release next to the new one: an app that
 *   upgraded Core could keep a theme from the release before, whose exact Core
 *   peer then no longer matches.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

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
const PACKAGE_PARENTS = ['packages', 'packages/themes'];

/** The directories under `root` that hold a package manifest. */
export function packageDirs(root) {
  return PACKAGE_PARENTS.flatMap(parent => {
    const dir = path.join(root, parent);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, {withFileTypes: true})
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(dir, entry.name))
      .filter(pkgDir => fs.existsSync(path.join(pkgDir, 'package.json')));
  });
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

/** Each `@astryxdesign` package under `root`, by name, with its version. */
export function releaseVersions(root) {
  const versions = new Map();
  for (const dir of packageDirs(root)) {
    const manifest = readManifest(dir);
    if (manifest.name?.startsWith('@astryxdesign/')) {
      versions.set(manifest.name, manifest.version);
    }
  }
  return versions;
}

/**
 * The problems in one manifest: each `@astryxdesign` entry in its
 * dependencies, peers or optional dependencies that does not name the
 * release version of that package (`versions`, by name).
 */
export function alignmentProblems(manifest, versions) {
  const problems = [];
  for (const field of FIELDS) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (!name.startsWith('@astryxdesign/')) continue;
      const version = versions.get(name);
      if (version == null) {
        problems.push(
          `${manifest.name}: ${field} names ${name}, which is not a package in this release`,
        );
      } else if (
        spec !== version &&
        spec !== `^${version}` &&
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
  const dirs = process.argv.slice(2);
  const manifests = (dirs.length > 0 ? dirs : packageDirs(root))
    .map(readManifest)
    .filter(isPublished);
  const problems = manifests.flatMap(manifest =>
    alignmentProblems(manifest, versions),
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
