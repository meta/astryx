// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the `SchemaDoc` doc-type itself — the self-describing
 * entry that documents how to author a schema/object `.doc.mjs`. Colocated
 * with the type it describes (`type.ts`).
 * @position packages/cli/authoring/doctypes/schema — doc-type documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'schema-doc',
  displayName: 'SchemaDoc',
  namespace: 'authoring',
  description:
    'The doc-type for documenting an authored/received OBJECT shape (astryx.config, ' +
    'a codemod payload, the doc-types themselves). Colocated as a `.doc.mjs` next to ' +
    'the schema it describes. Fields nest recursively, so a whole shape is one tree.',
  appliesTo: '<schema>.doc.mjs',
  fields: [
    {
      name: 'type',
      type: "'schema'",
      description: 'Doc-kind discriminant. Marks the file as a schema doc.',
    },
    {
      name: 'name',
      type: 'string',
      description:
        'URL-safe identifier, used as the docs slug within its namespace.',
      required: true,
      example: "'config'",
    },
    {
      name: 'displayName',
      type: 'string',
      description: 'Human-readable title.',
      required: true,
      example: "'Astryx Config'",
    },
    {
      name: 'description',
      type: 'string',
      description: 'One-line summary shown in listings.',
      required: true,
    },
    {
      name: 'namespace',
      type: 'string',
      description:
        "The group that reads this doc: 'authoring' for a file an author writes (a section of {@link generic:field-reference}), or 'cli/api' for a shape the CLI returns (the docs tree adopts it by kind, as the leaf `cli/api/schemas/<name>`). Every schema doc the CLI ships declares one, and `astryx doctor` fails on one that is missing or that nothing reads.",
    },
    {
      name: 'aliases',
      type: 'string[]',
      description:
        'Reserved: alternate slugs for this doc. Nothing reads it yet: `astryx docs` finds a schema doc by its `name` only.',
    },
    {
      name: 'appliesTo',
      type: 'string',
      description:
        "What this schema applies to, e.g. 'astryx.config.{ts,mjs,js}' | 'AstryxConfig'.",
    },
    {
      name: 'fields',
      type: 'SchemaFieldDoc[]',
      description:
        "The fields that make up the shape. Object-typed fields nest their members recursively via each field's own `fields`, so the whole shape is one tree.",
      required: true,
      fields: [
        {
          name: 'fields[].name',
          type: 'string',
          description:
            "Field name, or a dotted path for a nested field (e.g. 'hooks.postCodemod').",
          required: true,
        },
        {
          name: 'fields[].type',
          type: 'string',
          description:
            "TypeScript type signature as a string, e.g. 'string[]' | \"'a' | 'b'\".",
          required: true,
        },
        {
          name: 'fields[].description',
          type: 'string',
          description: 'What the field is for, in 1-2 sentences.',
          required: true,
        },
        {
          name: 'fields[].required',
          type: 'boolean',
          description:
            "True if the field must be provided. Omit (don't set false) if optional.",
        },
        {
          name: 'fields[].default',
          type: 'string',
          description: 'Default value as a string, if any.',
        },
        {
          name: 'fields[].example',
          type: 'string',
          description: 'A short inline example value.',
        },
        {
          name: 'fields[].deprecated',
          type: 'string',
          description: 'Deprecation reason, if the field is deprecated.',
        },
        {
          name: 'fields[].fields',
          type: 'SchemaFieldDoc[]',
          description:
            'Nested object fields, for object-typed fields. Recursive.',
        },
      ],
    },
    {
      name: 'examples',
      type: '{ label?: string; code: string }[]',
      description: 'Full example objects/snippets.',
      fields: [
        {
          name: 'examples[].label',
          type: 'string',
          description: 'Optional heading shown above the snippet.',
        },
        {
          name: 'examples[].code',
          type: 'string',
          description: 'The example source.',
          required: true,
        },
      ],
    },
    {
      name: 'notes',
      type: 'ReferenceContentBlock[]',
      description:
        'Freeform prose/notes rendered after the field table and examples. The stable ReferenceContentBlock union (prose, heading, code, table, list, token-ref), without the reference block a ReferenceDoc section also takes; a token-ref note is accepted but not rendered.',
    },
  ],
  examples: [
    {
      label: 'A small schema doc with a nested object field',
      code: `/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'integration',
  displayName: 'Astryx Integration',
  namespace: 'authoring',
  description: 'The astryx.integration.* manifest that points the CLI at what a package contributes.',
  appliesTo: 'astryx.integration.{ts,mjs,js}',
  fields: [
    {name: 'docs', type: 'string', description: 'The folder that holds your doc topics, relative to package.json.'},
    {
      name: 'agentDocs',
      type: '{ append?: readonly string[] }',
      description: 'Guidance your package adds to the agent instructions the CLI manages.',
      fields: [
        {name: 'agentDocs.append', type: 'readonly string[]', description: 'Lines added at the end, at most eight.'},
      ],
    },
  ],
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: 'SchemaFieldDoc is recursive: an object-typed field lists its members in its own `fields`, so an entire nested shape (including paths like `hooks.postCodemod` or `experimental.xle.components`) is documented as one tree.',
    },
    {
      type: 'prose',
      text: 'Name nested fields with a dotted path from the root (e.g. `hooks.postCodemod`) so readers can see where each field sits in the shape.',
    },
    {
      type: 'list',
      style: 'do',
      items: [
        'Set `required: true` only for mandatory fields.',
        'Keep `type` close to the real TS type; use single quotes for string-literal unions.',
      ],
    },
    {
      type: 'list',
      style: 'dont',
      items: [
        'Set `required: false` for optional fields; omit `required` entirely instead.',
      ],
    },
  ],
};
