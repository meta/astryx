#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Decide whether main's tip still needs canaries: which packages the
 *   canary loop would publish that the registry does not have yet.
 * @input `--version <canary version>`, or `--list-dirs` to print the package
 *   directories the canary job publishes, one per line; the package manifests under
 *   `packages/` and `packages/themes/`. `ASTRYX_PUBLISH_REGISTRY` overrides
 *   the registry for tests.
 * @output Prints each pending package; writes `pending=<count>` to
 *   `$GITHUB_OUTPUT` when set. A read the registry cannot answer counts as
 *   pending, so an unknown answer never skips a publish.
 * @position The canary job in .github/workflows/release.yml runs it before it
 *   builds anything, so an hourly run at a tip whose canaries are all
 *   published stops early, and a tip with any package missing publishes again.
 *   The job's stamp and publish loops walk `--list-dirs`, so the check and the
 *   loops always mean the same packages.
 */

import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

import {packageExists, registryHas} from './publish-package.mjs';
import {publishedPackages} from './published-manifests.mjs';

/**
 * The packages the canary loop publishes: public `@astryxdesign` packages,
 * plus private ones marked canary-only. `privateCanary` marks the latter,
 * which the loop skips while their npm name does not exist.
 */
export function canaryPackages(root) {
  return publishedPackages(root).map(({dir, manifest}) => ({
    dir,
    name: manifest.name,
    privateCanary: Boolean(manifest.private),
  }));
}

/**
 * The packages still to publish at `version`. A package counts as done when
 * the registry has that version, or when it is a private canary-only package
 * whose npm name does not exist (the loop skips it). Anything else, an
 * unknown answer included, is pending.
 */
export async function pendingPackages({
  packages,
  version,
  isPublished,
  exists,
}) {
  const pending = [];
  for (const pkg of packages) {
    if ((await isPublished(pkg.name, version)) === true) continue;
    if (pkg.privateCanary && (await exists(pkg.name)) === false) continue;
    pending.push(pkg.name);
  }
  return pending;
}

async function main() {
  if (process.argv.includes('--list-dirs')) {
    for (const pkg of canaryPackages(process.cwd())) console.log(pkg.dir);
    return;
  }
  const flag = process.argv.indexOf('--version');
  const version = flag > 0 ? process.argv[flag + 1] : undefined;
  if (!version) throw new Error('--version is required');
  const registry = process.env.ASTRYX_PUBLISH_REGISTRY || undefined;
  const pending = await pendingPackages({
    packages: canaryPackages(process.cwd()),
    version,
    isPublished: (name, packageVersion) =>
      registryHas({name, version: packageVersion, registry}),
    exists: name => packageExists({name, registry}),
  });
  for (const name of pending)
    console.log(`Not yet published: ${name}@${version}`);
  if (pending.length === 0) {
    console.log(`Every canary package is already published at ${version}.`);
  }
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `pending=${pending.length}\n`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
