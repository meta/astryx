// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `component.detail.props` leaf — just a component's props table, each
 * prop with the declarations of the types it names (read by _adapter).
 *
 * @input  a resolved (already-loaded) doc-like object, from _adapter, and the
 *   path of the doc it was read from
 * @output the `component.detail.props` envelope
 * @position api/component/detail/props (projection leaf; routed by component.mjs)
 */

import {extractProps, withPropTypes} from '../../_adapter.mjs';

/**
 * Project a resolved doc into the `component.detail.props` envelope.
 * @param {import('../../_adapter.mjs').LoadedComponentDoc} docs
 * @param {string} ownerPackage - the npm package that owns the component
 * @param {{docPath?: string}} [options] `docPath` is the doc the props were
 *   read from; the types come from the package that holds it
 * @returns {import('../../component.type.mjs').ComponentDetailPropsResponse}
 */
export function componentDetailProps(docs, ownerPackage, {docPath} = {}) {
  return {
    type: 'component.detail.props',
    package: ownerPackage,
    data: withPropTypes(extractProps(docs), ownerPackage, docPath),
  };
}
