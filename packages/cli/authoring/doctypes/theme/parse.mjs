// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Theme doc parser (stamped `type: 'theme'`). Zod is sealed here;
 * theme discovery calls `parseTheme` at the descriptor load boundary.
 *
 * @input an unknown loaded or statically extracted theme descriptor
 * @output a validated ThemeDoc or a readable schema error
 * @position packages/cli/authoring/doctypes/theme — descriptor load boundary
 */

import {z} from 'zod';
import {formatZodError} from '../../_shared/errors.mjs';

/** @typedef {import('./type.js').ThemeDoc} ThemeDoc */

/** @param {string} field */
const nonBlank = field =>
  z.string().refine(value => value.trim() !== '', {
    message: `${field} must not be blank`,
    abort: true,
  });

const themeDocSchema = z
  .object({
    type: z.literal('theme'),
    name: nonBlank('name').regex(
      /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u,
      'name must be lowercase kebab-case starting with a letter',
    ),
    displayName: nonBlank('displayName'),
    // Blank is allowed, as the released catalog allowed it.
    description: z.string(),
    maintained: z.boolean(),
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
 * Compile-time drift lock: the sealed schema must infer exactly ThemeDoc.
 *
 * @typedef {import('../../_shared/contract.js').Expect<
 *   import('../../_shared/contract.js').Equal<
 *     z.infer<typeof themeDocSchema>,
 *     ThemeDoc
 *   >
 * >} _ThemeDocDriftLock
 */

/**
 * Validate an unknown value as a theme descriptor, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {ThemeDoc}
 */
export function parseTheme(input, label = 'theme') {
  const result = themeDocSchema.safeParse(input);
  const protoKey =
    input !== null &&
    typeof input === 'object' &&
    Object.hasOwn(input, '__proto__');
  if (result.success && !protoKey) return result.data;
  const issues = [
    ...(result.error?.issues ?? []),
    ...(protoKey ? [PROTO_KEY_ISSUE] : []),
  ];
  throw new Error(formatZodError(label, new z.ZodError(issues)));
}
