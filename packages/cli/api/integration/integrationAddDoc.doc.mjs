// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationAddDoc',
  namespace: 'cli/api',
  displayName: 'integrationAddDoc()',
  summary: 'Add a complete reference-doc contribution.',
  description:
    'Creates a valid generic topic, declares the docs root on first use, and supports an intentional replaces or extends relationship, or places the doc as a guide in a namespace of the package.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationAddDoc(name: string, options?: IntegrationAddDocOptions): Promise<IntegrationAddResponse>',
  keywords: ['integration', 'doc', 'topic', 'author', 'api'],
  params: [
    {
      name: 'name',
      type: 'string',
      description: 'URL-safe topic name.',
      required: true,
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Directory inside the integration package.',
    },
    {
      name: 'options.dryRun',
      type: 'boolean',
      description: 'Return the exact write plan without changing files.',
      default: 'false',
    },
    {
      name: 'options.replaces',
      type: 'string',
      description: 'Existing topic this topic replaces.',
    },
    {
      name: 'options.extends',
      type: 'string',
      description: 'Existing topic this topic extends.',
    },
    {
      name: 'options.parent',
      type: 'string',
      description:
        "Namespace of this package to place the doc in, as a guide in its `guides` slot; the namespace doc is written when missing, and package.json declares the CLI that reads it as an optional `@astryxdesign/cli` peer. Only valid for doc, and not with options.replaces or options.extends.",
    },
  ],
  returns: [
    {
      type: 'integration.add',
      description: 'The shared typed authoring receipt.',
    },
  ],
  examples: [
    {
      label: 'Add a replacement topic',
      code: "await integrationAddDoc('getting-started-meta', {replaces: 'getting-started'});",
    },
  ],
  command: 'integration add doc',
  related: ['integrationAdd', 'integrationPackCheck'],
};
