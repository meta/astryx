// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Command doc parser (stamped `type: 'command'`). Zod is sealed in
 * `../_schema.mjs`; consumers call `parseCommand` or use `parseDoc`.
 */

import {CommandDocKindSchema} from '../_schema.mjs';
import {formatZodError} from '../../_shared/errors.mjs';

/** @typedef {import('../types.js').CommandDoc} CommandDoc */

/**
 * Validate an unknown value as a stamped command doc, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {CommandDoc}
 */
export function parseCommand(input, label = 'command doc') {
  const result = CommandDocKindSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return /** @type {CommandDoc} */ (/** @type {unknown} */ (result.data));
}
