// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental icon map`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental icon map',
  displayName: 'astryx experimental icon map',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'Register which icon of your set draws an icon definition',
  description:
    "Run inside an icon-set package. Sets `map[<definition>]` to the icon's id in the set's data file; name the icon by its id, its export name in any case, or another name its library exports it as (`trash-2` or `Trash2`), never by one word of its id, and the definition by its name or kebab id; `integration check` prints these commands for definitions your set already has a fitting icon for. Experimental: it may change or be removed in a patch release.",
  fn: 'iconMap',
  args: [
    {name: 'definition', param: 'definition', required: false},
    {name: 'icon', param: 'icon', required: false},
  ],
  options: [
    {
      flag: '--set <name>',
      param: 'options.set',
      description: 'The set to edit, when the package ships several',
    },
    {
      flag: '--remove',
      param: 'options.remove',
      description: "Remove the definition's entry; takes no icon",
    },
    {
      flag: '--pairs <list>',
      param: 'options.pairs',
      description:
        'Many entries in one write: <definition>=<icon> pairs, comma-separated; checked together, all or none; an existing entry is replaced',
    },
  ],
  examples: [
    {
      label: 'Map a definition',
      cli: 'astryx experimental icon map delete trash',
    },
    {
      label: 'Map many at once',
      cli: 'astryx experimental icon map --pairs close=x-mark,error=x-circle,search=magnifying-glass',
    },
    {
      label: 'Remove an entry',
      cli: 'astryx experimental icon map delete --remove',
    },
  ],
  outsideProject: 'refuse',
  exitCodes: [
    {code: 0, when: 'the entry is written, removed, or already as asked'},
    {
      code: 1,
      when: 'the definition is unknown, the set has no such icon, or no set is found',
    },
  ],
  related: ['experimental icon add', 'integration add', 'integration check'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental icon map writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the icon-set package. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
};
