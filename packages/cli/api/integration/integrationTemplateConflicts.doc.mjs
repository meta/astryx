// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for integration template-conflict diagnostics.
 * @input The stable 0.6.x `integrationTemplateConflicts` API contract.
 * @output Generated CLI API reference metadata.
 * @position Consumer-facing documentation for the public authoring API.
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationTemplateConflicts',
  namespace: 'cli/api',
  displayName: 'integrationTemplateConflicts()',
  summary: 'Find integration template ids that also exist in Core.',
  description:
    'Loads one local or installed integration, compares its template ids with the ' +
    'built-in Core page and block templates, and returns non-blocking conflicts with ' +
    'the exact package-qualified CLI command required to keep an intentional overlap.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationTemplateConflicts(pkg?: string, options?: IntegrationAuthoringOptions): Promise<IntegrationTemplateConflictResponse>',
  keywords: ['integration', 'template', 'conflict', 'authoring', 'doctor'],
  params: [
    {
      name: 'pkg',
      type: 'string',
      description:
        'Installed integration package; omit to inspect the local package.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'Directory used to resolve the local or installed integration.',
    },
  ],
  returns: [
    {
      type: 'integration.template-conflicts',
      description:
        '`validated` (false when no integration manifest was found, so nothing was inspected and the empty conflict list carries no information), the integration identity, structural issues, and every Core template-id conflict with a package-qualified command.',
    },
  ],
  examples: [
    {
      label: 'Check the local integration',
      code: 'await integrationTemplateConflicts();',
    },
    {
      label: 'Check an installed integration',
      code: "await integrationTemplateConflicts('@acme/widgets');",
    },
  ],
  command: 'doctor integration templates',
  related: ['validateIntegration', 'template'],
};
