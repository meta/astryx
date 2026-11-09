// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reference/topic doc parser (stamped `type: 'generic'`). The rich type
 * is {@link ReferenceDoc}; the stamped discriminant value stays `'generic'`.
 * Zod is sealed in `../_schema.mjs`; consumers call `parseReference` or `parseDoc`.
 */

import {GenericDocKindSchema} from '../_schema.mjs';
import {formatZodError} from '../../_shared/errors.mjs';

/** @typedef {import('../types.js').ReferenceDoc} ReferenceDoc */

/**
 * Validate an unknown value as a stamped reference/topic doc, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {ReferenceDoc}
 */
export function parseReference(input, label = 'reference doc') {
  const result = GenericDocKindSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  const doc = result.data;
  return /** @type {ReferenceDoc} */ ({
    ...doc,
    title: doc.title ?? doc.displayName ?? doc.name,
    description: doc.description ?? '',
    sections: doc.sections ?? [],
  });
}
