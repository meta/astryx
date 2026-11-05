// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for an icon set's `<name>.icons.json` data file
 * (AST-084 FR3).
 * @position packages/cli/authoring/doctypes/icon-set — data-file documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'icon-set-data',
  displayName: 'IconSetData',
  namespace: 'authoring',
  stability: 'experimental',
  description:
    "Experimental: may change or be removed in a patch release. An icon set's data file: which icons exist, the export that draws each one, the words a person might search for, and which icon draws each icon definition (`map`). `astryx experimental icon`, template icon mapping, and the checks read this file and nothing else.",
  appliesTo: '<iconSetsRoot>/<name>/<name>.icons.json',
  fields: [
    {
      name: 'schemaVersion',
      type: '1',
      description: 'Data-file format version.',
      required: true,
    },
    {
      name: 'module',
      type: 'string',
      description:
        "The import specifier every `export` is read from: the set's own package name, or one of its package.json `exports` subpaths. Never a file path.",
      required: true,
      example: "'@acme/outline-icons'",
    },
    {
      name: 'source',
      type: '{package: string, version: string}',
      description:
        'The upstream library and version the file was generated from. Omit it for a set with no upstream.',
    },
    {
      name: 'exclude',
      type: 'string[]',
      description:
        'Library exports that are not icons. `experimental icon new-set --from` leaves them out every time it wraps or refreshes the set; `--exclude` adds to the list. A CLI whose reference does not list this key withdraws a set that sets it, naming the key; leave it out for a set those CLIs must read.',
    },
    {
      name: 'generated',
      type: 'string',
      description:
        "The module `astryx experimental icon add` writes, as a `./` path from the package root: one export per icon, a re-export of a library component or the adapter applied to a library export, and `themeIcons`, the theme map, from the built-in entries of `map`. The CLI writes its declaration file beside it. The package's entry re-exports it.",
      example: "'./icon-sets/outline/outline.generated.js'",
    },
    {
      name: 'adapter',
      type: '{module: string, export: string}',
      description:
        'A function in the package, `(source) => Component`, that turns a library export that is not a component (icon data, an SVG string or URL) into one. `module` is a `./` path from the package root.',
      example: "{module: './src/adapt.js', export: 'adapt'}",
    },
    {
      name: 'variants',
      type: 'string[]',
      description:
        'The named looks the set offers, in lower-kebab case, such as `outline` and `solid`. Icon size is never a variant: CSS sets it. Omit it when the set has one look.',
      example: "['outline', 'solid']",
    },
    {
      name: 'default',
      type: '{variant?: string}',
      description:
        "The variant each icon's own `export` draws; one of `variants`.",
      example: "{variant: 'outline'}",
    },
    {
      name: 'themeMap',
      type: 'string',
      description:
        'The export that maps each built-in icon definition to its artwork, keyed by exactly the built-in definitions in `map`.',
      example: "'themeIcons'",
    },
    {
      name: 'map',
      type: 'Record<string, string>',
      description:
        "Which of this set's icons draws each icon definition: definition name to icon `id`. Keys are Astryx's definitions (`astryx docs cli/experimental/icon-definitions`) or ones the set declares in its `definitions` folder, one file per definition. One icon may draw several definitions; each definition maps to one icon. Every built-in definition must be mapped.",
      example: '{"close": "x", "delete": "trash", "remove": "trash"}',
    },
    {
      name: 'icons',
      type: 'IconSetIcon[]',
      description: 'Every icon in the set.',
      required: true,
      fields: [
        {
          name: 'icons[].id',
          type: 'string',
          description: 'Lower-kebab identity, unique in the set.',
          required: true,
          example: "'trash'",
        },
        {
          name: 'icons[].export',
          type: 'string',
          description:
            "The named export that draws the icon's default variant, named `<Name>Icon`: a React component that takes SVG props and draws with `currentColor`.",
          required: true,
          example: "'TrashIcon'",
        },
        {
          name: 'icons[].module',
          type: 'string',
          description:
            "The import specifier, when it differs from the set's `module`.",
        },
        {
          name: 'icons[].words',
          type: 'string[]',
          description:
            "Lower-case terms a person might search for, the words of the icon's own name included; at least one. Do not copy the words of the definitions `map` names the icon for: search already matches the icon by them.",
          required: true,
          example: "['trash', 'delete', 'remove', 'bin']",
        },
        {
          name: 'icons[].variants',
          type: '{variant, export, module?}[]',
          description:
            'Other variants of the icon: each names one of `variants`, never the default, and the export that draws it. At most one export per variant.',
        },
        {
          name: 'icons[].matches',
          type: "{set, export, variant?, confidence: 'exact' | 'strong' | 'likely'}[]",
          description:
            "Reviewed equivalents of this icon in other icon sets or libraries, such as `{set: 'lines', export: 'CrossIcon', variant: 'solid', confidence: 'exact'}`. When a copied template imports a matched icon from that installed set, `exact` and `strong` matches are used before any other rule; a `likely` match is only suggested. A match never names this set itself.",
        },
      ],
    },
  ],
  examples: [
    {
      label: 'A data file at icons/outline/outline.icons.json',
      code: `{
  "schemaVersion": 1,
  "module": "@acme/outline-icons",
  "generated": "./icon-sets/outline/outline.generated.js",
  "variants": ["outline", "solid"],
  "default": {"variant": "outline"},
  "themeMap": "themeIcons",
  "map": {"close": "x", "delete": "trash"},
  "icons": [
    {"id": "x", "export": "XIcon", "words": ["close", "cancel", "dismiss"]},
    {
      "id": "trash",
      "export": "TrashIcon",
      "words": ["trash", "delete", "remove", "bin"],
      "variants": [{"variant": "solid", "export": "TrashSolidIcon"}]
    }
  ]
}`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: 'A file that fails this schema, repeats an id, gives an icon no words, has a `map` key that is not camelCase or a `map` value that is not an icon id in the file, or names a variant `variants` does not declare is invalid, and its set is withdrawn from every surface until it is fixed. `astryx doctor` names the reason.',
    },
    {
      type: 'prose',
      text: "A template declares the icon definition each icon it imports draws. With a project icon set, each declared icon maps to the icon whose `matches` name it with `exact` or `strong` confidence (for an icon another installed set ships), else to the icon this file's `map` names for its definition. Nothing is guessed from names or words.",
    },
    {
      type: 'prose',
      text: 'Write it with the CLI: `astryx experimental icon add` registers one icon and its `map` entry, `astryx experimental icon map` changes an entry, and `astryx experimental icon new-set --from` wraps a whole library.',
    },
  ],
};
