// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod version registry
 *
 * Maps XDS versions to their transform manifests. Used by the upgrade
 * command to determine which codemods to run between two versions.
 */

const registry = new Map([
  ['0.0.2', () => import('./transforms/v0.0.2/index.mjs')],
  ['0.0.6', () => import('./transforms/v0.0.6/index.mjs')],
  ['0.0.7', () => import('./transforms/v0.0.7/index.mjs')],
  ['0.0.8', () => import('./transforms/v0.0.8/index.mjs')],
  ['0.0.10', () => import('./transforms/v0.0.10/index.mjs')],
  ['0.0.12', () => import('./transforms/v0.0.12/index.mjs')],
  ['0.0.13', () => import('./transforms/v0.0.13/index.mjs')],
  ['0.0.14', () => import('./transforms/v0.0.14/index.mjs')],
  ['0.0.15', () => import('./transforms/v0.0.15/index.mjs')],
  ['0.1.0', () => import('./transforms/v0.1.0/index.mjs')],
  ['0.1.2', () => import('./transforms/v0.1.2/index.mjs')],
  ['0.1.3', () => import('./transforms/v0.1.3/index.mjs')],
  ['0.1.5', () => import('./transforms/v0.1.5/index.mjs')],
  ['0.1.7', () => import('./transforms/v0.1.7/index.mjs')],
  ['0.1.8', () => import('./transforms/v0.1.8/index.mjs')],
  ['0.2.0', () => import('./transforms/v0.2.0/index.mjs')],
  ['0.2.1', () => import('./transforms/v0.2.1/index.mjs')],
  ['0.3.0', () => import('./transforms/v0.3.0/index.mjs')],
  ['0.4.0', () => import('./transforms/v0.4.0/index.mjs')],
  ['0.5.0', () => import('./transforms/v0.5.0/index.mjs')],
  ['0.6.0', () => import('./transforms/v0.6.0/index.mjs')],
  ['0.6.4', () => import('./transforms/v0.6.4/index.mjs')],
  ['0.6.7', () => import('./transforms/v0.6.7/index.mjs')],
  ['0.7.0', () => import('./transforms/v0.7.0/index.mjs')],
  ['0.7.2', () => import('./transforms/v0.7.2/index.mjs')],
  ['0.7.5', () => import('./transforms/v0.7.5/index.mjs')],
]);

// Re-export from the shared utility so registry callers and other consumers
// (upgrade gate, update-check) all use the same comparator.
import {semverCompare} from '../../foundation/env/semver.mjs';

/**
 * All registered versions, sorted ascending.
 */
export const versions = [...registry.keys()].sort(semverCompare);

/**
 * The latest version in the registry.
 */
export const latestVersion = versions[versions.length - 1];

/**
 * Get all transform manifests between two versions (exclusive of `from`, inclusive of `to`).
 * Returns an array of {version, transforms} objects sorted ascending.
 *
 * @param {string} from - Current version (exclusive)
 * @param {string} to - Target version (inclusive)
 * @returns {Promise<Array<{version: string, transforms: Array<{name: string, transform: import('../../authoring/codemod/type').CodemodTransform, meta: {title: string, description?: string}}>}>>}
 */
export async function getTransformsBetween(from, to) {
  const applicable = versions.filter(
    v => semverCompare(v, from) > 0 && semverCompare(v, to) <= 0,
  );
  /** @type {Array<{version: string, transforms: Array<{name: string, transform: import('../../authoring/codemod/type').CodemodTransform, meta: {title: string, description?: string}}>}>} */
  const results = [];

  for (const version of applicable) {
    const loader = registry.get(version);
    if (!loader) continue;
    const manifest = await loader();
    results.push({
      version,
      transforms: manifest.default,
    });
  }

  return results;
}
