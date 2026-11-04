// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Sealed doc load-boundary schemas (doctypes-internal).
 *
 * Existing doctypes keep their historical top-level passthrough policy so
 * already-published docs continue to load. NamespaceDoc and every semantic
 * content block are strict: a misspelled field cannot reach a renderer as
 * missing data.
 */

import {z} from 'zod';

/** @typedef {import('./base/type.js').AuthoredDocGraphFields} AuthoredDocGraphFieldsType */
/** @typedef {import('./base/type.js').AuthoredDocKind} AuthoredDocKind */
/** @typedef {import('./namespace/type.js').NamespaceDoc} NamespaceDoc */
/** @typedef {import('./reference/type.js').ReferenceContentBlock} ReferenceContentBlock */
/** @typedef {import('./reference/type.js').GraphContentBlock} GraphContentBlock */
/** @typedef {import('./reference/type.js').ReferenceSection} ReferenceSection */
/** @typedef {import('./reference/type.js').ReferenceDoc} ReferenceDoc */
/** @typedef {import('./component/type.js').SingleComponentDoc} SingleComponentDoc */
/** @typedef {import('./base/type.js').ComponentPropDoc} ComponentPropDoc */
/** @typedef {import('./hook/type.js').HookDoc} HookDoc */
/** @typedef {import('./function/type.js').FunctionDoc} FunctionDoc */
/** @typedef {import('./schema/type.js').SchemaDoc} SchemaDoc */
/** @typedef {import('./command/type.js').CommandDoc} CommandDoc */
/** @typedef {import('./enum/type.js').EnumDoc} EnumDoc */

const nonEmptyString = z.string().min(1);

/** Every authored doc-kind discriminant accepted by parseDoc. */
export const AuthoredDocKindSchema = z.enum([
  'component',
  'function',
  'generic',
  'page',
  'block',
  'schema',
  'command',
  'enum',
  'namespace',
  'icon-definition',
]);

/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').Equal<z.infer<typeof AuthoredDocKindSchema>, AuthoredDocKind>
 * >} _AuthoredDocKindDriftLock
 */

/** Shared optional graph fields for every authored doc kind. */
export const AuthoredDocGraphFields = {
  placement: z
    .object({
      parent: nonEmptyString,
      slot: nonEmptyString.optional(),
      order: z.number().int().safe().optional(),
    })
    .strict()
    .optional(),
  aliases: z.array(nonEmptyString).optional(),
  audience: z.enum(['public', 'internal']).optional(),
  stability: z.literal('experimental').optional(),
};

const _AuthoredDocGraphSchema = z.object(AuthoredDocGraphFields).strict();

/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<
 *     z.infer<typeof _AuthoredDocGraphSchema>,
 *     AuthoredDocGraphFieldsType
 *   >
 * >} _AuthoredDocGraphDriftLock
 */

const ProseBlockSchema = z
  .object({type: z.literal('prose'), text: nonEmptyString})
  .strict();
const HeadingBlockSchema = z
  .object({
    type: z.literal('heading'),
    level: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    text: nonEmptyString,
  })
  .strict();
const CodeBlockSchema = z
  .object({
    type: z.literal('code'),
    lang: nonEmptyString,
    code: z.string(),
    label: nonEmptyString.optional(),
  })
  .strict();
const TableBlockSchema = z
  .object({
    type: z.literal('table'),
    headers: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
  })
  .strict()
  .superRefine((table, context) => {
    table.rows.forEach((row, index) => {
      if (row.length !== table.headers.length) {
        context.addIssue({
          code: 'custom',
          path: ['rows', index],
          message: `expected ${table.headers.length} cells`,
        });
      }
    });
  });
const ListBlockSchema = z
  .object({
    type: z.literal('list'),
    style: z.enum(['ordered', 'unordered', 'do', 'dont']),
    items: z.array(nonEmptyString).min(1),
  })
  .strict();
const TokenReferenceBlockSchema = z
  .object({
    type: z.literal('token-ref'),
    topic: nonEmptyString,
    section: nonEmptyString,
  })
  .strict();
