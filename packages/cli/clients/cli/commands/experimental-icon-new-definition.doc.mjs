// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental icon new-definition`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental icon new-definition',
  displayName: 'astryx experimental icon new-definition',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: "Add your icon set's own icon definition",
  description:
    "Run inside an icon-set package. Writes one icon definition file for a meaning Astryx's definitions do not cover, and with --icon maps it to an icon of the set. Experimental: it may change or be removed in a patch release.",
  fn: 'iconNewDefinition',
  args: [
    {
      name: 'name',
      param: 'name',
      required: true,
      description: 'The definition name, in camelCase (rocketLaunch)',
    },
  ],
  options: [
    {
      flag: '--dry-run',
      param: 'options.dryRun',
      description: 'Validate and show planned writes without changing files',
    },
    {
      flag: '--set <name>',
      param: 'options.set',
      description: 'The icon set to add it to, when the package ships several',
    },
    {
      flag: '--description <text>',
      param: 'options.description',
      description: 'One sentence on what an icon with this definition is for',
    },
    {
      flag: '--words <list>',
      param: 'options.words',
      description: 'Comma-separated words people search for',
    },
    {
      flag: '--icon <id>',
      param: 'options.icon',
      description: 'Also map it to this icon of the set (its `map` entry)',
    },
  ],
  examples: [
    {
      label: "Add a set's own icon definition",
      cli: "astryx experimental icon new-definition random --description 'Pick something at random.' --words dice,shuffle,chance --icon dice-5",
    },
  ],
  outsideProject: 'refuse',
  exitCodes: [
    {code: 0, when: 'the definition is written or the dry run succeeds'},
    {
      code: 1,
      when: 'the name is invalid or taken, the description or words are missing, or the set or icon is not found',
    },
  ],
  related: ['experimental icon map', 'experimental icon add'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental icon new-definition writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the icon-set package. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
};
