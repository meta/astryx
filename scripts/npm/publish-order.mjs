#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Order package directories so that each package comes after the
 *   @astryxdesign packages it depends on or peers on.
 * @input Package directories as arguments; a directory without a
 *   package.json is left out.
 * @output The directories, one per line, dependencies first: each step takes
 *   the earliest listed package whose dependencies are already placed. Exit 1
 *   on a cycle.
 * @position The stable publish step in .github/workflows/release.yml walks
 *   this order. That step holds back a package whose dependency failed to
 *   publish in the same run, which works only when every dependency is
 *   published first.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/**
 * Orders `packages` (`{dir, name, dependsOn}`, where `dependsOn` lists
 * package names) dependencies first: each step takes the earliest listed
 * package whose dependencies are already placed. Names outside `packages` are
 * ignored. Throws on a cycle.
 */
export function publishOrder(packages) {
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]));
  const ordered = [];
  const placed = new Set();
  while (ordered.length < packages.length) {
    const next = packages.find(
      pkg =>
        !placed.has(pkg.name) &&
        pkg.dependsOn.every(name => !byName.has(name) || placed.has(name)),
    );
    if (!next) {
      const cycle = packages
        .filter(pkg => !placed.has(pkg.name))
        .map(pkg => pkg.name);
      throw new Error(`dependency cycle among: ${cycle.join(', ')}`);
    }
    ordered.push(next);
    placed.add(next.name);
  }
  return ordered;
}

function readPackage(dir) {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return null;
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    dir,
    name: manifest.name,
    dependsOn: Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    }).filter(name => name.startsWith('@astryxdesign/')),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const packages = process.argv.slice(2).map(readPackage).filter(Boolean);
    for (const pkg of publishOrder(packages)) console.log(pkg.dir);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
