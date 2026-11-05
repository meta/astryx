// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Config parser — the load-boundary validator for `astryx.config.*`.
 *
 * Zod is sealed inside this module: the schema is module-private, never
 * exported, and never appears in a public type. Consumers call `parseConfig`
 * (or import the {@link AstryxConfig} type); they never see zod. A compile-time
 * drift-lock asserts the private schema still infers exactly `AstryxConfig`.
 */

import {z} from 'zod';
import {formatZodError} from '../_shared/errors.mjs';
import {parseGapReportHandler} from '../gap-report/parse.mjs';
import {parseDiscoverSource} from '../discover/parse.mjs';

/** @typedef {import('./type.js').AstryxConfig} AstryxConfig */
/** @typedef {import('./type.js').PostCodemodHook} PostCodemodHook */
/** @typedef {import('./type.js').XleComponent} XleComponent */
/** @typedef {import('./type.js').DebugConfig} DebugConfig */
/** @typedef {import('../debug/type.js').DebugEventHandler} DebugEventHandler */
/** @typedef {import('../gap-report/type.js').GapReportHandler} GapReportHandler */
/** @typedef {import('../discover/type.js').DiscoverSource} DiscoverSource */

// Typed `z.custom` so `z.infer` reproduces the real function type (not `unknown`).
const buildCommand = /** @type {z.ZodType<PostCodemodHook['buildCommand']>} */ (
  z.custom(value => typeof value === 'function', {
    message: 'Expected a function',
  })
);

const postCodemodHookSchema = z
  .object({
    name: z.string().optional(),
    buildCommand,
  })
  .strict();

const xleComponentSchema = z
  .object({
    from: z.string(),
    description: z.string().optional(),
    default: z.boolean().optional(),
  })
  .strict();

// Typed `z.custom` so `z.infer` reproduces the real handler type (not
// `unknown`), the same way the post-codemod hook above keeps its signature.
const debugSchema = /** @type {z.ZodType<DebugEventHandler>} */ (
  z.custom(value => typeof value === 'function', {
    message: 'Expected a function',
  })
);

// Reuse the shared load-boundary parser so project and integration handlers
// accept exactly one shape. Typed z.custom preserves the public function type.
const gapReportHandlerSchema = /** @type {z.ZodType<GapReportHandler>} */ (
  z.custom(
    value => {
      try {
        parseGapReportHandler(value);
        return true;
      } catch {
        return false;
      }
    },
    {message: 'Expected a GapReportHandler {audience, handle}'},
  )
);

// The same check an integration's `discover` named export passes. Typed
// z.custom preserves the public function type.
const discoverSourceSchema = /** @type {z.ZodType<DiscoverSource>} */ (
  z.custom(
    value => {
      try {
        parseDiscoverSource(value, 'discover');
        return true;
      } catch {
        return false;
      }
    },
    {message: 'Expected a discover source function'},
  )
);

const configSchema = z
  .object({
    integrations: z.array(z.string()).optional(),
    issuesUrl: z.string().url().optional(),
    hooks: z
      .object({postCodemod: z.array(postCodemodHookSchema).optional()})
      .strict()
      .optional(),
    debug: debugSchema.optional(),
    gapReport: gapReportHandlerSchema.optional(),
    discover: discoverSourceSchema.optional(),
    experimental: z
      .object({
        xle: z
          .object({
            components: z.record(z.string(), xleComponentSchema).optional(),
          })
          .strict()
          .optional(),
        iconSet: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Compile-time drift-lock: the sealed schema must infer EXACTLY the public
 * {@link AstryxConfig} type. If they drift, `Equal` becomes `false` and
 * `Expect<false>` fails the `tsconfig.authoring-contract.json` typecheck.
 *
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<z.infer<typeof configSchema>, AstryxConfig>
 * >} _ConfigDriftLock
 */

/**
 * Validate an unknown value as an Astryx config, or throw a readable error.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {AstryxConfig}
 */
export function parseConfig(input, label = 'astryx.config') {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return result.data;
}
