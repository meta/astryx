// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Projects a component's stability into the docsite registry.
 * @input A component's owning package and the docs that can declare its
 *   stability.
 * @output The `stability` field of a generated component entry.
 * @position Imported by generate-data.mjs.
 */

/**
 * The private, canary-only Lab package, where spec:AST-017 FR27 keeps every
 * whole experimental component.
 */
export const LAB_PACKAGE_NAME = '@astryxdesign/lab';

/**
 * A component entry's stability: `'lab'` for every component of the Lab
 * package; otherwise `'experimental'` when its own doc or its family's doc
 * declares `stability: 'experimental'` (spec:AST-017 FR21); otherwise null,
 * a stable component.
 *
 * @param {string} packageName The component's owning package.
 * @param {...({stability?: unknown} | null | undefined)} docs Its own doc,
 *   then its family's doc when it is part of a family.
 * @returns {'experimental' | 'lab' | null}
 */
export function componentStability(packageName, ...docs) {
  if (packageName === LAB_PACKAGE_NAME) {
    return 'lab';
  }
  return docs.some(doc => doc?.stability === 'experimental')
    ? 'experimental'
    : null;
}