const WorkflowBlockSchema = z
  .object({
    type: z.literal('workflow'),
    title: nonEmptyString.optional(),
    steps: z
      .array(
        z
          .object({
            title: nonEmptyString,
            description: nonEmptyString.optional(),
            references: z.array(nonEmptyString).min(1).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
const CollectionBlockSchema = z
  .object({
    type: z.literal('collection'),
    title: nonEmptyString.optional(),
    source: z.object({slot: nonEmptyString}).strict(),
    presentation: z.enum(['list', 'cards', 'compact']).optional(),
    whenEmpty: z.enum(['show', 'omit']).optional(),
  })
  .strict();
const ReferenceBlockSchema = z
  .object({
    type: z.literal('reference'),
    target: nonEmptyString,
    projection: z
      .object({
        fields: z.array(nonEmptyString).min(1).optional(),
        sections: z.array(nonEmptyString).min(1).optional(),
      })
      .strict()
      .optional(),
    presentation: z.enum(['summary', 'compact', 'full']).optional(),
  })
  .strict();

/** Runtime schema for the stable content-block union published in 0.6.x. */
export const ReferenceContentBlockSchema = z.discriminatedUnion('type', [
  ProseBlockSchema,
  HeadingBlockSchema,
  CodeBlockSchema,
  TableBlockSchema,
  ListBlockSchema,
  TokenReferenceBlockSchema,
]);

/** Runtime schema for graph-only blocks used by NamespaceDoc. */
export const GraphContentBlockSchema = z.discriminatedUnion('type', [
  WorkflowBlockSchema,
  CollectionBlockSchema,
  ReferenceBlockSchema,
]);

/**
 * A topic section's blocks: the stable union, plus a reference block, which a
 * read inlines as the doc it includes.
 */
export const SectionContentBlockSchema = z.discriminatedUnion('type', [
  ProseBlockSchema,
  HeadingBlockSchema,
  CodeBlockSchema,
  TableBlockSchema,
  ListBlockSchema,
  TokenReferenceBlockSchema,
  ReferenceBlockSchema,
]);

/** Namespace content accepts both stable reference blocks and graph-only blocks. */
export const NamespaceContentBlockSchema = z.discriminatedUnion('type', [
  ProseBlockSchema,
  HeadingBlockSchema,
  CodeBlockSchema,
  TableBlockSchema,
  ListBlockSchema,
  TokenReferenceBlockSchema,
  WorkflowBlockSchema,
  CollectionBlockSchema,
  ReferenceBlockSchema,
]);

/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').Equal<
 *     z.infer<typeof ReferenceContentBlockSchema>,
 *     ReferenceContentBlock
 *   >
 * >} _ReferenceContentBlockDriftLock
 */

/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').Equal<
 *     z.infer<typeof GraphContentBlockSchema>,
 *     GraphContentBlock
 *   >
 * >} _GraphContentBlockDriftLock
 */

/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').Equal<
 *     z.infer<typeof SectionContentBlockSchema>,
 *     ReferenceSection['content'][number]
 *   >
 * >} _SectionContentBlockDriftLock
 */

const ReferenceSectionSchema = z
  .object({
    id: nonEmptyString.optional(),
    title: nonEmptyString,
    category: z.string().optional(),
    content: z.array(SectionContentBlockSchema),
    // Where an extension adds this section to the topic it extends: before
    // or after the section with this key. Ignored on any other section.
    before: nonEmptyString.optional(),
    after: nonEmptyString.optional(),
    previewType: z
      .enum([
        'swatch',
        'shadow-box',
        'radius-box',
        'spacing-bar',
        'size-bar',
        'border-line',
        'duration-bar',
        'easing-curve',
        'font-sample',
      ])
      .optional(),
  })
  .strict();

const PropSchema = z
  .object({
    name: z.string().min(1, 'prop name is required'),
    type: z.string().min(1, 'prop type is required'),
    description: z.string(),
    default: z.string().optional(),
    required: z.boolean().optional(),
  })
  .passthrough();

const ParamSchema = z
  .object({
    name: z.string().min(1, 'param name is required'),
    type: z.string().min(1, 'param type is required'),
    description: z.string(),
    default: z.string().optional(),
    required: z.boolean().optional(),
  })
  .passthrough();

const ReturnSchema = z
  .object({
    name: z.string().min(1, 'return name is required'),
    type: z.string().min(1, 'return type is required'),
    description: z.string(),
  })
  .passthrough();

const BaseDocFields = {
  ...AuthoredDocGraphFields,
  name: z.string().min(1, 'name is required'),
  displayName: z.string().optional(),
  description: z.string().optional(),
  usage: z.unknown().optional(),
  import: z.string().min(1).optional(),
  group: z.string().optional(),
  category: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  parent: z.string().optional(),
  relatedDocs: z.array(z.string()).optional(),
  hidden: z.boolean().optional(),
  isHiddenFromOverview: z.boolean().optional(),
};

const ComponentBaseSchema = z
  .object({
    ...BaseDocFields,
    type: z.literal('component'),
    theming: z.unknown().optional(),
    playground: z.unknown().optional(),
    examples: z.array(z.unknown()).optional(),
    replaces: z.string().min(1).optional(),
  })
  .passthrough();

/**
 * One entry in a group doc's `components`: a full ComponentEntry or a
 * name-only ComponentRef. Readers look every entry up by `name`, so that much
 * is checked here; the rest passes through, as on an unstamped doc.
 */
const ComponentGroupEntrySchema = z
  .object({name: z.string().min(1, 'component name is required')})
  .passthrough();

/**
 * New-format stamped component doc (`type: 'component'`): one component's
 * `props`, or the `components` a group doc documents together. These are the
 * shapes the published ComponentDoc type allows, and the ones an unstamped doc
 * may already take.
 */
export const ComponentDocKindSchema = ComponentBaseSchema.extend({
  props: z.array(PropSchema).optional(),
  components: z.array(ComponentGroupEntrySchema).optional(),
}).superRefine((doc, context) => {
  if (doc.props == null && doc.components == null) {
    context.addIssue({
      code: 'custom',
      path: ['props'],
      message:
        'expected the props array, or `components` for a doc that groups several components',
    });
  }
});

/**
 * A stamped component doc as it loads. The loader accepts what the unstamped
 * format always accepted, so stamping an existing doc never breaks it:
 * `displayName` may be missing, `category` is any string, `usage`, `theming`,
 * `playground` and `examples` pass through unchecked, and a doc has `props`,
 * `components`, or both; each `components` entry needs only a `name`. Every
 * other field matches the published type.
 *
 * @typedef {Omit<SingleComponentDoc,
 *     'type' | 'displayName' | 'category' | 'usage' | 'theming' | 'examples' | 'playground' | 'props'>
 *   & {type: 'component', displayName?: string, category?: string, usage?: unknown,
 *     theming?: unknown, examples?: unknown[], playground?: unknown,
 *     props?: ComponentPropDoc[], components?: Array<{name: string}>}} LoadedComponentDoc
 */
/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<
 *     import('../_shared/contract.js').NamedFields<z.infer<typeof ComponentDocKindSchema>>,
 *     import('../_shared/contract.js').NamedFields<LoadedComponentDoc>
 *   >
 * >} _ComponentDocDriftLock
 */

/** Return entry for generalized function docs. */
const FunctionReturnSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.string().min(1, 'return type is required'),
    description: z.string(),
  })
  .passthrough();

