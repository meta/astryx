// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Function/hook doc parser (stamped `type: 'function'`). Zod is sealed in
 * `../_schema.mjs`; consumers call `parseHook` or use `parseDoc`.
 */

import {FunctionDocKindSchema} from '../_schema.mjs';
import {formatZodError} from '../../_shared/errors.mjs';

/** @typedef {import('../types.js').HookDoc} HookDoc */

/**
 * Validate an unknown value as a stamped function/hook doc, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {HookDoc}
 */
export function parseHook(input, label = 'function doc') {
  const result = FunctionDocKindSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return /** @type {HookDoc} */ (result.data);
}
