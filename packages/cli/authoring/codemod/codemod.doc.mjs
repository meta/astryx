// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for an Astryx codemod module (AstryxCodemod /
 * AstryxConfigCodemod). Colocated with the schema (`type.ts` + `parse.mjs`)
 * it documents.
 * @position packages/cli/authoring/codemod — schema documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'codemod',
  displayName: 'Astryx Codemod',
  namespace: 'authoring',
  description:
    'A codemod module the CLI runs during `{@command upgrade}`. Default-export a ' +
    "plain object with a `type` discriminant: 'code' rewrites source files, " +
    "'config' rewrites the astryx.config.* file. There is no factory to call.",
  appliesTo:
    '`<codemods>/<version>/<id>.{ts,mjs,js}` in an integration package: `<codemods>` is the codemods root of astryx.integration.*, and `<version>` is the exact @astryxdesign/core version (such as 0.7.0) whose upgrade runs the codemod. A file directly in the root never runs.',
  fields: [
    {
      name: 'title',
      type: 'string',
      description: 'Short, human-readable title shown in upgrade output.',
      required: true,
      example: "'Rename Button prop kind to variant'",
    },
    {
      name: 'description',
      type: 'string',
      description: 'Optional longer description.',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description:
        'When true, the codemod runs only when explicitly requested.',
      default: 'false',
    },
    {
      name: 'fileExtensions',
      type: 'string[]',
      description:
        'File extensions this codemod applies to. Code codemods only; a ' +
        'config codemod always targets astryx.config.*.',
      default: "['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs']",
      example: "['.tsx', '.ts']",
    },
    {
      name: 'transform',
      type: '(file: AstryxCodemodFile, api: AstryxCodemodApi) => string | null | undefined',
      description:
        'The transform. Return the new source to rewrite the file, or ' +
        'null/undefined to leave it unchanged.',
      required: true,
      fields: [
        {
          name: 'file',
          type: 'AstryxCodemodFile',
          description: 'The source file presented to the transform.',
          required: true,
          fields: [
            {
              name: 'file.path',
              type: 'string',
              description: 'Absolute path to the file being transformed.',
              required: true,
            },
            {
              name: 'file.source',
              type: 'string',
              description: 'The current source contents of the file.',
              required: true,
            },
          ],
        },
        {
          name: 'api',
          type: 'AstryxCodemodApi',
          description: 'Helpers and context passed as the second argument.',
          required: true,
          fields: [
            {
              name: 'api.jscodeshift',
              type: 'unknown',
              description:
                'A jscodeshift instance configured with a parser for the file.',
              required: true,
            },
            {
              name: 'api.stats',
              type: '(...args: unknown[]) => void',
              description:
                'Accepted for jscodeshift parity. A call does nothing, and upgrade shows nothing for it.',
              required: true,
            },
            {
              name: 'api.report',
              type: '(...args: unknown[]) => void',
              description:
                'Accepted for jscodeshift parity. A call does nothing, and upgrade shows nothing for it.',
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: 'type',
      type: "'code' | 'config'",
      description:
        "Discriminant for the file-transforming variant. Use 'config' for a " +
        'codemod that rewrites astryx.config.* instead (see notes).',
      required: true,
      example: "'code'",
    },
  ],
  examples: [
    {
      label: 'Code codemod (type: code)',
      code: `export default {
  type: 'code',
  title: 'Rename Button prop kind to variant',
  fileExtensions: ['.tsx', '.ts'],
  transform(file, api) {
    const j = api.jscodeshift;
    const root = j(file.source);
    // ...rewrite the AST...
    return root.toSource();
  },
};`,
    },
    {
      label: 'Config codemod (type: config)',
      code: `export default {
  type: 'config',
  title: 'Move issuesUrl into astryx.config',
  transform(file, api) {
    // Rewrite the astryx.config.* source; return null to skip.
    return null;
  },
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text:
        "The config-codemod variant (type: 'config') carries the same fields " +
        'as a code codemod except fileExtensions: it always targets the ' +
        'astryx.config.* file rather than a set of source files.',
    },
    {
      type: 'prose',
      text:
        'Authors write a plain object and default-export it with the `type` ' +
        'discriminant; there is no factory. The CLI validates it at the load ' +
        'boundary via parseCodemod with a strict schema, and isOptional ' +
        'defaults to false.',
    },
  ],
};
