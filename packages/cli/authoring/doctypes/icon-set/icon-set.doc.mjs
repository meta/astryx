// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the IconSetDoc authoring type (AST-084 FR2).
 * @position packages/cli/authoring/doctypes/icon-set — doc-type documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'icon-set-doc',
  displayName: 'IconSetDoc',
  namespace: 'authoring',
  stability: 'experimental',
  description:
    "Experimental: may change or be removed in a patch release. The strongly typed descriptor for one icon set an integration ships: what a person writes about the set. The set's icons, and what each one means, live in the `<name>.icons.json` data file beside it.",
  appliesTo: '<iconSetsRoot>/<name>/<name>.doc.mjs',
  fields: [
    {
      name: 'type',
      type: "'icon-set'",
      description: 'Doc-kind discriminant.',
      required: true,
    },
    {
      name: 'name',
      type: 'string',
      description:
        'Lower-kebab icon-set identity. Must match the descriptor parent directory.',
      required: true,
      example: "'outline'",
    },
    {
      name: 'displayName',
      type: 'string',
      description:
        'Human-readable name shown by `astryx experimental icon --list`.',
      required: true,
      example: "'Acme Outline'",
    },
    {
      name: 'description',
      type: 'string',
      description:
        'One-line summary shown by `astryx experimental icon --list`.',
      required: true,
    },
    {
      name: 'maintained',
      type: 'boolean',
      description: 'Whether the owning package actively maintains this set.',
      required: true,
    },
    {
      name: 'license',
      type: 'string',
      description: 'SPDX license expression for the artwork.',
      required: true,
      example: "'MIT'",
    },
  ],
  examples: [
    {
      label: 'An icon-set descriptor at icons/outline/outline.doc.mjs',
      code: `/** @type {import('@astryxdesign/cli/authoring').IconSetDoc} */
export default {
  type: 'icon-set',
  name: 'outline',
  displayName: 'Acme Outline',
  description: 'Outline icons with rounded strokes.',
  maintained: true,
  license: 'MIT',
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: "Point the manifest's `experimental.iconSets` field at the folder that holds your sets. Each lower-kebab folder under it is one set, named by the folder, and holds `<name>.doc.mjs`, `<name>.icons.json`, and any license notice files. The manifest never lists sets or icons.",
    },
    {
      type: 'prose',
      text: "Write the descriptor as one default-exported object of literal strings and booleans under a `/** @type {import('@astryxdesign/cli/authoring').IconSetDoc} */` comment, with nothing else in the file. Discovery reads it, and the data file, without executing them or the icon module.",
    },
    {
      type: 'prose',
      text: 'The data file is described by {@link schema:icon-set-data}. Run `astryx integration check` to prove every export it names exists in the module and that the theme map agrees with the built-in entries of `map`.',
    },
  ],
};
