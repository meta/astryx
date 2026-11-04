// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file workspace-globs.mjs
 *
 * Single source of truth for "which directories are workspace packages".
 * Reads the `packages:` globs out of pnpm-workspace.yaml and expands them.
 *
 * pnpm-workspace.yaml is the only place the workspace layout is declared —
 * the root package.json no longer carries a `workspaces` array.
 *
 * @input  repo root (absolute path)
 * @output workspace globs / absolute package directories
 * @position leaf — imported by scripts/ and apps/docsite/scripts/
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Parse the `packages:` block of pnpm-workspace.yaml.
 *
 * Deliberately line-based rather than a single regex: pnpm-workspace.yaml also
 * carries `minimumReleaseAgeExclude`, `overrides` and `allowBuilds`, and a
 * naive `/^\s*-\s*.../gm` sweep picks up their list items too. That used to be
 * harmless only because the stray entries (e.g. `@astryxdesign/*`) never named a
 * real directory, so they were silently skipped downstream.
 *
 * @param {string} root Absolute path to the repo root.
 * @returns {string[]} Globs exactly as authored, e.g. ['apps/*', 'packages/*'].
 */
export function readWorkspaceGlobs(root) {
  const file = path.join(root, 'pnpm-workspace.yaml');
  return parseWorkspaceGlobs(fs.readFileSync(file, 'utf8'), file);
}

/**
 * Parse the `packages:` block from pnpm-workspace.yaml source text, for
 * callers that read the file at a git revision rather than from disk.
 *
 * @param {string} src pnpm-workspace.yaml contents.
 * @param {string} [file] Display name for the error message.
 * @returns {string[]} Globs exactly as authored, e.g. ['apps/*', 'packages/*'].
 */
export function parseWorkspaceGlobs(src, file = 'pnpm-workspace.yaml') {
  const globs = [];
  let inPackages = false;

  for (const line of src.split('\n')) {
    if (/^\s*(#|$)/.test(line)) continue; // comment or blank

    if (/^packages:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (/^\S/.test(line)) {
      // Another top-level key — the packages block is over.
      if (inPackages) break;
      continue;
    }
    if (!inPackages) continue;

    const m = /^\s+-\s*(?:'([^']*)'|"([^"]*)"|(\S+))\s*$/.exec(line);
    if (m) globs.push(m[1] ?? m[2] ?? m[3]);
  }

  if (globs.length === 0) {
    throw new Error(
      `No \`packages:\` globs found in ${file}. Every workspace-walking script ` +
        'derives its package list from that block; an empty result would make ' +
        'them silently produce nothing.',
    );
  }

  return globs;
}

/**
 * Expand the workspace globs into absolute directories. Only the directory
 * layout is resolved here — callers decide what counts as a package (has a
 * package.json, is publishable, has a CHANGELOG, ...).
 *
 * @param {string} root Absolute path to the repo root.
 * @returns {string[]} Deduplicated absolute directory paths.
 */
export function expandWorkspaceDirs(root) {
  const dirs = new Set();

  for (const glob of readWorkspaceGlobs(root)) {
    const base = glob.replace(/\/\*+$/, '');
    const abs = path.join(root, base);
    if (!fs.existsSync(abs)) continue;

    if (glob.endsWith('*')) {
      for (const entry of fs.readdirSync(abs, {withFileTypes: true})) {
        if (entry.isDirectory()) dirs.add(path.join(abs, entry.name));
      }
    } else {
      dirs.add(abs);
    }
  }

  return [...dirs];
}
