// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the `EnumDoc` doc-type — how to author a doc for a closed
 * vocabulary (error codes, response-type discriminants). Colocated with the
 * type it describes (`type.ts`).
 * @position packages/cli/authoring/doctypes/enum — doc-type documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'enum-doc',
  displayName: 'EnumDoc',
  namespace: 'authoring',
  description:
    'The doc-type for a closed vocabulary: a fixed set of literal values such as ' +
    'error codes or response-type discriminants. Colocated as a `.doc.mjs` next to ' +
    'the source of truth it documents. Only the CLI reads enum docs, from its own ' +
    "source: one in an integration's docs directory fails to load, and so do that package's other docs.",
  appliesTo: '<enum>.doc.mjs',
  fields: [
    {
      name: 'type',
      type: "'enum'",
      description:
        'Doc-kind discriminant. Optional in the type, but the CLI reads a doc as an enum doc only when it is set; without it the doc drops out of the docs tree.',
    },
    {
      name: 'name',
      type: 'string',
      description:
        'URL-safe identifier, used as the docs slug within its namespace.',
      required: true,
      example: "'error-codes'",
    },
    {
      name: 'displayName',
      type: 'string',
      description: 'Human-readable title.',
      required: true,
      example: "'Error Codes'",
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
        "Optional in the type, but every doc the CLI ships declares it. The group that reads this doc. The CLI's enums use 'cli/api', which the docs tree adopts by kind: each is the leaf `cli/api/enums/<name>`. Every enum doc the CLI ships declares one, and `astryx doctor` fails on one that is missing or that nothing reads.",
    },
    {
      name: 'aliases',
      type: 'string[]',
      description:
        'Reserved: alternate slugs for this doc. Nothing reads it today, so `astryx docs <alias>` does not open it.',
    },
    {
      name: 'members',
      type: 'EnumMemberDoc[]',
      description: 'The enumerated members: one entry per literal value.',
      required: true,
      fields: [
        {
          name: 'members[].value',
          type: 'string',
          description:
            "The literal value, e.g. 'ERR_UNKNOWN_TOPIC' | 'component.list'.",
          required: true,
        },
        {
          name: 'members[].description',
          type: 'string',
          description: 'What the value means / when it occurs.',
          required: true,
        },
        {
          name: 'members[].deprecated',
          type: 'string',
          description: 'Deprecation reason, if deprecated.',
        },
      ],
    },
  ],
  examples: [
    {
      label: 'Error-codes enum doc',
      code: `/** @type {import('@astryxdesign/cli/authoring').EnumDoc} */
export const doc = {
  type: 'enum',
  name: 'error-codes',
  displayName: 'Error Codes',
  namespace: 'cli/api',
  description: 'Stable error codes thrown by the CLI/API and surfaced in the JSON envelope.',
  members: [
    {value: 'ERR_UNKNOWN_TOPIC', description: 'The requested docs topic does not exist.'},
    {value: 'ERR_INVALID_ARGUMENT', description: 'A required argument was missing or malformed.'},
    {value: 'ERR_LEGACY', description: 'Old alias.', deprecated: 'Use ERR_INVALID_ARGUMENT.'},
  ],
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: 'An enum doc is the human-readable mirror of a closed vocabulary defined elsewhere in source (e.g. an ERROR_CODES map or a response-type union). Keep the members in sync with that source of truth.',
    },
    {
      type: 'prose',
      text: 'Mark a value with `deprecated` (a migration hint) rather than deleting it, so old codes stay documented while readers are pointed at the replacement.',
    },
  ],
};
