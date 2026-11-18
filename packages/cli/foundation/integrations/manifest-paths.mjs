// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file manifest-paths.mjs
 * @input A package folder
 * @output MANIFEST_BASENAMES and findManifestPaths: the integration manifests
 *   a package has, in load-precedence order
 * @position packages/cli/foundation/integrations: reads no manifest, so the
 *   run's package set finds them without integrations.mjs, its schemas and
 *   its module loader. integrations.mjs re-exports both.
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
 * load-precedence order. Unlike {@link resolveManifestPath} this never throws —
 * callers (for example Doctor integration validation) decide how to treat zero / multiple.
 * @param {string} dir
 * @returns {string[]} absolute manifest paths
 */
export function findManifestPaths(dir) {
  return findPresentFiles(dir, MANIFEST_BASENAMES);
}
