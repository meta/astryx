// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon definition parser (AST-084). Zod is sealed here; definition discovery
 * calls `parseIconDefinition` on each statically read `<name>.doc.mjs`.
 *
 * @input an unknown definition value
 * @output a validated IconDefinitionDoc, or a readable schema error
 * @position packages/cli/authoring/doctypes/icon-definition — load boundary
 */

import {z} from 'zod';
import {formatZodError} from '../../_shared/errors.mjs';

/** @typedef {import('./type.js').IconDefinitionDoc} IconDefinitionDoc */

/** A definition name: camelCase, starting with a lower-case letter. */
export const ICON_DEFINITION_NAME_RE = /^[a-z][a-zA-Z0-9]*$/u;

/** @param {string} field */
const nonBlank = field =>
  z.string().refine(value => value.trim() !== '', {
    message: `${field} must not be blank`,
    abort: true,
  });

const iconDefinitionSchema = z
  .object({
    type: z.literal('icon-definition'),
    name: nonBlank('name').regex(
      ICON_DEFINITION_NAME_RE,
      'name must be camelCase starting with a lower-case letter',
    ),
    description: nonBlank('description'),
    words: z
      .array(
        nonBlank('word').refine(
          word => word === word.toLowerCase() && word === word.trim(),
          {message: 'words must be lower-case and trimmed'},
        ),
      )
      .min(1, 'a definition must have at least one word'),
    builtIn: z.literal(true).optional(),
    stability: z.literal('experimental').optional(),
  })
  .strict();

/** Zod skips `__proto__` when it looks for unknown keys. */
const PROTO_KEY_ISSUE = {
  code: /** @type {const} */ ('unrecognized_keys'),
  keys: ['__proto__'],
  path: [],
  message: 'Unrecognized key: "__proto__"',
};

/**
 * Compile-time drift lock: the sealed schema must infer IconDefinitionDoc.
 *
 * @typedef {import('../../_shared/contract.js').Expect<
 *   import('../../_shared/contract.js').MutuallyAssignable<
 *     z.infer<typeof iconDefinitionSchema>,
 *     IconDefinitionDoc
 *   >
 * >} _IconDefinitionDocDriftLock
 */

/**
 * Validate an unknown value as an icon definition, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {IconDefinitionDoc}
 * @experimental May change or be removed in a patch release.
 */
export function parseIconDefinition(input, label = 'icon definition') {
  const result = iconDefinitionSchema.safeParse(input);
  const protoKey =
    input !== null &&
    typeof input === 'object' &&
    Object.hasOwn(input, '__proto__');
  if (result.success && !protoKey) {
    return /** @type {IconDefinitionDoc} */ (result.data);
  }
  const issues = [
    ...(result.error?.issues ?? []),
    ...(protoKey ? [PROTO_KEY_ISSUE] : []),
  ];
  throw new Error(formatZodError(label, new z.ZodError(issues)));
}
