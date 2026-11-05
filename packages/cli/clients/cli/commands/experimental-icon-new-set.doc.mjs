// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental icon new-set`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental icon new-set',
  displayName: 'astryx experimental icon new-set',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'Start an icon set in your integration package',
  description:
    "Run inside an integration package. Writes the set's folder with its descriptor, its data file, and its generated module, and declares the manifest's `experimental.iconSets` root on first use. With --from it wraps every icon component of a library, records the library and its version as the set's source, copies its license notice, and maps each Astryx icon definition whose name is an icon's id; definitions an icon only shares a word with are listed as suggestions, never written. Run it again to refresh. --variants and --default-variant declare the set's variants. Experimental: it may change or be removed in a patch release.",
  fn: 'iconNewSet',
  args: [
    {
      name: 'name',
      param: 'name',
      required: true,
      description: 'The set name, in lowercase kebab-case (outline)',
    },
  ],
  options: [
    {
      flag: '--dry-run',
      param: 'options.dryRun',
      description: 'Validate and show planned writes without changing files',
    },
    {
      flag: '--from <module>',
      param: 'options.from',
      description:
        'A module whose every icon component the set wraps (a package, a subpath, or a ./ path); run again to refresh',
    },
    {
      flag: '--exclude <names>',
      param: 'options.exclude',
      description:
        'With --from: comma-separated export names of the library that are not icons',
    },
    {
      flag: '--variants <list>',
      param: 'options.variants',
      description:
        'Comma-separated variants the set supplies, such as outline,solid',
    },
    {
      flag: '--default-variant <variant>',
      param: 'options.defaultVariant',
      description:
        "With --variants: the variant each icon's own export draws (the first variant when omitted)",
    },
    {
      flag: '--display-name <text>',
      param: 'options.displayName',
      description:
        "The set's display name (the name in title case when omitted)",
    },
    {
      flag: '--description <text>',
      param: 'options.description',
      description: "The set's one-line description",
    },
  ],
  examples: [
    {
      label: 'Start an icon set',
      cli: 'astryx experimental icon new-set outline',
    },
    {
      label: 'Wrap a whole icon library',
      cli: 'astryx experimental icon new-set outline --from @acme/glyph-library',
    },
    {
      label: 'Wrap a library with two variants',
      cli: 'astryx experimental icon new-set heroicons --from @heroicons/react/24/outline --variants outline,solid --default-variant outline',
    },
    {
      label: 'Preview the files',
      cli: 'astryx experimental icon new-set outline --dry-run --json',
    },
  ],
  outsideProject: 'refuse',
  exitCodes: [
    {code: 0, when: 'the set is written or the dry run succeeds'},
    {
      code: 1,
      when: 'the name, options, package, or target files are invalid or conflict',
    },
  ],
  related: [
    'experimental icon add',
    'experimental icon new-definition',
    'integration check',
  ],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental icon new-set writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the integration package. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
};
