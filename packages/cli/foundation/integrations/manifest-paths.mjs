// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file manifest-paths.mjs
 * @input A package directory
 * @output Exports MANIFEST_BASENAMES and findManifestPaths
 * @position The file-name part of integrations.mjs, which re-exports both. A
 *   run's release choice reads it without the manifest schema.
 */

import {findPresentFiles} from '../fs/present-files.mjs';

/** Conventional manifest basenames, in load-precedence order. */
export const MANIFEST_BASENAMES = [
  'astryx.integration.ts',
  'astryx.integration.mjs',
  'astryx.integration.js',
];

/**
 * Return the conventional root manifest paths present in `dir`, in
 * load-precedence order. Unlike `resolveManifestPath` in integrations.mjs this
 * never throws — callers (for example Doctor integration validation) decide how
 * to treat zero / multiple.
 * @param {string} dir
 * @returns {string[]} absolute manifest paths
 */
export function findManifestPaths(dir) {
  return findPresentFiles(dir, MANIFEST_BASENAMES);
}
