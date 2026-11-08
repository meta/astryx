// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationAddCodemod',
  namespace: 'cli/api',
  displayName: 'integrationAddCodemod()',
  summary: 'Add a safe identity codemod at an exact target version.',
  description:
    'Creates a non-throwing identity transform under the exact semver folder and declares the codemods root on first use.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationAddCodemod(name: string, options: IntegrationAddCodemodOptions): Promise<IntegrationAddResponse>',
  keywords: ['integration', 'codemod', 'upgrade', 'migration', 'author', 'api'],
  params: [
    {
      name: 'name',
      type: 'string',
      description: 'Lowercase kebab-case codemod id.',
      required: true,
    },
    {
      name: 'options.to',
      type: 'string',
      description: 'Exact target semver version.',
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
      label: 'Add a codemod',
      code: "await integrationAddCodemod('rename-status', {to: '1.2.0'});",
    },
  ],
  command: 'integration add codemod',
  related: ['integrationAdd', 'integrationPackCheck'],
};
