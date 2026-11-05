// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Gap-report handler parser — the load-boundary validator for the
 * `gapReport` named export in integration manifests and the `gapReport` field
 * in `astryx.config`.
 *
 * Zod is sealed in here: the schema is module-private, never exported, and
 * never appears in a public type. A compile-time drift-lock asserts it still
 * infers exactly the published interface.
 */

import {z} from 'zod';
import {formatZodError} from '../_shared/errors.mjs';

/** @typedef {import('./type.js').GapReportHandler} GapReportHandler */
/** @typedef {import('./type.js').GapReportHandlerReceipt} GapReportHandlerReceipt */

// Typed z.custom so z.infer reproduces the real function type, matching the
// pattern used by the debug handler and post-codemod hook parsers.
const handleFn = /** @type {z.ZodType<GapReportHandler['handle']>} */ (
  z.custom(value => typeof value === 'function', {
    message: 'Expected a function',
  })
);

const handlerSchema = z
  .object({
    audience: z.enum(['internal', 'public']),
    handle: handleFn,
  })
  .strict();

/**
 * Compile-time drift-lock: the sealed schema must infer EXACTLY the public
 * {@link GapReportHandler} type. If they drift, `MutuallyAssignable` becomes
 * `false` and `Expect<false>` fails `tsconfig.authoring-contract.json`.
 *
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<z.infer<typeof handlerSchema>, GapReportHandler>
 * >} _GapReportHandlerDriftLock
 */

const receiptSchema = z
  .object({
    status: z.enum(['filed', 'routed_only', 'skipped']),
    url: z.string().optional(),
    message: z.string().optional(),
  })
  .strict();

/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<z.infer<typeof receiptSchema>, GapReportHandlerReceipt>
 * >} _GapReportReceiptDriftLock
 */

/**
 * Validate an unknown value as a `GapReportHandler`, or throw a readable error.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {GapReportHandler}
 */
export function parseGapReportHandler(input, label = 'gapReport handler') {
  const result = handlerSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return result.data;
}

/**
 * Validate a handler's return value as a strict `GapReportHandlerReceipt`.
 * Returns the validated receipt, or null when invalid.
 *
 * This runs on the HOT path (called per handler per invocation), so it returns
 * null on failure rather than throwing — the caller records a failed delivery.
 *
 * @param {unknown} input
 * @returns {GapReportHandlerReceipt | null}
 */
export function parseGapReportReceipt(input) {
  const result = receiptSchema.safeParse(input);
  if (!result.success) return null;

  const receipt = result.data;
  const url = receipt.url?.trim() || undefined;
  const message = receipt.message?.trim() || undefined;

  // routed_only requires a URL
  if (receipt.status === 'routed_only' && !url) return null;

  // URL must be http(s)
  if (url != null) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return null;
      }
    } catch {
      return null;
    }
  }

  // message length cap
  if (message != null && Array.from(message).length > 2000) {
    return null;
  }

  // At least url or message where applicable (filed/routed_only)
  if (receipt.status !== 'skipped' && url == null && message == null) {
    return null;
  }

  return {
    status: receipt.status,
    ...(url == null ? {} : {url}),
    ...(message == null ? {} : {message}),
  };
}
