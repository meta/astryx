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

/** A JavaScript identifier, as a component export or a prop is written. */
const PROP_NAME_RE = /^[A-Za-z_$][\w$]*$/u;

/**
 * A manifest's themeProvider as this CLI can use it, with each field it
 * drops and why: a provider whose export is no component name or whose
 * module is blank is dropped whole; a themeProp that names no prop, or a
 * modeProp that names no prop or has no themeProp beside it, is dropped
 * alone. Other fields pass through (the schema strips unknown ones).
 * @param {unknown} value
 * @returns {{value: unknown, dropped: Array<{field: string, why: string}>}}
 */
function readThemeProvider(value) {
  if (value === undefined) return {value, dropped: []};
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    return {
      value: undefined,
      dropped: [{field: 'themeProvider', why: 'it is not an object'}],
    };
  const v = /** @type {Record<string, unknown>} */ (value);
  if (typeof v.export !== 'string' || !/^[A-Z_$][\w$]*$/u.test(v.export))
    return {
      value: undefined,
      dropped: [
        {field: 'themeProvider', why: 'its export does not name a component'},
      ],
    };
  if (typeof v.from !== 'string' || v.from.trim() === '')
    return {
      value: undefined,
      dropped: [{field: 'themeProvider', why: 'its from is blank'}],
    };
  /** @type {Array<{field: string, why: string}>} */
  const dropped = [];
  const out = {...v};
  const names = (/** @type {unknown} */ x) =>
    typeof x === 'string' && PROP_NAME_RE.test(x);
  if (out.themeProp !== undefined && !names(out.themeProp)) {
    delete out.themeProp;
    dropped.push({field: 'themeProvider.themeProp', why: 'it names no prop'});
  }
  if (out.modeProp !== undefined) {
    if (!names(out.modeProp)) {
      delete out.modeProp;
      dropped.push({field: 'themeProvider.modeProp', why: 'it names no prop'});
    } else if (out.themeProp === undefined) {
      // A mode passed alone means nothing: the theme goes with it.
      delete out.modeProp;
      dropped.push({
        field: 'themeProvider.modeProp',
        why: 'it needs themeProp beside it',
      });
    }
  }
  return {value: out, dropped};
}

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
  // One provider component that wires every theme under `themes` into an
  // app. Each theme's stylesheet stays the one its package exports. It is
  // a hint, so it never stops the manifest loading: a field that cannot be
  // used is dropped (the whole block when the provider itself cannot be
  // named), and ignoredIntegrationFields says why. An unknown key inside is
  // stripped, as unknown top-level keys are.
  themeProvider: z.preprocess(
    value => readThemeProvider(value).value,
    z
      .object({
        export: z.string(),
        from: z.string(),
        themeProp: z.string().optional(),
        modeProp: z.string().optional(),
      })
      .optional(),
  ),
  // Experimental roots (spec:AST-017 FR27). An unknown key inside is
  // stripped, as unknown top-level keys are, so a newer CLI's experiment
  // never fails an older CLI's parse.
  experimental: z.object({iconSets: z.string().optional()}).optional(),
  issuesUrl: z.string().url().optional(),
  docsiteUrl: z.string().url().optional(),
  logo: z.object({light: z.string(), dark: z.string().optional()}).optional(),
  base: z
    .object({adapters: z.record(z.string(), z.string()).optional()})
    .optional(),
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
 * The known keys whose inner keys this CLI reports when it does not know
 * them: an object whose fields the docs describe one by one, so a later
 * CLI may add one. Other objects keep an unknown inner key unreported.
 */
const INNER_KEYS_REPORTED = new Set(['themeProvider']);

/**
 * The object schema a known key holds, or null when it holds no object.
 * @param {string} key
 * @returns {Record<string, unknown> | null}
 */
function objectShape(key) {
  /** @type {any} */
  let type =
    integrationSchema.shape[
      /** @type {keyof typeof integrationSchema.shape} */ (key)
    ];
  // Through optional wrappers and a preprocess (whose output is the object).
  while (type && !type.shape) {
    if (typeof type.unwrap === 'function') type = type.unwrap();
    else if (type.out) type = type.out;
    else break;
  }
  return type?.shape ?? null;
}

/**
 * The manifest keys this CLI does not know, in the order they were authored,
 * a key inside a known object named `<key>.<inner>`.
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
  return Object.entries(input).flatMap(([key, value]) => {
    if (!KNOWN_INTEGRATION_KEYS.includes(key)) return [key];
    if (!INNER_KEYS_REPORTED.has(key)) return [];
    const inner = objectShape(key);
    if (!inner || value == null || typeof value !== 'object') return [];
    return Object.keys(value)
      .filter(name => !Object.hasOwn(inner, name))
      .map(name => `${key}.${name}`);
  });
}

/**
 * The manifest fields this CLI drops because it cannot use them, each with
 * why, for callers that report them as warnings: the manifest still loads.
 * @param {unknown} input
 * @returns {Array<{field: string, why: string}>}
 */
export function ignoredIntegrationFields(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input))
    return [];
  return readThemeProvider(
    /** @type {Record<string, unknown>} */ (input).themeProvider,
  ).dropped;
}
