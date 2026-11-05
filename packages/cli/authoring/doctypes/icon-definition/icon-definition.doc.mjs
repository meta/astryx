// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the IconDefinitionDoc authoring type (AST-084).
 * @position packages/cli/authoring/doctypes/icon-definition — doc-type documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'icon-definition-doc',
  displayName: 'IconDefinitionDoc',
  namespace: 'authoring',
  stability: 'experimental',
  description:
    "Experimental: may change or be removed in a patch release. One thing an icon can stand for, such as `close` or `delete`. Astryx ships one file per definition; an icon set adds its own in the same format. A set's data file `map` registers which of its icons draws each definition.",
  appliesTo: '<iconSetsRoot>/<set>/definitions/<name>.doc.mjs',
  fields: [
    {
      name: 'type',
      type: "'icon-definition'",
      description: 'Doc-kind discriminant.',
      required: true,
    },
    {
      name: 'name',
      type: 'string',
      description:
        "camelCase identity: the key a data file's `map` uses. Must match the file name.",
      required: true,
      example: "'delete'",
    },
    {
      name: 'description',
      type: 'string',
      description: 'One sentence: what an icon with this definition is for.',
      required: true,
      example: "'Delete something permanently.'",
    },
    {
      name: 'words',
      type: 'string[]',
      description: 'Lower-case terms a person might search for; at least one.',
      required: true,
      example: "['trash', 'bin', 'discard']",
    },
    {
      name: 'builtIn',
      type: 'true',
      description:
        "Only on Astryx's own definitions: the definition is a shared icon name Core renders, so every icon set maps it.",
      required: false,
    },
    {
      name: 'stability',
      type: "'experimental'",
      description:
        'Marks the definition as experimental: the icon-definitions listing shows it as `[experimental]`. Omit it for a definition you mean to keep.',
      required: false,
    },
  ],
  examples: [
    {
      label:
        "A set's own definition at icon-sets/outline/definitions/random.doc.mjs",
      code: `/** @type {import('@astryxdesign/cli/authoring').IconDefinitionDoc} */
export default {
  type: 'icon-definition',
  name: 'random',
  description: 'Pick something at random.',
  words: ['dice', 'shuffle', 'chance'],
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: "A set's own definitions sit in a `definitions` folder in the set's directory, one file per definition. Its `map` registers icons for them like for Astryx's. `astryx docs cli/experimental/icon-definitions` lists every definition: Astryx's, and, in a project that sets `experimental.iconSet`, those of each installed set. A definition file refuses a field it does not know.",
    },
    {
      type: 'prose',
      text: "IconDefinitionDoc is static metadata: one default-exported object of literal fields directly under a `/** @type {import('@astryxdesign/cli/authoring').IconDefinitionDoc} */` comment. Discovery reads it without executing it.",
    },
    {
      type: 'prose',
      text: "To share a definition with every set, copy its file into Astryx's definitions folder in a pull request.",
    },
  ],
};