/** New-format stamped function doc (`type: 'function'`). */
export const FunctionDocKindSchema = z
  .object({
    ...BaseDocFields,
    type: z.literal('function'),
    params: z.array(ParamSchema),
    returns: z.array(FunctionReturnSchema),
  })
  .passthrough();

/**
 * A stamped function doc as it loads: as with components, `displayName` may be
 * missing and `usage` passes through unchecked.
 *
 * @typedef {Omit<FunctionDoc, 'type' | 'displayName' | 'usage'>
 *   & {type: 'function', displayName?: string, usage?: unknown}} LoadedFunctionDoc
 */
/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<
 *     import('../_shared/contract.js').NamedFields<z.infer<typeof FunctionDocKindSchema>>,
 *     import('../_shared/contract.js').NamedFields<LoadedFunctionDoc>
 *   >
 * >} _FunctionDocDriftLock
 */

/**
 * Every HookDoc is a FunctionDoc, so the one function schema covers both.
 *
 * @typedef {import('../_shared/contract.js').Expect<[HookDoc] extends [FunctionDoc] ? true : false>} _HookDocIsFunctionDocLock
 */

/**
 * Stamped generic reference/topic doc (`type: 'generic'`). `title` and
 * `sections` stay optional at this parser boundary for docs produced by the
 * shipped v0.3.0 factory-removal codemod. When present, all rich fields and
 * semantic blocks are validated.
 */
