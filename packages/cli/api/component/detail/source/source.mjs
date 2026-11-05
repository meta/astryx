// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `component.detail.source` leaf — a component's source code.
 *
 * @input  a resolved source path (from _adapter / the owner) + error context
 * @output the `component.detail.source` envelope
 * @position api/component/detail/source (projection leaf; routed by component.mjs)
 */

import * as fs from 'node:fs';
import {AstryxError} from '../../../error.mjs';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';

/**
 * Read a resolved component source path into the `component.detail.source`
 * envelope. Throws ERR_NO_SOURCE when the owner ships no source file.
 * @param {string} componentName - bare name, echoed back as `data.component`
 * @param {string|null} sourcePath - the resolved source path (null → not found)
 * @param {{name: string, notFoundInPackage?: string|null, ownerPackage: string}} ctx - `name` is the caller's original input; `notFoundInPackage` scopes the not-found message to a package; `ownerPackage` is the npm package that owns the component
 * @returns {import('../../component.type.mjs').ComponentDetailSourceResponse}
 */
export function componentDetailSource(componentName, sourcePath, {name, notFoundInPackage = null, ownerPackage}) {
  if (!sourcePath) {
    const suffix = notFoundInPackage ? ` in package "${notFoundInPackage}"` : '';
    throw new AstryxError(`Source for "${name}" not found${suffix}`, undefined, ERROR_CODES.ERR_NO_SOURCE);
  }
  return {
    type: 'component.detail.source',
    package: ownerPackage,
    data: {component: componentName, source: fs.readFileSync(sourcePath, 'utf-8')},
  };
}
