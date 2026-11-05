// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Legacy (unstamped) doc parser. The pre-factory docs are authored as a
 * loose object with no `type` discriminant and validated by shape. Zod is
 * sealed in `./_schema.mjs`; `parseDoc` falls back here when a doc carries no
 * stamped `type`.
 */

import {LegacyDocSchema} from './_schema.mjs';
import {formatZodError} from '../_shared/errors.mjs';

/** @typedef {import('./types.js').ComponentDoc} ComponentDoc */
/** @typedef {import('./types.js').HookDoc} HookDoc */
/** @typedef {import('./types.js').ReferenceDoc} ReferenceDoc */

/**
 * Validate an unknown value as a legacy (unstamped) doc, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {ComponentDoc | HookDoc | ReferenceDoc}
 */
export function parseLegacyDoc(input, label = 'doc') {
  const result = LegacyDocSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return /** @type {ComponentDoc | HookDoc | ReferenceDoc} */ (result.data);
}