export const GenericDocKindSchema = z
  .object({
    ...BaseDocFields,
    type: z.literal('generic'),
    title: nonEmptyString.optional(),
    // Search terms the title and sections do not use; `astryx search` matches
    // them as keywords of the whole topic (ReferenceDoc `keywords`).
    keywords: z.array(z.string()).optional(),
    sections: z.array(ReferenceSectionSchema).min(1).optional(),
    replaces: nonEmptyString.optional(),
    extends: nonEmptyString.optional(),
    tokenCategory: z.string().optional(),
  })
  .passthrough()
  .superRefine((doc, context) => {
    if (doc.replaces != null && doc.extends != null) {
      context.addIssue({
        code: 'custom',
        path: ['extends'],
        message: 'declares both `replaces` and `extends`; choose one',
      });
    }
    const sectionIds = new Set();
    doc.sections?.forEach((section, index) => {
      if (section.id == null) return;
      if (sectionIds.has(section.id)) {
        context.addIssue({
          code: 'custom',
          path: ['sections', index, 'id'],
          message: `duplicate section id "${section.id}"`,
        });
      }
      sectionIds.add(section.id);
    });
  });

/**
 * A stamped generic doc as the load check accepts it. `title`, `description`
 * and `sections` may be missing, as in docs the v0.3.0 factory-removal codemod
 * produced; `parseReference` then fills them (title from `displayName` or
 * `name`, an empty description, no sections), so its result is a full
 * ReferenceDoc. Only a doc with a description and sections is a usable topic
 * (see `problemsInTopic`).
 *
 * @typedef {Omit<ReferenceDoc, 'type' | 'title' | 'description' | 'sections'>
 *   & {type: 'generic'}
 *   & Partial<Pick<ReferenceDoc, 'title' | 'description' | 'sections'>>} LoadedReferenceDoc
 */
/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<
 *     import('../_shared/contract.js').NamedFields<z.infer<typeof GenericDocKindSchema>>,
 *     import('../_shared/contract.js').NamedFields<LoadedReferenceDoc>
 *   >
 * >} _ReferenceDocDriftLock
 */

/** Recursive field descriptor for a SchemaDoc. */
const SchemaFieldSchema =
  /** @type {import('zod').ZodType<import('./schema/type.js').SchemaFieldDoc>} */ (
    z.lazy(() =>
      z
        .object({
          name: z.string().min(1, 'field name is required'),
          type: z
            .string({error: 'field type is required'})
            .min(1, 'field type is required'),
          description: z.string(),
          required: z.boolean().optional(),
          default: z.string().optional(),
          example: z.string().optional(),
          deprecated: z.string().optional(),
          stability: z.literal('experimental').optional(),
          fields: z.array(SchemaFieldSchema).optional(),
        })
        .passthrough(),
    )
  );

/** New stamped schema doc (`type: 'schema'`). */
export const SchemaDocKindSchema = z
  .object({
    ...AuthoredDocGraphFields,
    type: z.literal('schema'),
    name: z.string().min(1, 'name is required'),
    displayName: z.string().min(1, 'displayName is required'),
    description: z.string(),
    namespace: z.string().optional(),
    appliesTo: z.string().optional(),
    fields: z.array(SchemaFieldSchema),
    examples: z
      .array(
        z
          .object({label: z.string().optional(), code: z.string()})
          .passthrough(),
      )
      .optional(),
    notes: z.array(ReferenceContentBlockSchema).optional(),
  })
  .passthrough();

/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<
 *     import('../_shared/contract.js').NamedFields<z.infer<typeof SchemaDocKindSchema>>,
 *     import('../_shared/contract.js').NamedFields<SchemaDoc & {type: 'schema'}>
 *   >
 * >} _SchemaDocDriftLock
 */

