// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the ThemeDoc authoring type.
 * @position packages/cli/authoring/doctypes/theme — doc-type documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'theme-doc',
  displayName: 'ThemeDoc',
  namespace: 'authoring',
  description:
    "The strongly typed descriptor for one source theme: bundled with the CLI, shipped by an integration, or kept in the project's src/themes, where `theme eject` writes one.",
  appliesTo: '<theme-source-stem>.doc.mjs',
  fields: [
    {
      name: 'type',
      type: "'theme'",
      description: 'Doc-kind discriminant.',
      required: true,
    },
    {
      name: 'name',
      type: 'string',
      description:
        'Lower-kebab CLI theme identity. Must match the descriptor parent directory.',
      required: true,
      example: "'ocean'",
    },
    {
      name: 'displayName',
      type: 'string',
      description: 'Human-readable name shown by theme listings.',
      required: true,
      example: "'Ocean'",
    },
    {
      name: 'description',
      type: 'string',
      description: 'One-line summary shown by theme listings.',
      required: true,
    },
    {
      name: 'maintained',
      type: 'boolean',
      description: 'Whether the owning package actively maintains this theme.',
      required: true,
    },
  ],
  examples: [
    {
      label: 'A theme descriptor beside oceanTheme.ts',
      code: `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */
export default {
  type: 'theme',
  name: 'ocean',
  displayName: 'Ocean',
  description: 'Cool blue surfaces with crisp contrast.',
  maintained: true,
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: "ThemeDoc is static metadata. The descriptor holds one default-exported object of literal string and boolean fields, directly under a `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */` comment, and nothing else: without that comment, or with any other statement, it fails to load. Discovery validates it without executing the descriptor or theme source.",
    },
    {
      type: 'prose',
      text: 'The descriptor and source share one stem. For oceanTheme.doc.mjs, discovery requires exactly one oceanTheme source module and a named oceanTheme runtime export.',
    },
    {
      type: 'prose',
      text: 'The parent theme directory, including this descriptor, is the complete copy and pack boundary. Nested source, palettes, assets, and receipts need no second file list.',
    },
  ],
};
