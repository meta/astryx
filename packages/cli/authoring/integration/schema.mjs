// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The integration-manifest schema, and the key census derived from it.
 *
 * Internal. No `exports` entry in package.json resolves here, so nothing in
 * this file is reachable from a published subpath — `parse.mjs` is the public
 * face of `./integration` and exports `parseIntegration` alone. Zod stays
 * sealed on this side of that line.
 *
 * The census is READ OFF the schema rather than written beside it. A key added
 * to one is a key added to the other, so a field this CLI supports can never
 * be reported as unsupported.
 */

import {z} from 'zod';
import {formatZodError} from '../_shared/errors.mjs';

/** @typedef {import('./type.js').AstryxIntegration} AstryxIntegration */

const MAX_AGENT_DOC_LINES = 8;
const MAX_CLI_COMMAND_CODE_POINTS = 120;
const MAX_AGENT_DOC_LINE_CODE_POINTS = 240;
const MANAGED_MARKER_TEXT = /(?:ASTRYX|XDS):(START|END)/u;
const PROVIDER_ID_RE =
  /^(?:@[a-z0-9][a-z0-9._~!*'()-]*\/)?[a-z0-9][a-z0-9._~!*'()-]*$/u;

/**
 * @param {string} value
 * @returns {string|null}
 */
function invalidAgentDocLine(value) {
  if (value.length === 0 || value.trim().length === 0)
    return 'must not be blank';
  if (value !== value.trim()) return 'must not have surrounding whitespace';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0) return 'must not contain NUL';
    if (codePoint === 0x2028 || codePoint === 0x2029) {
      return 'must be a single line';
    }
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return 'must not contain control characters or line separators';
    }
  }
  if (MANAGED_MARKER_TEXT.test(value))
    return 'must not contain managed marker text';
  const codePoints = [...value].length;
  if (codePoints > MAX_AGENT_DOC_LINE_CODE_POINTS) {
    return `must contain at most ${MAX_AGENT_DOC_LINE_CODE_POINTS} Unicode code points (received ${codePoints})`;
  }
  return null;
}

export const cliCommandSchema = z.string().superRefine((value, ctx) => {
  const message = invalidAgentDocLine(value);
  if (message) {
    ctx.addIssue({code: 'custom', message});
    return;
  }
  const codePoints = [...value].length;
  if (codePoints > MAX_CLI_COMMAND_CODE_POINTS) {
    ctx.addIssue({
      code: 'custom',
      message: `must contain at most ${MAX_CLI_COMMAND_CODE_POINTS} Unicode code points (received ${codePoints})`,
    });
  }
});

const agentDocLineSchema = z.string().superRefine((value, ctx) => {
  const message = invalidAgentDocLine(value);
  if (message) ctx.addIssue({code: 'custom', message});
});

export const agentDocsSchema = z.object({
  append: z
    .array(agentDocLineSchema)
    .max(
      MAX_AGENT_DOC_LINES,
      `append may contain at most ${MAX_AGENT_DOC_LINES} lines`,
    )
    .readonly()
    .optional(),
});

export const integrationBaseSchema = z.object({
  providerId: z
    .string()
    .regex(PROVIDER_ID_RE, 'providerId must be a canonical npm package name')
    .optional(),
  components: z.string().optional(),
  templates: z.string().optional(),
  codemods: z.string().optional(),
  docs: z.string().optional(),
  themes: z.string().optional(),
  // Experimental roots (spec:AST-017 FR27). An unknown key inside is
  // stripped, as unknown top-level keys are, so a newer CLI's experiment
  // never fails an older CLI's parse.
  experimental: z.object({iconSets: z.string().optional()}).optional(),
  issuesUrl: z.string().url().optional(),
  docsiteUrl: z.string().url().optional(),
});

// Unknown top-level keys are stripped rather than rejected. `.strict()` made a key from a
// newer CLI a hard parse failure, and a manifest that fails to parse
// contributes NOTHING — an integration that added one field lost its
// components, templates and codemods too, on every consumer resolving an older
// CLI, silently (#5119). A key this CLI does not know is a key it cannot act
// on; the rest of the manifest is still good, so the rest of the manifest is
// still loaded and the unknown key is reported as a warning by
// `unknownIntegrationKeys`. Known keys stay strictly typed: a `components: 42`
// IS an authoring mistake and still fails here.
export const integrationSchema = integrationBaseSchema.extend({
  agentDocs: agentDocsSchema.optional(),
  cliCommand: cliCommandSchema.optional(),
});

/**
 * Parse every default-manifest field except the independently isolated
 * `agentDocs` and `cliCommand` fields.
 * @param {unknown} input
 * @param {string} label
 * @returns {Omit<AstryxIntegration, 'agentDocs' | 'cliCommand'>}
 */
export function parseIntegrationBase(input, label) {
  const result = integrationBaseSchema.safeParse(input);
  if (!result.success) throw new Error(formatZodError(label, result.error));
  return result.data;
}

/**
 * Parse only the optional agent-doc contribution.
 * @param {unknown} input
 * @param {string} label
 * @returns {NonNullable<AstryxIntegration['agentDocs']>}
 */
export function parseAgentDocsField(input, label) {
  const result = agentDocsSchema.safeParse(input);
  if (!result.success) throw new Error(formatZodError(label, result.error));
  return result.data;
}

/**
 * Parse only the optional `cliCommand` field. Isolated like `agentDocs`: an
 * invalid command is ignored with a warning, and the rest of the manifest
 * still contributes.
 * @param {unknown} input
 * @param {string} label
 * @returns {string}
 */
export function parseCliCommandField(input, label) {
  const result = cliCommandSchema.safeParse(input);
  if (!result.success) throw new Error(formatZodError(label, result.error));
  return result.data;
}

/**
 * Compile-time drift-lock: sealed schema must infer exactly {@link AstryxIntegration}.
 *
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').Equal<z.infer<typeof integrationSchema>, AstryxIntegration>
 * >} _IntegrationDriftLock
 */

/**
 * The keys this CLI knows, taken from the schema itself.
 *
 * A manifest may hold others: an integration is published once and installed
 * against many CLI versions, so a key introduced later arrives here routinely
 * and is not an authoring mistake.
 *
 * @type {string[]}
 */
export const KNOWN_INTEGRATION_KEYS = Object.keys(integrationSchema.shape);

/**
 * The manifest keys this CLI does not know, in the order they were authored.
 *
 * Separate from `parseIntegration` because the two answer different questions:
 * the parser says whether the manifest is usable, and this says how much of it
 * this CLI is able to use. Callers report the difference — as a warning, never
 * a failure. Almost always the author is on a newer CLI than the consumer.
 *
 * @param {unknown} input
 * @returns {string[]}
 */
export function unknownIntegrationKeys(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return [];
  }
  return Object.keys(input).filter(
    key => !KNOWN_INTEGRATION_KEYS.includes(key),
  );
}
