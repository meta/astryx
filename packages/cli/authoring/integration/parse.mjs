// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration-manifest parser — the load-boundary validator for
 * `astryx.integration.*`.
 *
 * This module IS the published `./integration` subpath, so it exports the
 * parser and nothing else. The schema it parses against, and the key census
 * derived from that schema, are internal to `./schema.mjs`; zod is sealed
 * there. Consumers call `parseIntegration` or import the
 * {@link AstryxIntegration} type.
 */

import {formatZodError} from '../_shared/errors.mjs';
import {integrationSchema} from './schema.mjs';

/** @typedef {import('./type.js').AstryxIntegration} AstryxIntegration */

/**
 * Validate an unknown value as an Astryx integration manifest, or throw.
 *
 * A key this CLI does not know is stripped rather than rejected — `schema.mjs`
 * carries the reasoning, and `unknownIntegrationKeys` there names the stripped
 * keys for callers that report them.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {AstryxIntegration}
 */
export function parseIntegration(input, label = 'astryx.integration') {
  const result = integrationSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return result.data;
}
