// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the `astryx.integration.*` manifest (AstryxIntegration).
 * Colocated with the schema (`type.ts` + `parse.mjs`) it documents.
 * @position packages/cli/authoring/integration — schema documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'integration',
  displayName: 'Astryx Integration',
  namespace: 'authoring',
  description:
    'The astryx.integration.* manifest that sits beside an integration ' +
    "package's package.json. It can preserve a stable provider identity across a package rename, " +
    "and points the CLI at the package's components, templates, codemods, doc topics, " +
    'source themes, managed agent guidance, issue tracker, and the command its users run the CLI with. Every field is optional.',
  appliesTo: 'astryx.integration.{ts,mjs,js}',
  fields: [
    {
      name: 'providerId',
      type: 'string',
      description:
        'The name that marks this package as the source of everything it contributes. Leave it out to use the package name from package.json. Set it to the old name only during a rename, so the IDs of what the package already contributed stay the same. If two packages use the same name here, the one you are working on wins; otherwise the one the CLI reads first wins, and the CLI warns about the other.',
      example: "'@acme/widgets'",
    },
    {
      name: 'components',
      type: 'string',
      description:
        'The folder that holds your components and their docs, relative to package.json.',
      example: "'./src/components'",
    },
    {
      name: 'templates',
      type: 'string',
      description:
        'The folder that holds your templates, relative to package.json.',
      example: "'./src/templates'",
    },
    {
      name: 'codemods',
      type: 'string',
      description:
        'The folder that holds your codemods, relative to package.json.',
      example: "'./codemods'",
    },
    {
      name: 'docs',
      type: 'string',
      description:
        'The folder that holds your doc topics, relative to package.json. Every {topic}.doc.{ts,mjs,js} under it shows up in `{@command docs}`: a flat topic next to the built-in topics, where it can set `replaces` or `extends` to take over a built-in topic or add to it, and a guide with `placement` at its own route in the docs tree, under a namespace doc of the same package.',
      example: "'./docs'",
    },
    {
      name: 'themes',
      type: 'string',
      description:
        'The folder that holds your themes, relative to package.json, with one folder per theme. Each theme folder has the theme source and a matching .doc.mjs file with the same name. Installed themes show up in `{@command theme list}`; `theme add` imports their built package exports, and `theme eject` creates an editable local fork.',
      example: "'./themes'",
    },
    {
      name: 'experimental',
      type: '{ iconSets?: string }',
      stability: 'experimental',
      description:
        'Experimental contribution roots: they may change or be removed in a patch release.',
      fields: [
        {
          name: 'experimental.iconSets',
          type: 'string',
          stability: 'experimental',
          description:
            "Experimental: may change or be removed in a patch release. The folder that holds your icon sets, relative to package.json, with one folder per set. Each set folder has a matching `<name>.doc.mjs` IconSetDoc and a `<name>.icons.json` data file. Installed sets answer `astryx experimental icon`; a project that sets `experimental.iconSet` gets copied templates in that set's icons.",
          example: "'./icon-sets'",
        },
      ],
    },
    {
      name: 'agentDocs',
      type: '{ append?: readonly string[] }',
      description:
        'Lines of guidance your package adds to the end of the agent instructions the CLI manages. The CLI owns the heading, labels, bullets, and which files it writes.',
      example: "{ append: ['Run acme verify.'] }",
    },
    {
      name: 'issuesUrl',
      type: 'string',
      description:
        "Where people file issues for this package: an absolute URL, such as its GitHub issues page. A value that is not a URL fails the whole manifest; the scheme is not checked. Nothing warns when it is missing, but without it `{@command gap-report}` about this package fails unless the project or a loaded integration has a gapReport handler, and `{@command swizzle}` prints no feedback link for this package's components. When no handler is loaded, a github.com issues URL is filed with the GitHub CLI once the reporter passes `--confirm-public`; any other URL is returned for the reporter to open.",
      example: "'https://github.com/acme/widgets/issues'",
    },
    {
      name: 'docsiteUrl',
      type: 'string',
      description:
        "Link to this integration's docs site, such as its home page. Catalogs that list the package may show it.",
      example: "'https://widgets.acme.dev'",
    },
    {
      name: 'cliCommand',
      type: 'string',
      description:
        'The command your users run the Astryx CLI with, when it is not their package manager, such as a wrapper your company ships. Every command the CLI prints in an app that loads your package starts with it, in place of `pnpm exec astryx` or `yarn astryx`: hints, errors, Doctor fixes, and doc text. One line, without a subcommand. If two loaded packages set different commands, neither is used and `{@command doctor}` warns. An invalid value is ignored with an `invalid_cli_command` warning, and the rest of the manifest still loads. JSON output keeps commands bare.',
      example: "'acme astryx'",
    },
  ],
  examples: [
    {
      label: 'Typical',
      code: `export default {
  components: './src/components',
  templates: './src/templates',
  codemods: './codemods',
  docs: './docs',
  themes: './themes',
  agentDocs: {
    append: ['Run acme verify before finishing.'],
  },
  issuesUrl: 'https://github.com/acme/widgets/issues',
};`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: "In global mode: a manifest loads the same way when users install your package for their computer, beside the global CLI, and then applies in folders outside any project; inside a project, only if the project installs it. Peer ranges for `@astryxdesign/core` and `@astryxdesign/cli` are checked against the global CLI's release. See {@link namespace:global} and {@link generic:global-integrations}.",
    },
    {
      type: 'prose',
      text:
        'The provider name defaults to the package name in package.json. ' +
        'During a rename, set `providerId` to the old package name so the IDs ' +
        'of what the package already contributed stay the same. The package ' +
        'version always comes from package.json.',
    },
    {
      type: 'prose',
      text:
        '`agentDocs.append` may contain at most eight lines. Each line is a ' +
        'trimmed, non-blank string of at most 240 Unicode code points with no ' +
        'line separators, control characters, NUL, or Astryx/XDS managed-marker ' +
        'text. The configured project may contain at most 32 integration lines ' +
        'total. Write each command in a line as a bare `astryx` command; the ' +
        'managed block says once, before your lines, how the app starts the CLI.',
    },
    {
      type: 'prose',
      text: "Set `cliCommand` only when your users run the CLI with a command other than their package manager's, such as `acme astryx`. The CLI picks the command it prints in this order: the `cliCommand` of the loaded integrations when they name one command, then the command a host tool names, then the package manager's. Two different `cliCommand` values cancel out, and `{@command doctor}` warns in its `cli-command` check. See `{@command docs authoring/building-blocks/configuration/cli-command}`.",
    },
    {
      type: 'prose',
      text: 'A themes root is version-gated: an older CLI lists and adds none of its themes. Depending on its age, that CLI ignores `themes` with an `unknown_manifest_key` warning and loads every other contribution kind, reports the root as invalid because it expects the earlier `manifest.json` theme catalog, or, if it is old enough to treat an unknown field as an error, rejects the whole manifest, so the package contributes nothing there.',
    },
    {
      type: 'prose',
      text:
        'Validate the manifest with `{@command doctor integration validate}`. At the ' +
        'load boundary, a known field of the wrong type is an error, issuesUrl ' +
        'and docsiteUrl must be valid URLs, and unknown fields become warnings so an older CLI ' +
        'can still load the fields it understands. Before publishing, also run ' +
        '`templates`, `components`, and `docs` under the same `doctor integration` ' +
        'group. Those leaves compare authored identities with Core and explain ' +
        'whether an overlap is intentional or needs a rename.',
    },
  ],
};
