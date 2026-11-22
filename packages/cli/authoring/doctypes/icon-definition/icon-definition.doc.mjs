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
    "Experimental: may change or be removed in a patch release. One thing an icon can stand for, such as `close` or `delete`. Astryx ships one file per meaning; an icon set adds its own in the same format. A set's data file `map` registers which of its icons draws each meaning.",
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
      description: 'One sentence: what an icon with this meaning is for.',
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
        "Only on Astryx's own meanings: the meaning is a shared icon name Core renders, so every icon set maps it.",
      required: false,
    },
    {
      name: 'group',
      type: 'string',
      description:
        "camelCase name of the family the meaning belongs to, such as `notifications` for `notification`, `notificationActive`, and `notificationOff`. The icon finder and the meaning's docs page name the other members of its group, so a reader picks the one that fits. A set's own meaning may join an Astryx group or name its own. It never changes ranking.",
      required: false,
      example: "'notifications'",
    },
    {
      name: 'replaces',
      type: 'string',
      description:
        "The name of an older meaning this one takes the place of. The old name keeps answering: a set's `map` key, a template's `icons` value, and `astryx experimental icon <old name>` resolve to this meaning, through every later replacement too, and `integration check` warns with each `map` key to rename (`icon_definition_replaced`). The replaced meaning's file may stay, so the old names it carries keep answering; it is not a current meaning any more. Replacements stay within one folder: a set's own meaning never replaces an Astryx meaning. Two meanings cannot replace one name, and a built-in meaning is never replaced.",
      required: false,
      example: "'trash'",
    },
    {
      name: 'stability',
      type: "'experimental'",
      description:
        'Marks the meaning as experimental: the icon meanings listing shows it as `[experimental]`. Omit it for a meaning you mean to keep.',
      required: false,
    },
  ],
  examples: [
    {
      label:
        "A set's own meaning at icon-sets/outline/definitions/random.doc.mjs",
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
      text: "A set's own meanings sit in a `definitions` folder in the set's directory, one file per meaning. Its `map` registers icons for them like for Astryx's. `astryx docs cli/experimental/icon-definitions` lists every meaning: Astryx's and, where icon features are on (an installed icon-set package or `experimental.iconSet`), each installed icon set's own. A meaning file refuses a field it does not know.",
    },
    {
      type: 'prose',
      text: "IconDefinitionDoc is static metadata: one default-exported object of literal fields directly under a `/** @type {import('@astryxdesign/cli/authoring').IconDefinitionDoc} */` comment. Discovery reads it without executing it.",
    },
    {
      type: 'prose',
      text: "To share a meaning with every set, copy its file into Astryx's definitions folder in a pull request.",
    },
  ],
};
