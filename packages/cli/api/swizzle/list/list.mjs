// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle.list leaf — the swizzlable component names.
 *
 * Projects the shared core resolution (api/swizzle/_adapter.mjs) into the
 * `swizzle.list` envelope. It does no filesystem work of its own beyond that
 * shared seam. All human prose / usage hints live in the CLI renderer.
 */

import {CORE_PACKAGE, resolveCore} from '../_adapter.mjs';
import {runBase} from '../../../foundation/bases/resolve.mjs';

/**
 * List swizzlable components discoverable from `cwd`'s @astryxdesign/core.
 * @param {string} [cwd]
 * @returns {import('../swizzle.type.mjs').SwizzleListResponse}
 */
export function swizzleList(cwd = process.cwd()) {
  const {components} = resolveCore(cwd);
  // The list names the run's base, the package its items come from.
  const run = runBase(cwd);
  return {
    type: 'swizzle.list',
    package: run.ok ? run.base.name : CORE_PACKAGE,
    data: components,
  };
}
