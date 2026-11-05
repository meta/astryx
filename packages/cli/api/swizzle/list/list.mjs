// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle.list leaf — the swizzlable component names.
 *
 * Projects the shared core resolution (api/swizzle/_adapter.mjs) into the
 * `swizzle.list` envelope. It does no filesystem work of its own beyond that
 * shared seam. All human prose / usage hints live in the CLI renderer.
 */

import {CORE_PACKAGE, resolveCore} from '../_adapter.mjs';

/**
 * List swizzlable components discoverable from `cwd`'s @astryxdesign/core.
 * @param {string} [cwd]
 * @returns {import('../swizzle.type.mjs').SwizzleListResponse}
 */
export function swizzleList(cwd = process.cwd()) {
  const {components} = resolveCore(cwd);
  return {type: 'swizzle.list', package: CORE_PACKAGE, data: components};
}
