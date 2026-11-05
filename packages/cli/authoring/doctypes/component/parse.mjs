// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Component doc parser (stamped `type: 'component'`). Zod is sealed in
 * `../_schema.mjs`; consumers call `parseComponent` or use `parseDoc`.
 */

import {ComponentDocKindSchema} from '../_schema.mjs';
import {formatZodError} from '../../_shared/errors.mjs';

/** @typedef {import('../types.js').ComponentDoc} ComponentDoc */

/**
 * Validate an unknown value as a stamped component doc, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {ComponentDoc}
 */
export function parseComponent(input, label = 'component doc') {
  const result = ComponentDocKindSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return /** @type {ComponentDoc} */ (result.data);
}
