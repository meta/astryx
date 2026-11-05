// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationAddTemplate',
  namespace: 'cli/api',
  displayName: 'integrationAddTemplate()',
  summary: 'Add a complete page or block template contribution.',
  description:
    'Creates the same-stem template source and metadata pair, declares the templates root on first use, and publishes an exact source subpath when the package already has an exports map.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationAddTemplate(name: string, options?: IntegrationAddTemplateOptions): Promise<IntegrationAddResponse>',
  keywords: ['integration', 'template', 'page', 'block', 'author', 'api'],
  params: [
    {
      name: 'name',
      type: 'string',
      description: 'Lowercase kebab-case template id.',
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
      name: 'options.type',
      type: "'page' | 'block'",
      description: 'Template kind.',
      default: "'page'",
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
      label: 'Add a block',
      code: "await integrationAddTemplate('account-card', {type: 'block'});",
    },
  ],
  command: 'integration add template',
  related: ['integrationAdd', 'integrationPackCheck'],
};
