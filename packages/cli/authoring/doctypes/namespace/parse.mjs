// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Namespace doc parser. Zod is sealed in `../_schema.mjs`; consumers call
 * `parseNamespace` or use `parseDoc`.
 */

import {NamespaceDocKindSchema} from '../_schema.mjs';
import {formatZodError} from '../../_shared/errors.mjs';

/** @typedef {import('../types.js').NamespaceDoc} NamespaceDoc */

/**
 * Validate an unknown value as a NamespaceDoc, or throw a readable error.
 * @param {unknown} input
 * @param {string} [label]
 * @returns {NamespaceDoc}
 */
export function parseNamespace(input, label = 'namespace doc') {
  const result = NamespaceDocKindSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return result.data;
}
