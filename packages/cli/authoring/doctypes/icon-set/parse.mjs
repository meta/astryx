// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon-set descriptor and data-file parsers (AST-084 FR2, FR3). Zod is
 * sealed here; icon-set discovery calls `parseIconSet` on the statically read
 * descriptor and `parseIconSetData` on the parsed `<name>.icons.json`.
 *
 * The data parser checks the whole file, not only its shape: a duplicate id,
 * an icon with no words, a `map` key that is not a camelCase definition name
 * or a value that is not an icon id in the file, and a variant or default
 * naming a variant the set's `variants` do not declare all make the file
 * invalid,
 * and an invalid file withdraws its set from every surface (FR3). Whether each
 * `map` key is Astryx's definition or one the set declares is checked by
 * icon-set discovery, which reads the definition files.
 *
 * @input an unknown descriptor value, or an unknown parsed data file
 * @output a validated IconSetDoc / IconSetData, or a readable schema error
 * @position packages/cli/authoring/doctypes/icon-set — load boundary
 */

import {z} from 'zod';
import {formatZodError} from '../../_shared/errors.mjs';
import {ICON_DEFINITION_NAME_RE} from '../icon-definition/parse.mjs';

/** @typedef {import('./type.js').IconSetDoc} IconSetDoc */
/** @typedef {import('./type.js').IconSetData} IconSetData */

/**
 * The confidences a reviewed match may carry: template mapping applies the
 * first two and suggests the last.
 */
export const MATCH_CONFIDENCES = /** @type {const} */ ([
  'exact',
  'strong',
  'likely',
]);

const KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const EXPORT_RE = /^[$A-Z_a-z][$\w]*$/u;
// A bare package specifier, optionally with a subpath: never relative or
// absolute, so no path in the data file can leave the package (FR5).
// A path inside the set's package, from its root: `./src/icons.js`.
const PACKAGE_PATH_RE = /^\.\/(?:[A-Za-z0-9._~@-]+\/)*[A-Za-z0-9._~@-]+$/u;
const packagePathSchema = z
  .string()
  .regex(PACKAGE_PATH_RE, 'must be a ./ path inside the package')
  .refine(
    value =>
      !value
        .split('/')
        .slice(1)
        .some(part => part === '..' || part === '.'),
    {message: 'must not contain "." or ".." segments'},
  );
const MODULE_RE =
  /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:\/[A-Za-z0-9._~-]+)*$/u;

/** @param {string} field */
const nonBlank = field =>
  z.string().refine(value => value.trim() !== '', {
    message: `${field} must not be blank`,
    abort: true,
  });

const iconSetDocSchema = z
  .object({
    type: z.literal('icon-set'),
    name: nonBlank('name').regex(
      KEBAB_RE,
      'name must be lowercase kebab-case starting with a letter',
    ),
    displayName: nonBlank('displayName'),
    description: z.string(),
    maintained: z.boolean(),
    license: nonBlank('license'),
  })
  .strict();

const moduleSchema = z
  .string()
  .regex(
    MODULE_RE,
    'module must be a package import specifier, never a relative or absolute path',
  )
  .refine(
    value => !value.split('/').some(part => part === '..' || part === '.'),
    {
      message: 'module must not contain "." or ".." segments',
    },
  );
const exportSchema = z
  .string()
  .regex(EXPORT_RE, 'export must be a JavaScript identifier');
const variantNameSchema = z
  .string()
  .regex(KEBAB_RE, 'a variant must be lowercase kebab-case');

const variantSchema = z
  .object({
    variant: variantNameSchema,
    export: exportSchema,
    module: moduleSchema.optional(),
  })
  .strict();

const matchSchema = z
  .object({
    set: z.string().regex(KEBAB_RE, 'set must be a lower-kebab set name'),
    export: exportSchema,
    variant: nonBlank('variant').optional(),
    confidence: z.enum(MATCH_CONFIDENCES),
  })
  .strict();

const iconSchema = z
  .object({
    id: z
      .string()
      .regex(ID_RE, 'id must be lowercase kebab-case letters and digits'),
    export: exportSchema,
    module: moduleSchema.optional(),
    words: z
      .array(
        nonBlank('word').refine(
          word => word === word.toLowerCase() && word === word.trim(),
          {message: 'words must be lower-case and trimmed'},
        ),
      )
      .min(1, 'an icon must have at least one word'),
    variants: z.array(variantSchema).optional(),
    matches: z.array(matchSchema).optional(),
  })
  .strict();

