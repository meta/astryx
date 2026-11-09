// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for DiscoverSource, the function `astryx discover` calls to
 * learn which integrations a project could add.
 * @input The DiscoverSource type and the catalog types beside it (`type.ts`),
 *   which `parse.mjs` validates.
 * @output The `discover-source` section of `astryx docs authoring`.
 * @position packages/cli/authoring/discover — schema documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'discover-source',
  displayName: 'DiscoverSource',
  namespace: 'authoring',
  description:
    "A source for `{@command discover}`: an async function that returns a catalog of packages a project could add, their versions, and what each version adds. Set it as `discover` in astryx.config, or export it as `discover` from an integration manifest. Discover calls every source, the project one first, and then reads the official list the CLI carries; another source's entry for an official package is kept. A source that throws, runs past 30 seconds, or returns an invalid catalog never hides the others; discover then uses the last good answer that source gave for the same request, or reports the source as failed when it saved none. Discover only reads: it prints the command that adds a package and never runs it.",
  appliesTo:
    '`discover` in astryx.config.*, or the `discover` named export of astryx.integration.*',
  fields: [
    {
      name: 'context',
      type: 'DiscoverSourceContext',
      description: 'The one argument the source is called with.',
      required: true,
      fields: [
        {
          name: 'context.signal',
          type: 'AbortSignal',
          description: 'Aborted when the source runs past 30 seconds.',
          required: true,
        },
        {
          name: 'context.package',
          type: 'string',
          description:
            'Set when discover shows one package: return that package with every version.',
        },
        {
          name: 'context.version',
          type: 'string',
          description:
            "With `package`: return that version's contributions. Without it, the latest release's.",
        },
      ],
    },
    {
      name: 'returns',
      type: 'Promise<DiscoverCatalog>',
      description:
        'The catalog. Discover checks it, ignores fields and item kinds it does not know, and refuses any schemaVersion but 1.',
      required: true,
      fields: [
        {
          name: 'schemaVersion',
          type: '1',
          description: 'Version of the catalog shape.',
          required: true,
        },
        {
          name: 'source',
          type: '{name: string, generatedAt: string, complete: boolean}',
          description:
            'Who answered, when the data was produced (ISO 8601), and false when the source knows its list is partial.',
          required: true,
        },
        {
          name: 'packages',
          type: 'DiscoverPackage[]',
          description:
            'One entry per npm package. When two sources list the same package, the earlier source wins.',
          required: true,
          fields: [
            {
              name: 'packages[].package',
              type: 'string',
              description: 'The npm name.',
              required: true,
            },
            {
              name: 'packages[].integration',
              type: 'string',
              description:
                'Shared by every npm name that publishes the same integration. Discover lists an integration once.',
              required: true,
            },
            {
              name: 'packages[].aliases',
              type: 'string[]',
              description:
                "The integration's other npm names. Discover never offers a package the project has under another name.",
              required: true,
            },
            {
              name: 'packages[].description',
              type: 'string',
              description: 'One line, for the list and search.',
            },
            {
              name: 'packages[].latest',
              type: 'string | null',
              description: 'The latest release. Null when there are only prereleases.',
              required: true,
            },
            {
              name: 'packages[].versions',
              type: 'DiscoverVersion[]',
              description:
                'Every version, newest first: `{version, publishedAt, prerelease, status}`, where status is `ok` or why the version could not be read.',
              required: true,
            },
            {
              name: 'packages[].contributions',
              type: 'DiscoverContribution[]',
              description:
                "What the requested (else latest) version adds: `{kind, name, title?, summary?, keywords?}`, where kind is `component`, `template`, `doc`, `theme`, `codemod`, or `agent-doc` (a DiscoverKind) and name is the name the CLI uses for it.",
              required: true,
            },
          ],
        },
      ],
    },
  ],
  examples: [
    {
      label: 'A project source in astryx.config',
      code:
        'export default {\n' +
        '  async discover({signal, package: name, version}) {\n' +
        '    const res = await fetch(catalogUrl(name, version), {signal});\n' +
        '    return res.json();\n' +
        '  },\n' +
        '};',
    },
  ],
  notes: [
    {
      type: 'prose',
      text: "In global mode: the discover source of an integration installed for the computer is called in folders outside any project; inside a project, only the sources of integrations the project installs are. See {@link namespace:global} and {@link generic:global-integrations}.",
    },
  ],
};
