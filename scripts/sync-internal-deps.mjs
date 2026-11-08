#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * Declared-version internal-dependency sync — `node scripts/sync-internal-deps.mjs`.
 *
 * All stable packages already carry the fixed-group version declared by main and
 * frozen at the cut. Internal `@astryxdesign/*` packages reference each other
 * with exact version specifiers (for example, a theme's `@astryxdesign/core`
 * peer or `@astryxdesign/cli` devDependency).
 *
 * The custom release-branch versioner keeps stable package versions at that
 * declaration while writing affected changelogs. This script repins every exact
 * internal specifier in dependencies, devDependencies, and peerDependencies to
 * the referenced package's declared version. Non-exact specifiers (`*`, ranges,
 * `workspace:*`, and similar) remain untouched.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));

// Workspace dirs that can contain internal packages. Kept in sync with
// pnpm-workspace.yaml `packages:`.
const PKG_DIRS = ['packages', 'packages/themes', 'apps', 'internal'];

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

// Discover every workspace package.json.
const pkgPaths = [];
for (const dir of PKG_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const entry of fs.readdirSync(abs, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const pkgPath = path.join(abs, entry.name, 'package.json');
    if (fs.existsSync(pkgPath)) pkgPaths.push(pkgPath);
  }
}

// Map each internal package name -> its current declared version.
const versionByName = new Map();
for (const pkgPath of pkgPaths) {
  const pkg = read(pkgPath);
  if (pkg.name && pkg.version) versionByName.set(pkg.name, pkg.version);
}

let changed = 0;
for (const pkgPath of pkgPaths) {
  const pkg = read(pkgPath);
  let dirty = false;
  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      const target = versionByName.get(name);
      if (!target) continue; // not an internal workspace package
      const spec = deps[name];
      // Only manage exact-version specifiers; leave `*`, ranges and
      // workspace: protocol specifiers alone.
      if (!EXACT_VERSION.test(spec)) continue;
      if (spec === target) continue;
      deps[name] = target;
      console.log(`  ${pkg.name}: ${field} ${name} ${spec} -> ${target}`);
      dirty = true;
      changed++;
    }
  }
  if (dirty) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

console.log(
  changed === 0
    ? 'All exact-version internal @astryxdesign/* specifiers already in sync.'
    : `Synced ${changed} internal @astryxdesign/* specifier(s).`,
);
