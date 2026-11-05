// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `summarizeIssues()` — the severity-tally helper paired
 * with `validateIntegration`. Colocated with the API function it documents; the
 * source of truth is the function in `validate-integration.mjs`.
 * @position packages/cli/api/integration — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'summarizeIssues',
  namespace: 'cli/api',
  displayName: 'summarizeIssues()',
  summary:
    'Tally integration issues by severity into error and warning counts.',
  description:
    'A synchronous helper that reduces an AstryxIntegrationIssue[] (as returned ' +
    'by validateIntegration) to counts of errors and warnings: the seam a ' +
    'caller uses to decide an exit code or print a summary line. Issues of any ' +
    'other severity are ignored.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'summarizeIssues(issues: AstryxIntegrationIssue[]): {errors: number, warnings: number}',
  keywords: ['integration', 'issues', 'summarize', 'count', 'severity'],
  params: [
    {
      name: 'issues',
      type: 'AstryxIntegrationIssue[]',
      description:
        'The issues to tally (e.g. `data.issues` from validateIntegration).',
      required: true,
    },
  ],
  returns: [
    {
      name: 'errors',
      type: 'number',
      description: 'Count of issues with severity "error".',
    },
    {
      name: 'warnings',
      type: 'number',
      description: 'Count of issues with severity "warning".',
    },
  ],
  examples: [
    {
      label: 'Tally issues',
      code: 'const {errors, warnings} = summarizeIssues(issues);',
    },
    {
      label: 'Gate on errors',
      code: 'const {errors} = summarizeIssues(result.data.issues);',
    },
  ],
  related: ['validateIntegration'],
};
