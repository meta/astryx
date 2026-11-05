// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod parser — the load-boundary validator for a codemod module's
 * default export. Integration codemod discovery runs each module's default
 * export through `parseCodemod` during `astryx upgrade`. Zod is sealed here;
 * authors write a plain object with a `type` discriminant (no factory).
 */

import {z} from 'zod';
import {formatZodError} from '../_shared/errors.mjs';

/** @typedef {import('./type.js').AstryxCodemod} AstryxCodemod */
/** @typedef {import('./type.js').AstryxConfigCodemod} AstryxConfigCodemod */
/** @typedef {import('./type.js').AstryxCodemodTransform} AstryxCodemodTransform */

const transform = /** @type {z.ZodType<AstryxCodemodTransform>} */ (
  z.custom(value => typeof value === 'function', {
    message: 'Expected a function',
  })
);

const codeCodemodSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    isOptional: z.boolean().optional().default(false),
    fileExtensions: z.array(z.string()).optional(),
    transform,
    type: z.literal('code'),
  })
  .strict();

const configCodemodSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    isOptional: z.boolean().optional().default(false),
    transform,
    type: z.literal('config'),
  })
  .strict();

/**
 * The load-boundary contract: a stamped codemod default export, discriminated
 * by `type` (`'code'` may carry `fileExtensions`; `'config'` may not).
 */
const codemodEnvelopeSchema = z.discriminatedUnion('type', [
  codeCodemodSchema,
  configCodemodSchema,
]);

/**
 * Compile-time drift-lock: sealed envelope must infer exactly the public
 * stamped-codemod union.
 *
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').Equal<
 *     z.infer<typeof codemodEnvelopeSchema>,
 *     AstryxCodemod | AstryxConfigCodemod
 *   >
 * >} _CodemodDriftLock
 */

/**
 * Validate an unknown value as a stamped codemod default export, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {AstryxCodemod | AstryxConfigCodemod}
 */
export function parseCodemod(input, label = 'codemod') {
  const result = codemodEnvelopeSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return result.data;
}
