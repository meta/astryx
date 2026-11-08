// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template doc parser (stamped `type: 'page' | 'block'`). Zod is sealed
 * here; template discovery calls `parseTemplate` at the load boundary.
 *
 * Integration templates use the same authored fields as first-party templates;
 * discovery normalizes the result into the public {@link TemplateDoc} shape.
 */

import {z} from 'zod';
import {AuthoredDocGraphFields} from '../_schema.mjs';
import {formatZodError} from '../../_shared/errors.mjs';

/** @typedef {import('../types.js').TemplateDoc} TemplateDoc */
/** @typedef {import('./type.js').PageTemplateDoc} PageTemplateDoc */
/** @typedef {import('./type.js').BlockTemplateDoc} BlockTemplateDoc */

const previewSchema = z
  .object({
    image: z.string().optional(),
    aspectRatio: z.string().optional(),
  })
  .strict();

const registryIdentitySchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    aliases: z
      .array(
        z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/),
      )
      .optional(),
  })
  .strict();

const baseTemplateFields = {
  ...AuthoredDocGraphFields,
  name: z.string().min(1, 'name is required'),
  displayName: z.string().min(1).optional(),
  description: z.string().min(1, 'description is required').optional(),
  keywords: z.array(z.string().min(1)).optional(),
  category: z.string().optional(),
  componentsUsed: z.array(z.string()).optional(),
  preview: previewSchema.optional(),
  isReady: z.boolean().optional(),
  icons: z
    .record(
      z.string().regex(/^[$A-Z_a-z][$\w]*$/u, 'icons keys are imported names'),
      z
        .string()
        .regex(
          /^[a-z][a-zA-Z0-9]*$/u,
          'icons values are icon definition names',
        ),
    )
    .optional(),
  scaffold: z.boolean().optional(),
  isHiddenFromOverview: z.boolean().optional(),
  registry: registryIdentitySchema.optional(),
  replaces: z
    .string()
    .min(1, 'replaces must name a Core template id')
    .optional(),
};

const pageTemplateSchema = z
  .object({...baseTemplateFields, type: z.literal('page')})
  .strict();
const blockTemplateSchema = z
  .object({
    ...baseTemplateFields,
    type: z.literal('block'),
    exampleFor: z.string().min(1).optional(),
    alsoExampleFor: z.array(z.string()).optional(),
    alsoShowcaseFor: z.array(z.string()).optional(),
    aspectRatio: z.number().positive().optional(),
    scale: z.number().positive().optional(),
    isShowcase: z.boolean().optional(),
  })
  .strict();

/**
 * Templates as they load. Integration templates already published omit
 * `displayName` and `aspectRatio` and group themselves under their own
 * `category`, so the loader accepts those (template discovery falls back to an
 * aspect ratio of 1). The published `TemplateDoc` keeps asking authors for all
 * three; `IntegrationTemplateDoc`, for an integration package's templates,
 * takes the package's own `category`.
 *
 * @typedef {Omit<PageTemplateDoc, 'displayName' | 'category'>
 *   & {displayName?: string, category?: string}} LoadedPageTemplateDoc
 * @typedef {Omit<BlockTemplateDoc, 'displayName' | 'aspectRatio' | 'category'>
 *   & {displayName?: string, aspectRatio?: number, category?: string}} LoadedBlockTemplateDoc
 */

/**
 * @typedef {import('../../_shared/contract.js').Expect<
 *   import('../../_shared/contract.js').MutuallyAssignable<
 *     import('../../_shared/contract.js').NamedFields<z.infer<typeof pageTemplateSchema>>,
 *     import('../../_shared/contract.js').NamedFields<LoadedPageTemplateDoc>
 *   >
 * >} _PageTemplateDocDriftLock
 */

/**
 * @typedef {import('../../_shared/contract.js').Expect<
 *   import('../../_shared/contract.js').MutuallyAssignable<
 *     import('../../_shared/contract.js').NamedFields<z.infer<typeof blockTemplateSchema>>,
 *     import('../../_shared/contract.js').NamedFields<LoadedBlockTemplateDoc>
 *   >
 * >} _BlockTemplateDocDriftLock
 */

const templateEnvelopeSchema = z
  .discriminatedUnion('type', [pageTemplateSchema, blockTemplateSchema])
  .superRefine((template, context) => {
    if (
      template.type === 'block' &&
      template.isShowcase &&
      !template.exampleFor
    ) {
      context.addIssue({
        code: 'custom',
        path: ['exampleFor'],
        message: 'exampleFor is required when isShowcase is true',
      });
    }
  });

/**
 * Validate an unknown value as a stamped template doc, or throw. The zod schema
 * validates the integration-template envelope; the returned value is typed as
 * the public {@link TemplateDoc}.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {TemplateDoc}
 */
export function parseTemplate(input, label = 'template') {
  const result = templateEnvelopeSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return /** @type {TemplateDoc} */ (result.data);
}