const dataSchema = z
  .object({
    schemaVersion: z.literal(1),
    module: moduleSchema,
    source: z
      .object({
        package: nonBlank('source.package'),
        version: nonBlank('source.version'),
      })
      .strict()
      .optional(),
    exclude: z.array(exportSchema).optional(),
    variants: z.array(variantNameSchema).min(1).optional(),
    default: z
      .object({variant: variantNameSchema.optional()})
      .strict()
      .optional(),
    themeMap: exportSchema.optional(),
    map: z.record(z.string(), z.string()).optional(),
    generated: packagePathSchema
      .refine(value => /\.(?:[cm]?js|jsx|tsx?|mts)$/u.test(value), {
        message: 'generated must be a JavaScript or TypeScript module file',
      })
      .optional(),
    adapter: z
      .object({module: packagePathSchema, export: exportSchema})
      .strict()
      .optional(),
    icons: z.array(iconSchema),
  })
  .strict()
  .superRefine((data, ctx) => {
    const declared = data.variants ?? [];
    /**
     * Whether a named variant is one the set declares.
     * @param {string | undefined} variant
     * @param {(string|number)[]} at
     */
    const checkVariant = (variant, at) => {
      if (variant != null && !declared.includes(variant)) {
        ctx.addIssue({
          code: 'custom',
          path: [...at, 'variant'],
          message: `variant "${variant}" is not in variants`,
        });
      }
    };

    declared.forEach((variant, at) => {
      if (declared.indexOf(variant) !== at) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants', at],
          message: `variant "${variant}" is listed twice`,
        });
      }
    });
    if (data.default) checkVariant(data.default.variant, ['default']);
    const defaultVariant = data.default?.variant;

    /** @type {Map<string, number>} */
    const ids = new Map();
    data.icons.forEach((icon, index) => {
      const first = ids.get(icon.id);
      if (first != null) {
        ctx.addIssue({
          code: 'custom',
          path: ['icons', index, 'id'],
          message: `duplicate id "${icon.id}" (also icons.${first})`,
        });
      } else {
        ids.set(icon.id, index);
      }
      /** @type {Set<string>} */
      const named = new Set();
      (icon.matches ?? []).forEach((match, at) => {
        const key = `${match.set}\0${match.variant ?? ''}\0${match.export}`;
        if (named.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['icons', index, 'matches', at],
            message: `the match ${match.set}${match.variant ? ` ${match.variant}` : ''} "${match.export}" is listed twice`,
          });
        }
        named.add(key);
      });
      /** @type {Set<string>} */
      const drawn = new Set();
      (icon.variants ?? []).forEach((entry, at) => {
        const where = ['icons', index, 'variants', at];
        checkVariant(entry.variant, where);
        if (entry.variant === defaultVariant) {
          ctx.addIssue({
            code: 'custom',
            path: [...where, 'variant'],
            message: `variant "${entry.variant}" is the default: the icon's own export draws it`,
          });
        } else if (drawn.has(entry.variant)) {
          ctx.addIssue({
            code: 'custom',
            path: [...where, 'variant'],
            message: `variant "${entry.variant}" is listed twice`,
          });
        }
        drawn.add(entry.variant);
      });
    });

    for (const [name, id] of Object.entries(data.map ?? {})) {
      if (!ICON_DEFINITION_NAME_RE.test(name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['map', name],
          message: `"${name}" is not an icon definition name: definitions are camelCase`,
        });
      }
      if (!ids.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['map', name],
          message: `"${id}" is not the id of an icon in this file`,
        });
      }
    }
  });

/** Zod skips `__proto__` when it looks for unknown keys. */
const PROTO_KEY_ISSUE = {
  code: /** @type {const} */ ('unrecognized_keys'),
  keys: ['__proto__'],
  path: [],
  message: 'Unrecognized key: "__proto__"',
};

/**
 * Compile-time drift locks: the sealed schemas must infer the public types.
 *
 * @typedef {import('../../_shared/contract.js').Expect<
 *   import('../../_shared/contract.js').Equal<
 *     z.infer<typeof iconSetDocSchema>,
 *     IconSetDoc
 *   >
 * >} _IconSetDocDriftLock
 * @typedef {import('../../_shared/contract.js').Expect<
 *   import('../../_shared/contract.js').MutuallyAssignable<
 *     z.infer<typeof dataSchema>,
 *     IconSetData
 *   >
 * >} _IconSetDataDriftLock
 */

/**
 * Validate an unknown value as an icon-set descriptor, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {IconSetDoc}
 * @experimental May change or be removed in a patch release.
 */
export function parseIconSet(input, label = 'icon set') {
  const result = iconSetDocSchema.safeParse(input);
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

/**
 * Validate an unknown value as an icon-set data file (`<name>.icons.json`),
 * shape and consistency both, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {IconSetData}
 * @experimental May change or be removed in a patch release.
 */
export function parseIconSetData(input, label = 'icon set data') {
  const result = dataSchema.safeParse(input);
  if (result.success) return /** @type {IconSetData} */ (result.data);
  throw new Error(formatZodError(label, result.error));
}
