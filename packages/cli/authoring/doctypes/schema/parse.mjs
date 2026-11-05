// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Schema doc parser (stamped `type: 'schema'`). Zod is sealed in
 * `../_schema.mjs`; consumers call `parseSchema` or use `parseDoc`.
 */

import {SchemaDocKindSchema} from '../_schema.mjs';
import {formatZodError} from '../../_shared/errors.mjs';

/** @typedef {import('../types.js').SchemaDoc} SchemaDoc */

/**
 * Validate an unknown value as a stamped schema doc, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {SchemaDoc}
 */
export function parseSchema(input, label = 'schema doc') {
  const result = SchemaDocKindSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return /** @type {SchemaDoc} */ (/** @type {unknown} */ (result.data));
}
