// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle API — dispatcher + barrel.
 *
 * `swizzle(name, options)` routes to one of two leaves and returns that leaf's
 * envelope:
 *   - no name (or `list: true`) -> api/swizzle/list -> `swizzle.list`
 *   - a component name          -> api/swizzle/copy -> `swizzle.copy` receipt
 *
 * Errors throw AstryxError (stable code + suggestions). All human prose /
 * package-manager prefixing lives in the CLI renderer. api/index.mjs, the CLI
 * command, and the unit tests import `swizzle` from here.
 */

import {swizzleList} from './list/list.mjs';
import {swizzleCopy} from './copy/copy.mjs';

/**
 * List swizzlable components, or copy one component's source for customization.
 *
 * @param {string} [component] bare or XDS-prefixed component name; omit to list
 * @param {{cwd?: string, output?: string, package?: string, list?: boolean, overwrite?: boolean}} [options]
 * @returns {Promise<import('./swizzle.type.mjs').SwizzleListResponse | import('./swizzle.type.mjs').SwizzleCopyResponse>}
 */
export async function swizzle(component, options = {}) {
  const {cwd = process.cwd(), list = false} = options;

  if (list || !component) {
    return swizzleList(cwd);
  }

  return swizzleCopy(component, options);
}
