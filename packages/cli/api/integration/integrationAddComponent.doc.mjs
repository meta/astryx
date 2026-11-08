// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationAddComponent',
  namespace: 'cli/api',
  displayName: 'integrationAddComponent()',
  summary: 'Add a complete component contribution.',
  description:
    'Creates the same-stem component source and metadata pair, declares the components root on first use, preserves existing package allowlists, and publishes an exact source subpath when the package already has an exports map. Refuses with ERR_FILE_EXISTS when a component doc anywhere under the components root already uses the name.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationAddComponent(name: string, options?: IntegrationAddComponentOptions): Promise<IntegrationAddResponse>',
  keywords: ['integration', 'component', 'author', 'api', 'scaffold'],
  params: [
    {
      name: 'name',
      type: 'string',
      description: 'PascalCase component export name.',
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
  ],
  returns: [
    {
      type: 'integration.add',
      description: 'The shared typed authoring receipt.',
    },
  ],
  examples: [
    {
      label: 'Add a component',
      code: "await integrationAddComponent('AcmeWidget');",
    },
  ],
  command: 'integration add component',
  related: ['integrationAdd', 'integrationPackCheck'],
};
