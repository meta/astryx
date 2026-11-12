// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The dependencies a project's package.json declares, as autolinking
 *   (autolink.mjs) and the recorder's cheap integration check
 *   (may-have-integrations.mjs) read them. Built-ins and path helpers only,
 *   so it loads before anything heavy.
 *
 * The KEY, never the VALUE: `"@acme/legacy-ui": "npm:@acme/ui@0.1.22"` is a
 * real, installed shape; so are `workspace:*`, `file:../lib`, `link:` and
 * `catalog:`. None of them is a semver range, and none of them has to be
 * parsed: the key is the directory name under node_modules, which is the only
 * thing resolution needs. Identity still comes from the resolved package's own
 * package.json `name`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {isBarePackageName} from './installed-package.mjs';

/**
 * package.json fields whose keys name a dependency this project installs.
 *
 * `peerDependencies` is deliberately absent: a peer is a requirement the
 * CONSUMER must satisfy, not something this project's install brings in, so a
 * peer that happens to be present is not a declaration that it belongs here.
 *
 * @type {readonly string[]}
 */
export const DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
]);

/**
 * The dependency names this project declares, in field then declaration order,
 * each tagged with the field that declared it. A name declared twice keeps the
 * first field it appeared in.
 *
 * Only keys are read; the file header says why values are never parsed.
 *
 * @param {string} projectDir directory holding the project's package.json
 * @returns {Array<{name: string, field: string}>}
 */
export function readDeclaredDependencies(projectDir) {
  /** @type {Record<string, unknown>} */
  let pkg;
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'),
    );
  } catch {
    // No package.json, or unreadable/malformed — nothing is declared.
    return [];
  }

  /** @type {Array<{name: string, field: string}>} */
  const declared = [];
  const seen = new Set();
  for (const field of DEPENDENCY_FIELDS) {
    const entry = pkg?.[field];
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    for (const name of Object.keys(entry)) {
      if (seen.has(name) || !isBarePackageName(name)) continue;
      seen.add(name);
      declared.push({name, field});
    }
  }
  return declared;
}
