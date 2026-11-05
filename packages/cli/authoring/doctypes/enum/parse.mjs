// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Enum doc parser (stamped `type: 'enum'`). Zod is sealed in
 * `../_schema.mjs`; consumers call `parseEnum` or use `parseDoc`.
 */

import {EnumDocKindSchema} from '../_schema.mjs';
import {formatZodError} from '../../_shared/errors.mjs';

/** @typedef {import('../types.js').EnumDoc} EnumDoc */

/**
 * Validate an unknown value as a stamped enum doc, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {EnumDoc}
 */
export function parseEnum(input, label = 'enum doc') {
  const result = EnumDocKindSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return /** @type {EnumDoc} */ (/** @type {unknown} */ (result.data));
}
