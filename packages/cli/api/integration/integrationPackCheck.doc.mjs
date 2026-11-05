// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationPackCheck',
  namespace: 'cli/api',
  displayName: 'integrationPackCheck()',
  summary: 'Check an integration package the way npm will publish it.',
  description:
    "Validates the local integration, runs the package lifecycle, packs with npm, checks required files against npm's authoritative tarball list, extracts the real tarball into a scratch consumer, compares local and packed contribution inventories, and resolves every packed component through its documented public import to verify that module exports the component. A package that ships a namespace doc or a placed guide, or has a template that sets `replaces`, fails unless its `@astryxdesign/cli` peer range admits only CLIs that read them.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationPackCheck(options?: IntegrationPackCheckOptions): Promise<IntegrationPackCheckResponse>',
  keywords: ['verify', 'pack', 'publish', 'tarball', 'consumer'],
  params: [
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Directory inside the integration package.',
    },
  ],
  returns: [
    {
      type: 'integration.pack-check',
      description:
        'Package identity, tarball facts, local and packed inventories, and issues.',
    },
  ],
  examples: [
    {label: 'Check the local package', code: 'await integrationPackCheck();'},
  ],
  command: 'integration verify',
  related: ['integrationAdd', 'validateIntegration'],
};
