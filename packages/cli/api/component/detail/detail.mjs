// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `component.detail` leaf — a single component's full doc + ownership.
 *
 * @input  a resolved (already-loaded) doc + its owner, from _adapter
 * @output the `component.detail` envelope
 * @position api/component/detail (projection leaf; routed by component.mjs)
 */

import {withOwnership} from '../_adapter.mjs';

/**
 * Project a resolved doc + owner into the `component.detail` envelope.
 * @param {import('../_adapter.mjs').LoadedComponentDoc} docs
 * @param {{package: string, sourcePath: string|null}} owner
 * @param {string} componentName - name used for the import specifier
 * @param {string} coreDir
 * @returns {import('../component.type.mjs').ComponentDetailResponse}
 */
export function componentDetail(docs, owner, componentName, coreDir) {
  return {
    type: 'component.detail',
    package: owner.package,
    data: withOwnership(docs, owner, componentName, coreDir),
  };
}