/** New stamped command doc (`type: 'command'`). */
export const CommandDocKindSchema = z
  .object({
    ...AuthoredDocGraphFields,
    type: z.literal('command'),
    name: z.string().min(1, 'name is required'),
    displayName: z.string().min(1, 'displayName is required'),
    summary: z.string(),
    description: z.string().optional(),
    namespace: z.string().optional(),
    fn: z.string().optional(),
    args: z
      .array(
        z
          .object({
            name: z.string().min(1),
            param: z.string().optional(),
            description: z.string().optional(),
            required: z.boolean().optional(),
            variadic: z.boolean().optional(),
          })
          .passthrough(),
      )
      .optional(),
    options: z
      .array(
        z
          .object({
            flag: z.string().min(1),
            param: z.string().optional(),
            description: z.string().optional(),
            choices: z.array(z.string()).optional(),
            default: z
              .union([z.string(), z.boolean(), z.array(z.string())])
              .optional(),
            cliOnly: z.boolean().optional(),
          })
          .passthrough(),
      )
      .optional(),
    subcommands: z.array(z.string()).optional(),
    examples: z
      .array(
        z
          .object({
            label: z.string().optional(),
            cli: z.string(),
            output: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    exitCodes: z
      .array(z.object({code: z.number(), when: z.string()}).passthrough())
      .optional(),
    outsideProject: z.enum(['same', 'refuse', 'own']).optional(),
    related: z.array(z.string()).optional(),
    notes: z.array(ReferenceContentBlockSchema).optional(),
  })
  .passthrough();

/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<
 *     import('../_shared/contract.js').NamedFields<z.infer<typeof CommandDocKindSchema>>,
 *     import('../_shared/contract.js').NamedFields<CommandDoc & {type: 'command'}>
 *   >
 * >} _CommandDocDriftLock
 */

/** New stamped enum doc (`type: 'enum'`). */
export const EnumDocKindSchema = z
  .object({
    ...AuthoredDocGraphFields,
    type: z.literal('enum'),
    name: z.string().min(1, 'name is required'),
    displayName: z.string().min(1, 'displayName is required'),
    description: z.string(),
    namespace: z.string().optional(),
    members: z.array(
      z
        .object({
          value: z.string().min(1, 'member value is required'),
          description: z.string(),
          deprecated: z.string().optional(),
          stability: z.literal('experimental').optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<
 *     import('../_shared/contract.js').NamedFields<z.infer<typeof EnumDocKindSchema>>,
 *     import('../_shared/contract.js').NamedFields<EnumDoc & {type: 'enum'}>
 *   >
 * >} _EnumDocDriftLock
 */

const NamespaceSlotSchema = z
  .object({
    title: nonEmptyString,
    accepts: z
      .object({
        kinds: z.array(AuthoredDocKindSchema).min(1),
        providers: z.enum(['same', 'configured']).optional(),
      })
      .strict(),
  })
  .strict();

/** The one new authored doctype: a hierarchy and layout owner. */
export const NamespaceDocKindSchema = z
  .object({
    ...AuthoredDocGraphFields,
    type: z.literal('namespace'),
    name: nonEmptyString,
    title: nonEmptyString,
    summary: nonEmptyString,
    keywords: z.array(nonEmptyString).optional(),
    slots: z
      .record(nonEmptyString, NamespaceSlotSchema)
      .refine(slots => Object.keys(slots).length > 0, {
        message: 'at least one slot is required',
      }),
    adopts: z
      .array(
        z
          .object({
            source: z
              .object({
                group: nonEmptyString,
                kinds: z.array(AuthoredDocKindSchema).min(1).optional(),
                packages: z.literal('all').optional(),
              })
              .strict(),
            into: nonEmptyString,
            groupBy: z.literal('kind').optional(),
          })
          .strict(),
      )
      .optional(),
    blocks: z.array(NamespaceContentBlockSchema).optional(),
  })
  .strict()
  .superRefine((doc, context) => {
    const slots = new Set(Object.keys(doc.slots));
    doc.adopts?.forEach((rule, index) => {
      const slot = doc.slots[rule.into];
      if (slot == null) {
        context.addIssue({
          code: 'custom',
          path: ['adopts', index, 'into'],
          message: `must name a declared slot; received "${rule.into}"`,
        });
        return;
      }
      /** @type {AuthoredDocKind[]} */
      const adoptedKinds =
        rule.groupBy === 'kind' ? ['namespace'] : (rule.source.kinds ?? []);
      adoptedKinds.forEach(kind => {
        if (!slot.accepts.kinds.includes(kind)) {
          context.addIssue({
            code: 'custom',
            path: ['adopts', index, 'into'],
            message: `slot "${rule.into}" does not accept adopted kind "${kind}"`,
          });
        }
      });
    });
    doc.blocks?.forEach((block, index) => {
      if (block.type === 'collection' && !slots.has(block.source.slot)) {
        context.addIssue({
          code: 'custom',
          path: ['blocks', index, 'source', 'slot'],
          message: `must name a declared slot; received "${block.source.slot}"`,
        });
      }
    });
  });

/**
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').Equal<
 *     z.infer<typeof NamespaceDocKindSchema>,
 *     NamespaceDoc
 *   >
 * >} _NamespaceDocDriftLock
 */

// Legacy loose format stays permissive for backward compatibility.
const LegacyBaseDocSchema = z.object({
  ...AuthoredDocGraphFields,
  name: z.string().min(1, 'name is required'),
  displayName: z.string().optional(),
  description: z.string().optional(),
  group: z.string().optional(),
  category: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  isHiddenFromOverview: z.boolean().optional(),
  hidden: z.boolean().optional(),
  hiddenComponents: z.array(z.string()).optional(),
  usage: z.unknown().optional(),
  playground: z.unknown().optional(),
  theming: z.unknown().optional(),
  examples: z.array(z.unknown()).optional(),
  showcase: z.unknown().optional(),
  parent: z.string().optional(),
  relatedDocs: z.array(z.string()).optional(),
  relatedComponents: z.array(z.string()).optional(),
  relatedHooks: z.array(z.string()).optional(),
});

const LegacyReferenceDocSchema = LegacyBaseDocSchema.extend({
  title: nonEmptyString,
  description: z.string(),
  // As on the stamped schema: search terms for the whole topic.
  keywords: z.array(z.string()).optional(),
  sections: z.array(ReferenceSectionSchema).min(1),
  replaces: nonEmptyString.optional(),
  extends: nonEmptyString.optional(),
  tokenCategory: z.string().optional(),
})
  .passthrough()
  .superRefine((doc, context) => {
    if (doc.replaces != null && doc.extends != null) {
      context.addIssue({
        code: 'custom',
        path: ['extends'],
        message: 'declares both `replaces` and `extends`; choose one',
      });
    }
    const sectionIds = new Set();
    doc.sections.forEach((section, index) => {
      if (section.id == null) return;
      if (sectionIds.has(section.id)) {
        context.addIssue({
          code: 'custom',
          path: ['sections', index, 'id'],
          message: `duplicate section id "${section.id}"`,
        });
      }
      sectionIds.add(section.id);
    });
  });

const LegacySingleComponentDocSchema = LegacyBaseDocSchema.extend({
  props: z.array(PropSchema),
}).passthrough();

const LegacyMultiComponentDocSchema = LegacyBaseDocSchema.extend({
  components: z.array(z.unknown()),
}).passthrough();

const LegacyHookDocSchema = LegacyBaseDocSchema.extend({
  params: z.array(ParamSchema),
  returns: z.array(ReturnSchema),
}).passthrough();

const LegacySubComponentDocSchema = LegacyBaseDocSchema.extend({
  subComponentOf: z.string().min(1, 'subComponentOf is required'),
  description: z.string(),
  props: z.array(PropSchema),
}).passthrough();

/** The permissive legacy union (sub-component, hook, multi, single, then reference). */
export const LegacyDocSchema = z.union([
  LegacySubComponentDocSchema,
  LegacyHookDocSchema,
  LegacyMultiComponentDocSchema,
  LegacySingleComponentDocSchema,
  LegacyReferenceDocSchema,
]);
