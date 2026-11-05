// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `component.detail.showcase` leaf — a component's hero showcase source,
 * with each demo-content element replaced by a placeholder.
 *
 * @input  a component name (+ cwd / package scope) or an explicit "no match"
 * @output the `component.detail.showcase` envelope
 * @position api/component/detail/showcase (projection leaf; routed by component.mjs)
 */

import * as fs from 'node:fs';
import {AstryxError} from '../../../error.mjs';
import {ERROR_CODES} from '../../../../foundation/response/error-codes.mjs';
import {
  findShowcase,
  replaceDemoContent,
} from '../../../template/template.mjs';

/**
 * Resolve and read a component's showcase block into the
 * `component.detail.showcase` envelope. Throws ERR_NO_SHOWCASE when none
 * matches. Pass `resolve: false` for owners that never carry a showcase
 * (integration components) so we throw without scanning blocks.
 * @param {string} componentName - bare name, echoed back as `data.component`
 * @param {object} ctx
 * @param {string} ctx.cwd
 * @param {string} ctx.name - the caller's original input, used in the error message
 * @param {string|null} [ctx.packageScope] - scope block discovery + the error to a package
 * @param {boolean} [ctx.resolve] - when false, skip discovery and treat as not found
 * @param {string} ctx.ownerPackage - the npm package that owns the component
 * @returns {Promise<import('../../component.type.mjs').ComponentDetailShowcaseResponse>}
 */
export async function componentDetailShowcase(componentName, {cwd, name, packageScope = null, resolve = true, ownerPackage}) {
  const match = resolve
    ? await findShowcase(componentName, cwd, packageScope ? {package: packageScope} : undefined)
    : null;
  if (!match) {
    const suffix = packageScope ? ` in package "${packageScope}"` : '';
    throw new AstryxError(`No showcase found for "${name}"${suffix}`, undefined, ERROR_CODES.ERR_NO_SHOWCASE);
  }
  return {
    type: 'component.detail.showcase',
    package: ownerPackage,
    data: {
      component: componentName,
      aspectRatio: /** @type {number} */ (match.aspectRatio),
      // Handed-out source, not a copy: demo content becomes the placeholder a
      // copy writes, and fixture media stays.
      source: replaceDemoContent(fs.readFileSync(match.filePath, 'utf-8')).source,
    },
  };
}
