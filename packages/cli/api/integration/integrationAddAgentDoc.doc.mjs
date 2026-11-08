// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationAddAgentDoc',
  namespace: 'cli/api',
  displayName: 'integrationAddAgentDoc()',
  summary: 'Append one validated agent-guidance line.',
  description:
    'Converges the integration manifest to contain the literal guidance line exactly once while preserving comments and refusing malformed existing state.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationAddAgentDoc(line: string, options?: IntegrationAddAgentDocOptions): Promise<IntegrationAddResponse>',
  keywords: ['integration', 'agent', 'guidance', 'author', 'api'],
  params: [
    {
      name: 'line',
      type: 'string',
      description: 'Literal guidance line to append.',
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
      label: 'Add agent guidance',
      code: "await integrationAddAgentDoc('Use AcmeWidget for account status.');",
    },
  ],
  command: 'integration add agent-doc',
  related: ['integrationAdd', 'integrationPackCheck'],
};
